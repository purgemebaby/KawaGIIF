/* Window manager. Creates the control window and the fixed pool of transparent overlay windows at startup,
and moves, shows, hides and restyles the overlays when animations are placed or removed. */
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::webview::Color;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

#[cfg(windows)]
use crate::native::windows as native;

pub const MAX_POOL: u32 = 20;
pub const HANDLE_MARGIN: u32 = 32; // logical px of transparent room on every side of the media
pub const CONTROL_LABEL: &str = "control";
/** Set while a dropped overlay eases back to the screen edge, so the `Moved` clamp doesn't jump it there first. */
pub static SLIDING: AtomicBool = AtomicBool::new(false);
const OV_LABEL: &str = "OV-SLOT-";
const KEEPER_INTERVAL: Duration = Duration::from_secs(2);
const KEEPER_FULLSCREEN_INTERVAL: Duration = Duration::from_millis(250); // a borderless game that goes topmost buries the overlays within this
const CARRY_TICK: Duration = Duration::from_millis(8); // about 120 moves per second while an overlay is carried
const CONTROL_BASE: (f64, f64) = (960.0, 640.0);
const MIN_CONTROL: (f64, f64) = CONTROL_BASE; // the opening size is also the smallest (a smaller monitor still caps it)
/** (x, y, width, height, scale factor bits). */
type MonitorKey = (i32, i32, u32, u32, u64);

static FITTED_AREA: Mutex<Option<MonitorKey>> = Mutex::new(None);
const MAX_CONTROL: (f64, f64) = (1700.0, 1056.0);

const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --process-per-site --enable-gpu-rasterization --enable-zero-copy --ignore-gpu-blocklist";

static CARRIED_SLOT: AtomicUsize = AtomicUsize::new(usize::MAX); // the overlay hanging from the cursor



/** Number of overlay windows on screen*/
pub fn pool_size() -> usize {
    static SIZE: OnceLock<usize> = OnceLock::new();
    *SIZE.get_or_init(|| crate::config::load().overlay_pool_size.clamp(1, MAX_POOL) as usize)
}

fn slot_labels() -> &'static [String] {
    static LABELS: OnceLock<Vec<String>> = OnceLock::new();
    LABELS.get_or_init(|| (0..pool_size()).map(|slot| format!("{OV_LABEL}{slot}")).collect())
}

pub fn slot_label(slot: usize) -> &'static str { slot_labels().get(slot).map_or("", String::as_str) }

pub fn slot_from_label(label: &str) -> Option<usize> { label.strip_prefix(OV_LABEL)?.parse().ok() }

pub fn slot_window(app: &AppHandle, slot: usize) -> Option<WebviewWindow> { app.get_webview_window(slot_labels().get(slot)?) }

pub fn overlay_windows(app: &AppHandle) -> impl Iterator<Item = WebviewWindow> + '_ {
    slot_labels().iter().filter_map(|label| app.get_webview_window(label))
}

fn reapply_overlay_style(window: &WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        native::force_hide_taskb(hwnd);
        native::force_borderless(hwnd);
        native::disable_dwm_focus_border(hwnd);
        native::force_layered(hwnd);
        native::force_clearbg(hwnd);
    }
    let _ = window.set_always_on_top(true);
}

fn raise(window: Option<WebviewWindow>) {
    #[cfg(windows)]
    if let Some(hwnd) = window.and_then(|w| w.hwnd().ok()) {
        native::top_everything(hwnd);
    }
    #[cfg(not(windows))]
    let _ = window;
}

/**
 * Raises the control window first (while edit mode keeps it topmost), then every visible overlay above it, so the editor
 * never loses sight of them. Needed because tao only calls `SetWindowPos` when the always-on-top flag changes, so the
 * taskbar (also topmost) stays above overlays until one is raised explicitly. `restyle` re-forces the styles first
 * (`force_borderless` redraws the frame).
 */
fn raise_visible_overlays(app: &AppHandle, restyle: bool) {
    if let Some(control) = app.get_webview_window(CONTROL_LABEL).filter(|c| c.is_always_on_top().unwrap_or(false)) {
        raise(Some(control));
    }
    for window in overlay_windows(app).filter(|w| w.is_visible().unwrap_or(false)) {
        if restyle { reapply_overlay_style(&window); }
        raise(Some(window));
    }
    // the carried overlay stays above everything, the control window included, or it flickers behind it
    let carried: usize = CARRIED_SLOT.load(Ordering::Relaxed);
    if carried != usize::MAX { raise(slot_window(app, carried)); }
}

/** Raises the overlays above the control window once the window changes queued so far (tao's `set_always_on_top`) are applied. */
pub fn raise_overlays_above_control(app: &AppHandle) {
    let Some(control) = app.get_webview_window(CONTROL_LABEL) else { return; };
    let handle = app.clone();
    after_queued(&control, move |_| raise_visible_overlays(&handle, false));
}

/** Keeps an overlay's media inside the whole rectangle of its monitor (taskbar included, on purpose): the window itself may overhang it by `HANDLE_MARGIN`, which is transparent. Returns `true` if it moved. */
pub fn clamp_to_work_area(window: &WebviewWindow) -> bool {
    #[cfg(windows)]
    {
        let Ok(hwnd) = window.hwnd() else { return false; };
        let Some((wx, wy, ww, wh)) = native::force_work_area(hwnd) else { return false; };
        let (Ok(pos), Ok(size), Ok(scale)) = (window.outer_position(), window.outer_size(), window.scale_factor()) else { return false; };
        let inset = (f64::from(HANDLE_MARGIN) * scale).round() as i32;

        let x = pos.x.min(wx + ww - size.width as i32 + inset).max(wx - inset);
        let y = pos.y.min(wy + wh - size.height as i32 + inset).max(wy - inset);
        if (x, y) != (pos.x, pos.y) {
            let _ = window.set_position(PhysicalPosition::new(x, y));
            return true;
        }
    }
    #[cfg(not(windows))]
    let _ = window;
    false
}

/** Moves and resizes a window in one step (physical px). */
pub fn place(window: &WebviewWindow, x: i32, y: i32, width: u32, height: u32) -> tauri::Result<()> {
    window.set_size(PhysicalSize::new(width, height))?;
    window.set_position(PhysicalPosition::new(x, y))?;
    Ok(())
}

/** Resizes a window while keeping its centre, so the media inside scales about itself instead of its top-left corner. */
pub fn resize_keeping_centre(window: &WebviewWindow, width: u32, height: u32) -> tauri::Result<()> {
    let pos = window.outer_position()?;
    let size = window.outer_size()?;
    let x = pos.x + (size.width as i32 - width as i32) / 2;
    let y = pos.y + (size.height as i32 - height as i32) / 2;
    place(window, x, y, width, height)
}

/**
 * Runs `fix` on the main thread after every window change queued so far. Tauri window setters called off the main
 * thread are queued, while our Win32 calls run at once, so a fix called right after them ran *before* them and tao
 * then undid it (frame visible until the keeper's next pass).
 */
fn after_queued(window: &WebviewWindow, fix: impl FnOnce(&WebviewWindow) + Send + 'static) {
    let target = window.clone();
    let _ = window.run_on_main_thread(move || fix(&target));
}

/**
 * Turns click-through on or off for an overlay. Use this instead of `set_ignore_cursor_events` alone.
 * Tauri drops `WS_EX_LAYERED` when turning it off (opaque grey frame) and re-adds `WS_CAPTION` (white strip on
 * activation), so `force_layered` and `force_borderless` restore them once that change has been applied.
 */
pub fn set_overlay_click_through(window: &WebviewWindow, enabled: bool) {
    let _ = window.set_ignore_cursor_events(enabled);
    after_queued(window, |window| {
        #[cfg(windows)]
        if let Ok(hwnd) = window.hwnd() {
            native::force_layered(hwnd);
            native::force_borderless(hwnd);
        }
        #[cfg(not(windows))]
        let _ = window;
    });
}

/**
 * Puts a hidden window's webview (an overlay or the control window) to sleep, or wakes it (`native::set_webview_dormant`).
 * WebView2 is only reachable on the main thread, so `still_wanted` is checked there, when the work runs: the slot may
 * have been reassigned meanwhile and a late sleep must be dropped.
 */
pub fn set_slot_dormant(window: &WebviewWindow, dormant: bool, still_wanted: impl FnOnce() -> bool + Send + 'static) {
    #[cfg(windows)]
    {
        let _ = window.with_webview(move |webview| {
            if still_wanted() {
                native::set_webview_dormant(&webview.controller(), dormant);
            }
        });
    }
}

/** Dev-only log of memory use and of the visible overlays, printed at state transitions. */
#[cfg(debug_assertions)]
pub fn log_overlay_state(app: &AppHandle, moment: &str) {
    println!("[kawagiif] --- overlays: {moment} ---");
    let breakdown = crate::system_stats::debug_memory_breakdown(app.state());
    for line in breakdown.lines() {
        println!("[kawagiif] {line}");
    }
    for window in overlay_windows(app).filter(|w| w.is_visible().unwrap_or(false)) {
        #[cfg(windows)]
        let styles: String = window.hwnd().map(native::style_flags).unwrap_or_default();
        #[cfg(not(windows))]
        let styles: String = String::new();
        println!(
            "[kawagiif]   {}: pos={:?} size={:?} styles={styles}",
            window.label(),
            window.outer_position().map(|p| (p.x, p.y)).ok(),
            window.inner_size().map(|s| (s.width, s.height)).ok(),
        );
    }
}

#[cfg(not(debug_assertions))]
pub fn log_overlay_state(_app: &AppHandle, _moment: &str) {}



// Startup
/** Creates the control window hidden (`setup()` shows it) with the saved zoom. Not transparent, so the `WS_EX_LAYERED` issue doesn't apply. */
pub fn create_control_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, CONTROL_LABEL, WebviewUrl::App("index.html".into()))
        .additional_browser_args(BROWSER_ARGS)
        .title("KawaGiif")
        .inner_size(CONTROL_BASE.0, CONTROL_BASE.1)
        .center()
        .min_inner_size(MIN_CONTROL.0, MIN_CONTROL.1)
        .max_inner_size(MAX_CONTROL.0, MAX_CONTROL.1)
        .maximizable(false) // the owner keeps it at a chosen size. Resizing by the edges still works
        .decorations(true)
        .transparent(false)
        .resizable(true)
        .visible(false)
        .build()?;
    // a failed zoom must not stop startup: the window just opens at 100 %
    let _ = window.set_zoom(f64::from(crate::config::load().ui_zoom));
    fit_control_to_monitor(&window);
    Ok(window)
}

/**
 * Caps the control window's size limits to the work area of the monitor it is on (a small TV can't hold `MAX_CONTROL`),
 * and shrinks it back onto that monitor when it no longer fits. Called at startup and whenever the window moves.
 */
pub fn fit_control_to_monitor(window: &WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else { return; };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    // a drag fires dozens of `Moved` per second, and every new size limit makes tao re-apply the size
    let key = (area.position.x, area.position.y, area.size.width, area.size.height, scale.to_bits());
    let mut fitted = FITTED_AREA.lock().unwrap_or_else(|e| e.into_inner());
    if *fitted == Some(key) { return; }
    *fitted = Some(key);
    drop(fitted);

    let (Ok(outer), Ok(inner), Ok(pos)) = (window.outer_size(), window.inner_size(), window.outer_position()) else { return; };
    // the title bar and borders have to fit too
    let (frame_w, frame_h) = (outer.width.saturating_sub(inner.width), outer.height.saturating_sub(inner.height));
    let room_w = area.size.width.saturating_sub(frame_w);
    let room_h = area.size.height.saturating_sub(frame_h);
    let cap = |logical: f64, room: u32| ((logical * scale).round() as u32).min(room);
    let max = PhysicalSize::new(cap(MAX_CONTROL.0, room_w), cap(MAX_CONTROL.1, room_h));
    let _ = window.set_min_size(Some(PhysicalSize::new(cap(MIN_CONTROL.0, room_w), cap(MIN_CONTROL.1, room_h))));
    let _ = window.set_max_size(Some(max));
    if inner.width <= max.width && inner.height <= max.height { return; }

    let (width, height) = (inner.width.min(max.width), inner.height.min(max.height));
    let last_x = area.position.x + (room_w - width) as i32;
    let last_y = area.position.y + (room_h - height) as i32;
    let _ = place(window, pos.x.min(last_x).max(area.position.x), pos.y.min(last_y).max(area.position.y), width, height);
}

/**
 * Creates all `pool_size()` overlay windows, hidden, during `setup()`: a `transparent(true)` window created later is
 * born without `WS_EX_LAYERED` (opaque white), so placing an animation reuses a free pool window instead.
 *
 * Builder options that look optional but aren't:
 * - `overlay.html`: every window is its own renderer process, so it must not load the control bundle.
 * - `shadow(false)`: otherwise an undecorated window gets a 1px white border and a hidden frame offset.
 * - `background_color` alpha 0: Windows only honours the webview background alpha when it is exactly 0.
 * - `window_classname`: our own class, so `force_clearbg` doesn't touch the control window's brush.
 */
pub fn create_overlay_pool(app: &AppHandle) -> tauri::Result<()> {
    for (slot, label) in slot_labels().iter().enumerate() {
        let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("overlay.html".into()))
            .additional_browser_args(BROWSER_ARGS)
            .title("")
            .position(0.0, 0.0)
            .inner_size(200.0, 200.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .background_color(Color(0, 0, 0, 0))
            .window_classname("KawaGiifOverlay")
            .visible(false)
            .build()?;

        set_overlay_click_through(&window, true);
        reapply_overlay_style(&window);
        #[cfg(windows)]
        if let Ok(hwnd) = window.hwnd() { native::guard_non_client(hwnd, HANDLE_MARGIN); }
        watch_overlay_events(app, &window, slot);
    }
    Ok(())
}

/** The keeper's next sleep and whether it raises this pass, from what the foreground window does to the screen. */
#[cfg(windows)]
fn keeper_plan() -> (Duration, bool) {
    match native::foreground_fullscreen() {
        native::Fullscreen::Borderless => (KEEPER_FULLSCREEN_INTERVAL, true),
        native::Fullscreen::Exclusive => (KEEPER_INTERVAL, false),
        native::Fullscreen::None => (KEEPER_INTERVAL, true),
    }
}

#[cfg(not(windows))]
fn keeper_plan() -> (Duration, bool) { (KEEPER_INTERVAL, true) }

/**
 * Restyles and re-raises the visible overlays (`raise_visible_overlays`) so a topmost app cannot bury click-through overlays
 * that never get focus. No fullscreen app: every `KEEPER_INTERVAL`. Borderless fullscreen game: every `KEEPER_FULLSCREEN_INTERVAL`,
 * since it may re-raise itself. Exclusive fullscreen: no raise (nothing can show over it. Raising only forces DWM back into
 * compositing). Window calls run on the main thread. The loop ends when the event loop is gone.
 */
pub fn spawn_topmost_keeper(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let mut interval = KEEPER_INTERVAL;
        // restyling redraws the frames (`SWP_FRAMECHANGED`): the fast fullscreen passes only raise, one in `KEEPER_INTERVAL` restyles
        let mut since_restyle = KEEPER_INTERVAL;
        loop {
            std::thread::sleep(interval);
            since_restyle += interval;
            let (next, raise) = keeper_plan();
            interval = next;
            if !raise { continue; }
            let restyle = since_restyle >= KEEPER_INTERVAL;
            if restyle { since_restyle = Duration::ZERO; }
            let handle = app.clone();
            if app.run_on_main_thread(move || raise_visible_overlays(&handle, restyle)).is_err() { break; }
        }
    });
}

/**
 * Instant re-raise every time another app takes the foreground (taskbar click, Start, a game). Raise only: restyling on
 * every focus change would redraw the frames (`SWP_FRAMECHANGED`) and risk flicker. The keeper restyles.
 * A second hook also sees our own windows taking the foreground, so editing resumes when the app returns to the front,
 * and the overlays go back above the control window that a click on it just raised.
 */
pub fn watch_foreground_changes(app: &AppHandle) {
    #[cfg(windows)]
    {
        let raising = app.clone();
        native::watch_foreground(move || {
            if native::foreground_fullscreen() != native::Fullscreen::Exclusive { raise_visible_overlays(&raising, false); }
        });
        let editing = app.clone();
        native::watch_any_foreground(move || {
            crate::template::refresh_edit_activity_soon(&editing);
            raise_overlays_above_control(&editing);
        });
    }
    #[cfg(not(windows))]
    let _ = app;
}

/** Removes the hooks of `watch_foreground_changes`. */
pub fn stop_watching_foreground_changes() {
    #[cfg(windows)]
    native::unwatch_foreground();
}

/**
 * Hooks an overlay's window events: `Focused` re-forces the styles (Tauri redoes its `skip_taskbar` fix). `Moved`/
 * `Resized` store the geometry in the template. `Moved` also clamps to the monitor (the corrective `Moved` needs no
 * correction, so no loop). A drag is constrained by the subclass's `WM_MOVING` clamp, so this covers programmatic moves.
 */
fn watch_overlay_events(app: &AppHandle, window: &WebviewWindow, slot: usize) {
    let app = app.clone();
    let this = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(_) => reapply_overlay_style(&this),
        WindowEvent::Moved(pos) => {
            if SLIDING.load(Ordering::Relaxed) || is_carried(slot) || !clamp_to_work_area(&this) { crate::template::update_slot_geometry(&app, slot, Some((pos.x, pos.y)), None); }
        }
        WindowEvent::Resized(size) => crate::template::update_slot_geometry(&app, slot, None, Some((size.width, size.height))),
        _ => {}
    });
}



// Control window
/** Hides the control window and puts its webview to sleep: hidden, it still costs ~155 MB (docs/profiling.md). */
pub fn hide_control(app: &AppHandle) {
    let Some(control) = app.get_webview_window(CONTROL_LABEL) else { return; };
    let _ = control.hide();
    let check = control.clone();
    set_slot_dormant(&control, true, move || !check.is_visible().unwrap_or(false)); // shown again meanwhile → stay awake
    let handle = app.clone();
    after_queued(&control, move |_| crate::template::refresh_edit_activity(&handle));
}

/** Wakes the control window's webview, then shows, restores and focuses it. */
pub fn show_control(app: &AppHandle) {
    let Some(control) = app.get_webview_window(CONTROL_LABEL) else { return; };
    set_slot_dormant(&control, false, || true);
    let _ = control.show();
    let _ = control.unminimize();
    let _ = control.set_focus();
    let handle = app.clone();
    after_queued(&control, move |_| crate::template::refresh_edit_activity(&handle));
}

/** Whether the control window is on screen: visible and not minimized. */
pub fn control_is_open(app: &AppHandle) -> bool {
    app.get_webview_window(CONTROL_LABEL).is_some_and(|c| c.is_visible().unwrap_or(false) && !c.is_minimized().unwrap_or(false))
}

/** Whether one of our windows is the foreground one (always true off Windows, where nothing tracks it). */
pub fn app_is_foreground() -> bool {
    #[cfg(windows)]
    return native::foreground_is_ours();
    #[cfg(not(windows))]
    true
}



// Slot Commands
/**
 * Moves, sizes and shows the pool window of `slot` (this is what "places" an animation). Geometry is physical pixels,
 * like `Moved`/`Resized`. Styles are reapplied because tao leaves `WS_EX_APPWINDOW`/`WS_EX_WINDOWEDGE` on new windows.
 * the clamp covers old templates placed over the taskbar. A free slot may be asleep, so it is woken first.
 */
pub fn show_slot(
    app: &AppHandle, slot: usize, x: i32, y: i32, width: u32, height: u32, interactive: bool,
) -> crate::error::AppResult<()> {
    let window = slot_window(app, slot).ok_or(crate::error::AppError::MissingSlotWindow(slot))?;

    set_slot_dormant(&window, false, || true);
    place(&window, x, y, width, height)?;
    set_overlay_click_through(&window, !interactive);
    window.show()?;

    after_queued(&window, |window| {
        reapply_overlay_style(window);
        raise(Some(window.clone()));
        clamp_to_work_area(window);
    });
    Ok(())
}

pub fn hide_slot(app: &AppHandle, slot: usize) {
    if let Some(window) = slot_window(app, slot) {
        set_overlay_click_through(&window, true);
        let _ = window.hide();
    }
}

pub fn hide_all_overlay_slots(app: &AppHandle) {
    for window in overlay_windows(app) {
        set_overlay_click_through(&window, true);
        let _ = window.hide();
    }
}

pub fn reassert_slot_style(app: &AppHandle, slot: usize) {
    if let Some(window) = slot_window(app, slot) { after_queued(&window, reapply_overlay_style); }
}

/**
 * Keeps an overlay hanging from the cursor (centred, `grip_y` below its top edge) while the primary button stays down,
 * then calls `on_drop`. Used instead of `startDragging`: Windows' modal move loop blocks the main thread, so the overlay
 * never got the `Moved` events its swing needs. Runs on its own thread and holds no lock.
 */
pub fn carry_with_cursor(app: &AppHandle, slot: usize, grip_y: i32, on_drop: impl FnOnce() + Send + 'static) {
    let app = app.clone();
    std::thread::spawn(move || {
        let Some(window) = slot_window(&app, slot) else { return; };
        CARRIED_SLOT.store(slot, Ordering::Relaxed);
        raise(Some(window.clone()));
        let mut last: Option<(i32, i32)> = None;
        while primary_button_down() {
            if let (Ok(cursor), Ok(size)) = (app.cursor_position(), window.outer_size()) {
                let pos: (i32, i32) = (cursor.x.round() as i32 - size.width as i32 / 2, cursor.y.round() as i32 - grip_y);
                if last != Some(pos) {
                    let _ = window.set_position(PhysicalPosition::new(pos.0, pos.1));
                    last = Some(pos);
                }
            }
            std::thread::sleep(CARRY_TICK);
        }
        CARRIED_SLOT.store(usize::MAX, Ordering::Relaxed);
        on_drop();
    });
}

/** Whether `slot` is the overlay hanging from the cursor right now (it goes anywhere until the drop). */
pub fn is_carried(slot: usize) -> bool { CARRIED_SLOT.load(Ordering::Relaxed) == slot }

fn primary_button_down() -> bool {
    #[cfg(windows)]
    return native::primary_button_down();
    #[cfg(not(windows))]
    false
}
