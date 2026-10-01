// Window manager.
// Creates the control window and the fixed pool of transparent overlay
// windows at startup, and moves, shows, hides and restyles the overlays
// when animations are placed or removed.

use std::sync::OnceLock;
use std::time::Duration;
use tauri::webview::Color;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

#[cfg(windows)]
use crate::native::windows as native;

/* Personal Note for me:
- std (the standard library):
    - sync::OnceLock: a value computed once on first use, then reused; here, the pool size and labels.
    - time::Duration: a length of time, for the 2-second keeper loop.
- tauri: the app framework.
    - webview::Color: an RGBA color; alpha 0 makes the web page background see-through.
    - AppHandle: handle to the running app, used to find windows by label.
    - Manager: trait that adds `get_webview_window` and `state` to AppHandle.
    - PhysicalPosition / PhysicalSize: positions and sizes in real screen pixels.
    - WebviewUrl: which page a window loads (`index.html` or `overlay.html`).
    - WebviewWindow: one native window with a web page inside.
    - WebviewWindowBuilder: sets up a window's options before creating it.
    - WindowEvent: what happened to a window (moved, resized, focused, ...).
- crate::native::windows (only on Windows): our raw Win32 calls for what Tauri can't do reliably.
*/

pub const CONTROL_LABEL: &str = "control";
pub const OV_LABEL: &str = "OV-SLOT-";
pub const MAX_POOL: u32 = 20;
const KEEPER_INTERVAL: Duration = Duration::from_secs(2);

/**
 * How many overlay windows are created at startup, which is also the
 * maximum number of animations on screen at once. It's read once, because
 * the pool can only be built during `setup()`: a changed setting applies on
 * the next launch.
 */
pub fn pool_size() -> usize {
    static SIZE: OnceLock<usize> = OnceLock::new();
    *SIZE.get_or_init(|| crate::config::load().overlay_pool_size.clamp(1, MAX_POOL) as usize)
}

fn slot_labels() -> &'static [String] {
    static LABELS: OnceLock<Vec<String>> = OnceLock::new();
    LABELS.get_or_init(|| {
        (0..pool_size())
            .map(|slot| format!("{OV_LABEL}{slot}"))
            .collect()
    })
}

pub fn slot_label(slot: usize) -> &'static str {
    slot_labels().get(slot).map_or("", String::as_str)
}

pub fn slot_from_label(label: &str) -> Option<usize> {
    label.strip_prefix(OV_LABEL)?.parse().ok()
}

pub fn slot_window(app: &AppHandle, slot: usize) -> Option<WebviewWindow> {
    app.get_webview_window(slot_labels().get(slot)?)
}

pub fn overlay_windows(app: &AppHandle) -> impl Iterator<Item = WebviewWindow> + '_ {
    slot_labels()
        .iter()
        .filter_map(|label| app.get_webview_window(label))
}

/**
 * Forces the Win32 styles an overlay needs, because Tauri resets some of
 * them on its own:
 *
 * - not in the taskbar or Alt+Tab (`force_hide_from_taskbar`), since
 *   `skip_taskbar(true)` is unreliable and is re-run by Tauri on focus;
 * - no frame (`force_borderless`), since `decorations(false)` gets undone;
 * - no Windows 11 accent border or rounded corners;
 * - per-pixel transparency kept (`ensure_layered`);
 * - no white class background brush (`clear_class_background`).
 *
 * It's called on creation, on every `show_slot`, on `Focused`, on edit-mode
 * changes and every few seconds by the keeper. All of these are needed: a
 * restored overlay is click-through and never gets focus, so the focus hook
 * alone would never fix it.
 */
fn reapply_overlay_style(window: &WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        native::force_hide_from_taskbar(hwnd);
        native::force_borderless(hwnd);
        native::disable_dwm_focus_border(hwnd);
        native::ensure_layered(hwnd);
        native::clear_class_background(hwnd);
    }
    let _ = window.set_always_on_top(true);
}

/**
 * Keeps an overlay inside the monitor's work area: the screen minus the
 * taskbar and any docked bars, as Windows reports it. That works with the
 * taskbar on any side and with several monitors. The bottom limit matters
 * most: a click-through animation over the taskbar can't be moved away and
 * blocks it. If the window is larger than the work area it sticks to the
 * top-left corner instead of going to negative coordinates.
 *
 * Returns `true` if the position had to be corrected.
 */
pub fn clamp_to_work_area(window: &WebviewWindow) -> bool {
    #[cfg(windows)]
    {
        let Ok(hwnd) = window.hwnd() else {
            return false;
        };
        let Some((wx, wy, ww, wh)) = native::work_area_for(hwnd) else {
            return false;
        };
        let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
            return false;
        };

        let x = pos.x.min(wx + ww - size.width as i32).max(wx);
        let y = pos.y.min(wy + wh - size.height as i32).max(wy);
        if (x, y) != (pos.x, pos.y) {
            let _ = window.set_position(PhysicalPosition::new(x, y));
            return true;
        }
    }
    false
}

/**
 * Turns click-through on or off for an overlay. Always use this, never
 * `set_ignore_cursor_events` on its own.
 *
 * Tauri's call is still the one doing the work, because rewriting the
 * style by hand is not enough: Windows also needs a `SWP_FRAMECHANGED`
 * repositioning to recompute hit-testing, and without it the overlays
 * stayed draggable outside the editor. But when it turns click-through off,
 * Tauri removes `WS_EX_LAYERED` together with `WS_EX_TRANSPARENT`, which
 * kills the window's transparency and shows its opaque surface as a grey
 * frame. `ensure_layered` puts it back right after.
 */
pub fn set_overlay_click_through(window: &WebviewWindow, enabled: bool) {
    let _ = window.set_ignore_cursor_events(enabled);
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        native::ensure_layered(hwnd);
    }
}

fn raise(window: Option<WebviewWindow>) {
    #[cfg(windows)]
    if let Some(hwnd) = window.and_then(|w| w.hwnd().ok()) {
        native::raise_to_top(hwnd);
    }
}

pub fn raise_slot(app: &AppHandle, slot: usize) {
    raise(slot_window(app, slot));
}

pub fn raise_control(app: &AppHandle) {
    raise(app.get_webview_window(CONTROL_LABEL));
}

pub fn reassert_slot_style(app: &AppHandle, slot: usize) {
    if let Some(window) = slot_window(app, slot) {
        reapply_overlay_style(&window);
    }
}

/**
 * Creates the control window hidden; `setup()` shows it unless the user
 * chose to start minimized to the tray. Creating it hidden is safe because
 * it isn't transparent, so the startup-only `WS_EX_LAYERED` issue described
 * in `create_overlay_pool` doesn't apply.
 */
pub fn create_control_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, CONTROL_LABEL, WebviewUrl::App("index.html".into()))
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
 * Re-raises the visible overlays every `KEEPER_INTERVAL`.
 *
 * A click-through overlay never receives focus, so the `Focused` hook never
 * runs for it. Without this loop, any app that makes itself topmost (a game
 * in borderless window mode, typically) would leave the animations behind
 * for good. Exclusive fullscreen games stay out of reach: they bypass the
 * desktop compositor, so window stacking no longer decides what's visible.
 *
 * Window calls must run on the main thread, so the loop only sleeps and
 * dispatches; it ends when the event loop is gone.
 */
pub fn spawn_topmost_keeper(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(KEEPER_INTERVAL);
        let handle = app.clone();
        let dispatched = app.run_on_main_thread(move || {
            for window in overlay_windows(&handle) {
                if window.is_visible().unwrap_or(false) {
                    reapply_overlay_style(&window);
                }
            }
        });
        if dispatched.is_err() {
            break;
        }
    });
}

/**
 * Dev-only log of memory use and of where each visible overlay is, printed
 * at state transitions (startup, entering or leaving the editor, placing an
 * animation). Memory only means something next to how many windows are
 * visible, so both go in the same log.
 */
#[cfg(debug_assertions)]
pub fn log_overlay_state(app: &AppHandle, moment: &str) {
    println!("[kawagiif] --- overlays: {moment} ---");
    let breakdown = crate::system_stats::debug_memory_breakdown(app.state());
    for line in breakdown.lines() {
        println!("[kawagiif] {line}");
    }
    for window in overlay_windows(app).filter(|w| w.is_visible().unwrap_or(false)) {
        println!(
            "[kawagiif]   {}: pos={:?} size={:?}",
            window.label(),
            window.outer_position().map(|p| (p.x, p.y)).ok(),
            window.inner_size().map(|s| (s.width, s.height)).ok(),
        );
    }
}

#[cfg(not(debug_assertions))]
pub fn log_overlay_state(_app: &AppHandle, _moment: &str) {}

/**
 * Creates all `pool_size()` overlay windows, hidden, during `setup()`.
 *
 * Why a pool instead of one window per placed animation: a
 * `transparent(true)` window created after startup (from a command, or even
 * dispatched with `run_on_main_thread`) is born without `WS_EX_LAYERED`, so
 * it renders white and opaque, and resizing it later doesn't fix it. The
 * same code run during `setup()` always gets it right. So every window is
 * created here, and placing an animation reuses a free one.
 *
 * Builder options that look optional but aren't:
 * - `overlay.html`, not `index.html`: each window is its own WebView2
 *   renderer process, so loading the control app's bundle here would be paid
 *   once per pool window.
 * - `shadow(false)`: on by default, and on an undecorated window Tauri
 *   documents that it adds a 1px white border (rounded on Windows 11), plus
 *   a hidden frame offset.
 * - `background_color` with alpha 0: Windows ignores the alpha of the
 *   webview background except when it is exactly 0.
 * - `window_classname`: a class of our own, so `clear_class_background` can
 *   remove the white brush without touching the control window's class.
 */
pub fn create_overlay_pool(app: &AppHandle) -> tauri::Result<()> {
    for (slot, label) in slot_labels().iter().enumerate() {
        let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App("overlay.html".into()))
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
        watch_overlay_events(app, &window, slot);
    }
    Ok(())
}

/**
 * Hooks an overlay's window events:
 *
 * - `Focused`: Tauri re-runs its own `skip_taskbar` fix on focus and undoes
 *   ours, so the styles are forced again.
 * - `Moved`: Windows runs the drag itself, so leaving the work area can't be
 *   prevented, only corrected afterwards. A correction fires another `Moved`
 *   with a valid position, which needs no correction, so it doesn't loop.
 * - `Moved` / `Resized`: the new geometry is stored in the template.
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
        WindowEvent::Resized(size) => {
            crate::template::update_slot_geometry(
                &app,
                slot,
                None,
                Some((size.width, size.height)),
            );
        }
        _ => {}
    });
}

/**
 * Moves, sizes and shows the pool window of `slot`. This is what "places"
 * an animation on the desktop, without creating any window.
 *
 * Geometry is in physical pixels, the single unit used across the app,
 * because `Moved`/`Resized` report physical pixels too. Styles are
 * reapplied here because this is the one path every animation goes through
 * when it appears: tao leaves `WS_EX_APPWINDOW` and `WS_EX_WINDOWEDGE` on a
 * new window, which puts it in the taskbar and draws a thin frame. The
 * window is raised once over the taskbar, and clamped in case an old
 * template placed it over the taskbar.
 */
pub fn show_slot(
    app: &AppHandle,
    slot: usize,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    interactive: bool,
) -> crate::error::AppResult<()> {
    let window = slot_window(app, slot).ok_or(crate::error::AppError::MissingSlotWindow(slot))?;

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
