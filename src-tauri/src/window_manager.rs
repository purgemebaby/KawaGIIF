/* Window manager. Creates the control window and the fixed pool of transparent overlay windows at startup,
and moves, shows, hides and restyles the overlays when animations are placed or removed. */
use std::sync::OnceLock;
use std::time::Duration;
use tauri::webview::Color;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

#[cfg(windows)]
use crate::native::windows as native;

/* Personal Note for me:
- std::sync::OnceLock: a value computed once on first use, then reused; here, the pool size and labels.
- tauri::webview::Color: an RGBA color; alpha 0 makes the web page background see-through.
- tauri::WindowEvent: what happened to a window (moved, resized, focused, ...).
- crate::native::windows (only on Windows): our raw Win32 calls for what Tauri can't do reliably.
*/



pub const CONTROL_LABEL: &str = "control";
const OV_LABEL: &str = "OV-SLOT-";
pub const MAX_POOL: u32 = 20;
const KEEPER_INTERVAL: Duration = Duration::from_secs(2);
//every webview shares one WebView2 environment, so they must all get the same args; the first part is wry's default
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --process-per-site";



/** Number of overlay windows = max animations on screen. Read once: the pool is built in `setup()`, so changes apply on restart. */
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

/**
 * Forces the Win32 styles an overlay needs (no taskbar/Alt+Tab entry, no frame, no DWM border, layered, no class brush).
 * Tauri resets them on its own and click-through overlays never get focus, so this runs on creation, `show_slot`,
 * `Focused`, edit-mode changes and from the keeper.
 */
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
 * Raises every visible overlay to the top of the topmost band, then the control window last while edit mode keeps it
 * topmost. Needed because tao only calls `SetWindowPos` when the always-on-top flag changes, so the taskbar (also topmost)
 * stays above overlays until one is raised explicitly. `restyle` re-forces the styles first (`force_borderless` redraws the frame).
 */
fn raise_visible_overlays(app: &AppHandle, restyle: bool) {
    for window in overlay_windows(app).filter(|w| w.is_visible().unwrap_or(false)) {
        if restyle { reapply_overlay_style(&window); }
        raise(Some(window));
    }
    if let Some(control) = app.get_webview_window(CONTROL_LABEL).filter(|c| c.is_always_on_top().unwrap_or(false)) {
        raise(Some(control));
    }
}

/** Keeps an overlay inside the whole rectangle of its monitor (taskbar included, on purpose). Returns `true` if it moved. */
pub fn clamp_to_work_area(window: &WebviewWindow) -> bool {
    #[cfg(windows)]
    {
        let Ok(hwnd) = window.hwnd() else { return false; };
        let Some((wx, wy, ww, wh)) = native::force_work_area(hwnd) else { return false; };
        let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else { return false; };

        let x = pos.x.min(wx + ww - size.width as i32).max(wx);
        let y = pos.y.min(wy + wh - size.height as i32).max(wy);
        if (x, y) != (pos.x, pos.y) {
            let _ = window.set_position(PhysicalPosition::new(x, y));
            return true;
        }
    }
    #[cfg(not(windows))]
    let _ = window;
    false
}

/**
 * Turns click-through on or off for an overlay; use this instead of `set_ignore_cursor_events` alone.
 * Tauri drops `WS_EX_LAYERED` when turning it off (opaque grey frame) and re-adds `WS_CAPTION` (white strip on
 * activation), so `force_layered` and `force_borderless` restore them right after.
 */
pub fn set_overlay_click_through(window: &WebviewWindow, enabled: bool) {
    let _ = window.set_ignore_cursor_events(enabled);
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        native::force_layered(hwnd);
        native::force_borderless(hwnd);
    }
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
    #[cfg(not(windows))]
    let _ = (window, dormant, still_wanted);
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
/** Creates the control window hidden (`setup()` shows it). Not transparent, so the `WS_EX_LAYERED` issue doesn't apply. */
pub fn create_control_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, CONTROL_LABEL, WebviewUrl::App("index.html".into()))
        .additional_browser_args(BROWSER_ARGS)
        .title("KawaGiif")
        .inner_size(960.0, 640.0)
        .min_inner_size(720.0, 480.0)
        .decorations(true)
        .transparent(false)
        .resizable(true)
        .visible(false)
        .build()
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
        if let Ok(hwnd) = window.hwnd() { native::guard_non_client(hwnd); }
        watch_overlay_events(app, &window, slot);
    }
    Ok(())
}

/**
 * Restyles and re-raises the visible overlays every `KEEPER_INTERVAL` (`raise_visible_overlays`): click-through overlays
 * never get focus, so a borderless game going topmost would bury them (exclusive fullscreen is out of reach). A topmost app that
 * re-raises itself constantly can still win for up to one interval. Window calls run on the main thread; the loop ends
 * when the event loop is gone.
 */
pub fn spawn_topmost_keeper(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(KEEPER_INTERVAL);
        let handle = app.clone();
        if app.run_on_main_thread(move || raise_visible_overlays(&handle, true)).is_err() { break; }
    });
}

/**
 * Instant re-raise every time another app takes the foreground (taskbar click, Start, a game). Raise only: restyling on
 * every focus change would redraw the frames (`SWP_FRAMECHANGED`) and risk flicker; the keeper restyles.
 */
pub fn watch_foreground_changes(app: &AppHandle) {
    #[cfg(windows)]
    {
        let app = app.clone();
        native::watch_foreground(move || raise_visible_overlays(&app, false));
    }
    #[cfg(not(windows))]
    let _ = app;
}

/** Removes the hook of `watch_foreground_changes`. */
pub fn stop_watching_foreground_changes() {
    #[cfg(windows)]
    native::unwatch_foreground();
}

/**
 * Hooks an overlay's window events: `Focused` re-forces the styles (Tauri redoes its `skip_taskbar` fix); `Moved` clamps
 * to the monitor (Windows runs the drag, so it can only be corrected afterwards; the corrective `Moved` needs no
 * correction, so no loop); `Moved`/`Resized` store the geometry in the template.
 */
fn watch_overlay_events(app: &AppHandle, window: &WebviewWindow, slot: usize) {
    let app = app.clone();
    let this = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Focused(_) => reapply_overlay_style(&this),
        WindowEvent::Moved(pos) => {
            if !clamp_to_work_area(&this) {
                crate::template::update_slot_geometry(&app, slot, Some((pos.x, pos.y)), None);
            }
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
    set_slot_dormant(&control, true, move || !check.is_visible().unwrap_or(false)); //shown again meanwhile → stay awake
}

/** Wakes the control window's webview, then shows and focuses it. */
pub fn show_control(app: &AppHandle) {
    let Some(control) = app.get_webview_window(CONTROL_LABEL) else { return; };
    set_slot_dormant(&control, false, || true);
    let _ = control.show();
    let _ = control.set_focus();
}



// Slot Commands
/**
 * Moves, sizes and shows the pool window of `slot` (this is what "places" an animation). Geometry is physical pixels,
 * like `Moved`/`Resized`. Styles are reapplied because tao leaves `WS_EX_APPWINDOW`/`WS_EX_WINDOWEDGE` on new windows;
 * the clamp covers old templates placed over the taskbar. A free slot may be asleep, so it is woken first.
 */
pub fn show_slot(
    app: &AppHandle, slot: usize, x: i32, y: i32, width: u32, height: u32, interactive: bool,
) -> crate::error::AppResult<()> {
    let window = slot_window(app, slot).ok_or(crate::error::AppError::MissingSlotWindow(slot))?;

    set_slot_dormant(&window, false, || true);
    window.set_position(PhysicalPosition::new(x, y))?;
    window.set_size(PhysicalSize::new(width, height))?;
    set_overlay_click_through(&window, !interactive);
    window.show()?;

    reapply_overlay_style(&window);
    raise(Some(window.clone()));
    clamp_to_work_area(&window);
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

pub fn raise_slot(app: &AppHandle, slot: usize) { raise(slot_window(app, slot)); }

pub fn raise_control(app: &AppHandle) { raise(app.get_webview_window(CONTROL_LABEL)); }

pub fn reassert_slot_style(app: &AppHandle, slot: usize) {
    if let Some(window) = slot_window(app, slot) { reapply_overlay_style(&window); }
}
