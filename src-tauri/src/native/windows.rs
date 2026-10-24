/* Raw Windows (Win32) calls. 
This module sets windows attributes directly on the window's handle (HWND).
Every function here expects a valid HWND of a window owned by this process,
called from the main thread.
*/

use std::collections::BTreeSet;
use std::ffi::c_void;
use std::mem::size_of;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::OnceLock;

use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Controller, ICoreWebView2_19, ICoreWebView2_3,
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
};
use webview2_com::TrySuspendCompletedHandler;
use windows::core::Interface;
use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::UI::Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, 
    DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, 
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWINDOWATTRIBUTE,
};

use windows::Win32::Graphics::Gdi::{
    EnumFontFamiliesExW, GetDC, GetMonitorInfoW, MonitorFromPoint, MonitorFromWindow, ReleaseDC,
    DEFAULT_CHARSET, LOGFONTW, MONITORINFO, MONITOR_DEFAULTTONEAREST, TEXTMETRICW,
};

use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON, VK_RBUTTON};
use windows::Win32::UI::Shell::{
    DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass, SHQueryUserNotificationState, QUNS_RUNNING_D3D_FULL_SCREEN,
};

use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetCursorPos, GetForegroundWindow, GetSystemMetrics, GetWindowRect, GetWindowLongPtrW, GetWindowThreadProcessId, SetClassLongPtrW, SetWindowLongPtrW, SetWindowPos, SM_SWAPBUTTON,
    EVENT_SYSTEM_FOREGROUND, GCLP_HBRBACKGROUND, GWL_EXSTYLE, GWL_STYLE,
    HWND_TOPMOST, SET_WINDOW_POS_FLAGS,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    WINDOW_LONG_PTR_INDEX, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS, WM_MOVING, WM_NCACTIVATE, WM_NCCALCSIZE, WM_NCDESTROY, WM_NCPAINT, WS_BORDER, WS_CAPTION, WS_DLGFRAME, WS_SYSMENU, WS_THICKFRAME,
    WS_EX_APPWINDOW, WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME, WS_EX_LAYERED, WS_EX_STATICEDGE, WS_EX_TOOLWINDOW, WS_EX_WINDOWEDGE,
};
#[cfg(debug_assertions)]
use windows::Win32::UI::WindowsAndMessaging::WS_EX_TRANSPARENT;

/* Personal Note for me:
- windows: Official bindings to the WinAPI.
    - core::Interface: trait that adds `.cast::<T>()` to ask a COM object for another interface version.
    - Win32::Foundation - HWND: "handle to a window", window's ID. and COLORREF: 0x00BBGGRR format.

    - Win32::Graphics::Dwm (Desktop Window Manager, compositor):
        - DwmSetWindowAttribute: how DWM draws a window.
        - DWMWINDOWATTRIBUTE: type of "which attribute to change".
        - DWMWA_COLOR_NONE: special color value meaning "draw no border".
        - DWMWA_WINDOW_CORNER_PREFERENCE: rounded/square corners.

    - Win32::Graphics::Gdi (classic drawing and display API):
        - MonitorFromWindow: which monitor a window is on.
        - MONITOR_DEFAULTTONEAREST: if it's between monitors, pick the closest one.
        - GetMonitorInfoW: a monitor's full and usable (work area) rectangles.
        - EnumFontFamiliesExW: calls our function once per installed font (system-wide and per-user ones).
        - LOGFONTW: describes a font

    - Win32::UI::WindowsAndMessaging (window creation, styles and stacking):
        - GetWindowLongPtrW / SetWindowLongPtrW: read / write a window's style bits.
        - WINDOW_LONG_PTR_INDEX: type of "which value to read/write".
        - SetClassLongPtrW + GCLP_HBRBACKGROUND: change the background brush of a window class.
        - SetWindowPos: move, resize or reorder a window.
        - SWP_NOMOVE / SWP_NOSIZE / SWP_NOZORDER / SWP_NOACTIVATE: keep position / size / order / focus.
        - SWP_FRAMECHANGED: "styles changed, recompute and redraw the frame".
        - HWND_TOPMOST: put the window at the top of the always-on-top band.
        - WS_CAPTION / WS_SYSMENU / WS_THICKFRAME / WS_BORDER / WS_DLGFRAME:
          title bar, system menu, resize border, thin border, dialog frame.
        - WS_EX_LAYERED: per-px transparency.
        - WS_EX_TOOLWINDOW / WS_EX_APPWINDOW: hide from / force into the taskbar and Alt+Tab. 


    - Win32::UI::Input::KeyboardAndMouse - GetAsyncKeyState: is a key/button held right now, whatever window has focus.
      It reads the physical button, so with left/right swapped (SM_SWAPBUTTON) the "primary" one is VK_RBUTTON.

    - Win32::UI::Shell (window subclassing, in comctl32):
        - SetWindowSubclass: puts our own message handler in front of the window's existing one (tao's), without replacing it.
        - DefSubclassProc: passes a message on to the next handler in the chain.
    To access variables, use VAR.0
*/


const GUARD_SUBCLASS_ID: usize = 0x4B47_4E43;
const SHELL_CLASSES: [&str; 3] = ["Progman", "WorkerW", "Shell_TrayWnd"]; //desktop and taskbar windows span the monitor too
static ON_FOREGROUND: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();
static FOREGROUND_HOOK: AtomicUsize = AtomicUsize::new(0);
static ON_ANY_FOREGROUND: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();
static ANY_FOREGROUND_HOOK: AtomicUsize = AtomicUsize::new(0);

// Getters/Setters
fn get_style(hwnd: HWND, index: WINDOW_LONG_PTR_INDEX) -> isize {
    unsafe { GetWindowLongPtrW(hwnd, index) }
}

fn set_style(hwnd: HWND, index: WINDOW_LONG_PTR_INDEX, value: isize) {
    unsafe { SetWindowLongPtrW(hwnd, index, value); }
}

fn set_window_pos(hwnd: HWND, insert_after: Option<HWND>, flags: SET_WINDOW_POS_FLAGS) {
    unsafe {
        let _ = SetWindowPos(
            hwnd, insert_after,
            0, 0, 0, 0,
            flags | SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

fn set_dwm_attribute<T>(hwnd: HWND, attribute: DWMWINDOWATTRIBUTE, value: &T,) -> windows::core::Result<()> {
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute,
            std::ptr::from_ref(value).cast::<c_void>(),
            size_of::<T>() as u32,
        )
    }
}

/** Subclass handler of `guard_non_client`. An overlay has no non-client area, so none of it is ever painted; a drag stays on the screens. */
unsafe extern "system" fn non_client_guard(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, overhang: usize) -> LRESULT {
    match msg {
        WM_MOVING if unsafe { constrain_moving_rect(hwnd, lparam, overhang as i32) } => LRESULT(1),
        WM_NCACTIVATE => unsafe { DefSubclassProc(hwnd, msg, wparam, LPARAM(-1)) },
        WM_NCPAINT => LRESULT(0),
        WM_NCCALCSIZE if wparam.0 != 0 => LRESULT(0),
        WM_NCDESTROY => unsafe {
            let _ = RemoveWindowSubclass(hwnd, Some(non_client_guard), GUARD_SUBCLASS_ID);
            DefSubclassProc(hwnd, msg, wparam, lparam) // tao's handler still needs it to remove its own subclass
        },
        _ => unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) },
    }
}

/**
 * Shifts the `WM_MOVING` rect (`lparam`) inside the monitor under the cursor, overhanging it by `overhang` logical px.
 * Returns `false` if a Win32 call failed. Safety: `lparam` must be the `RECT` pointer of a `WM_MOVING` message.
 */
unsafe fn constrain_moving_rect(hwnd: HWND, lparam: LPARAM, overhang: i32) -> bool {
    let mut cursor = POINT::default();
    let mut info = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
    let found = unsafe {
        GetCursorPos(&mut cursor).is_ok()
            && GetMonitorInfoW(MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST), &mut info).as_bool()
    };
    let rect = lparam.0 as *mut RECT;
    if !found || rect.is_null() { return false; }
    let room = overhang * unsafe { GetDpiForWindow(hwnd) } as i32 / 96;
    // SAFETY: for WM_MOVING, lparam points to the proposed RECT, valid and writable during the message.
    let rect = unsafe { &mut *rect };
    let (width, height) = (rect.right - rect.left, rect.bottom - rect.top);
    let screen = info.rcMonitor;
    rect.left = rect.left.min(screen.right + room - width).max(screen.left - room);
    rect.top = rect.top.min(screen.bottom + room - height).max(screen.top - room);
    rect.right = rect.left + width;
    rect.bottom = rect.top + height;
    true
}

/** `SetWinEventHook` callback*/
unsafe extern "system" fn on_foreground_changed(_hook: HWINEVENTHOOK, _event: u32, _hwnd: HWND, _object: i32, _child: i32, _thread: u32, _time: u32) {
    if let Some(callback) = ON_FOREGROUND.get() { callback(); }
}

/** `SetWinEventHook` callback of `watch_any_foreground`*/
unsafe extern "system" fn on_any_foreground_changed(_hook: HWINEVENTHOOK, _event: u32, _hwnd: HWND, _object: i32, _child: i32, _thread: u32, _time: u32) {
    if let Some(callback) = ON_ANY_FOREGROUND.get() { callback(); }
}

/** `EnumFontFamiliesExW` callback*/
unsafe extern "system" fn collect_font_family(font: *const LOGFONTW, _metrics: *const TEXTMETRICW, _font_type: u32, lparam: LPARAM) -> i32 {
    let (font, families) = unsafe { (&*font, &mut *(lparam.0 as *mut BTreeSet<String>)) };
    let len: usize = font.lfFaceName.iter().position(|&c| c == 0).unwrap_or(font.lfFaceName.len());
    let name: String = String::from_utf16_lossy(&font.lfFaceName[..len]);
    if !name.starts_with('@') && !name.is_empty() { families.insert(name); }
    1
}



// Functions to force styles, behaviour and attributes of the windows
/**
 * Makes sure the window keeps `WS_EX_LAYERED` for real per-px transparency.
 */
pub fn force_layered(hwnd: HWND) {
    let ex: isize = get_style(hwnd, GWL_EXSTYLE);
    let layered: isize = WS_EX_LAYERED.0 as isize;
    if ex & layered == 0 {
        set_style(hwnd, GWL_EXSTYLE, ex | layered);
    }
}

/**
 * Removes the background brush of this window's class to avoid overdraw the transparency attribute on redraw.
 */
pub fn force_clearbg(hwnd: HWND) {
    unsafe { SetClassLongPtrW(hwnd, GCLP_HBRBACKGROUND, 0); }
}

/** Define the work area of the monitor the window is on, as `(x, y, width, height)` in physical pixels. */
pub fn force_work_area(hwnd: HWND) -> Option<(i32, i32, i32, i32)> {
    let mut info: MONITORINFO = MONITORINFO{cbSize: size_of::<MONITORINFO>() as u32, ..Default::default()}; //geom info
    let ok: bool = unsafe {
        let monitor: windows::Win32::Graphics::Gdi::HMONITOR = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        GetMonitorInfoW(monitor, std::ptr::from_mut(&mut info)).as_bool()
    };
    let w: windows::Win32::Foundation::RECT = info.rcMonitor;
    ok.then_some((w.left, w.top, w.right - w.left, w.bottom - w.top))
}

/**
 * Keeps the window out of the taskbar and Alt+Tab by removing `WS_EX_APPWINDOW` and adding `WS_EX_TOOLWINDOW`.
 */
pub fn force_hide_taskb(hwnd: HWND) {
    let ex = get_style(hwnd, GWL_EXSTYLE);
    set_style(hwnd, GWL_EXSTYLE, (ex & !(WS_EX_APPWINDOW.0 as isize)) | WS_EX_TOOLWINDOW.0 as isize);
}

pub fn force_borderless(hwnd: HWND) {
    let frame: u32 = WS_CAPTION.0 | WS_SYSMENU.0 | WS_THICKFRAME.0 | WS_BORDER.0 | WS_DLGFRAME.0;
    set_style(hwnd, GWL_STYLE, get_style(hwnd, GWL_STYLE) & !(frame as isize));

    let edges = WS_EX_WINDOWEDGE.0 | WS_EX_CLIENTEDGE.0 | WS_EX_STATICEDGE.0 | WS_EX_DLGMODALFRAME.0;
    set_style(hwnd, GWL_EXSTYLE, get_style(hwnd, GWL_EXSTYLE) & !(edges as isize),);
    set_window_pos(hwnd, None, SWP_NOZORDER | SWP_FRAMECHANGED);
}

pub fn top_everything(hwnd: HWND) {
    set_window_pos(hwnd, Some(HWND_TOPMOST), SET_WINDOW_POS_FLAGS(0));
}

/**
 * Stops Windows from painting a title bar on an overlay. tao puts `WS_CAPTION` back whenever it changes a window flag, and
 * activating a window with it repaints the non-client area (a white strip on Windows 11).
 * Also clamps the native drag (`WM_MOVING`) to the screens; the window may overhang them by `overhang` logical px.
 */
pub fn guard_non_client(hwnd: HWND, overhang: u32) {
    unsafe { let _ = SetWindowSubclass(hwnd, Some(non_client_guard), GUARD_SUBCLASS_ID, overhang as usize); }
}

/** Hooks `EVENT_SYSTEM_FOREGROUND` with `callback` and returns the hook handle (0 if Windows refused). */
fn hook_foreground(callback: unsafe extern "system" fn(HWINEVENTHOOK, u32, HWND, i32, i32, u32, u32), flags: u32) -> usize {
    let hook: HWINEVENTHOOK = unsafe {
        SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, None, Some(callback), 0, 0, flags)
    };
    #[cfg(debug_assertions)]
    if hook.0.is_null() { eprintln!("[kawagiif] SetWinEventHook failed: foreground changes are not watched"); }
    hook.0 as usize
}

/** Removes the hook stored in `slot`, if any. */
fn unhook(slot: &AtomicUsize) {
    let hook: usize = slot.swap(0, Ordering::Relaxed);
    if hook != 0 { unsafe { let _ = UnhookWinEvent(HWINEVENTHOOK(hook as *mut c_void)); } }
}

/**
 * Calls `callback` every time another app's window becomes the foreground one .
 */
pub fn watch_foreground(callback: impl Fn() + Send + Sync + 'static) {
    if ON_FOREGROUND.set(Box::new(callback)).is_err() { return; }
    FOREGROUND_HOOK.store(hook_foreground(on_foreground_changed, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS), Ordering::Relaxed);
}

/** Like `watch_foreground`, but also fires when one of our own windows becomes the foreground one (separate hook). */
pub fn watch_any_foreground(callback: impl Fn() + Send + Sync + 'static) {
    if ON_ANY_FOREGROUND.set(Box::new(callback)).is_err() { return; }
    ANY_FOREGROUND_HOOK.store(hook_foreground(on_any_foreground_changed, WINEVENT_OUTOFCONTEXT), Ordering::Relaxed);
}

/** Removes the hooks of `watch_foreground` and `watch_any_foreground`; called on exit. */
pub fn unwatch_foreground() {
    unhook(&FOREGROUND_HOOK);
    unhook(&ANY_FOREGROUND_HOOK);
}

/** Whether the foreground window belongs to this process (no foreground window, as during a window switch, counts as no). */
pub fn foreground_is_ours() -> bool {
    let mut process: u32 = 0;
    let window: HWND = unsafe { GetForegroundWindow() };
    if window.0.is_null() { return false; }
    unsafe { GetWindowThreadProcessId(window, Some(std::ptr::from_mut(&mut process))); }
    process == std::process::id()
}

/** What the foreground window does to the screen: nothing, a borderless window covering its monitor, or exclusive Direct3D fullscreen. */
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Fullscreen { None, Borderless, Exclusive }

/** Whether `window` is the desktop or the taskbar, which cover a monitor without being a game. */
fn is_shell_window(window: HWND) -> bool {
    let mut class = [0u16; 32];
    // SAFETY: `class` is a valid writable buffer; the call returns the characters copied (0 on failure).
    let len = unsafe { GetClassNameW(window, &mut class) };
    SHELL_CLASSES.contains(&String::from_utf16_lossy(&class[..len.max(0) as usize]).as_str())
}

/** Whether `window` covers its whole monitor, give or take 1 px. */
fn covers_monitor(window: HWND) -> bool {
    let mut rect = RECT::default();
    let mut info = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
    // SAFETY: `window` is a live handle from `GetForegroundWindow`; `rect` and `info` are valid for writes.
    let found = unsafe {
        GetWindowRect(window, &mut rect).is_ok()
            && GetMonitorInfoW(MonitorFromWindow(window, MONITOR_DEFAULTTONEAREST), &mut info).as_bool()
    };
    let screen = info.rcMonitor;
    let near = |a: i32, b: i32| (a - b).abs() <= 1;
    found && near(rect.left, screen.left) && near(rect.top, screen.top) && near(rect.right, screen.right) && near(rect.bottom, screen.bottom)
}

/** What the foreground window (never ours, the desktop or the taskbar) does to the screen right now. */
pub fn foreground_fullscreen() -> Fullscreen {
    // SAFETY: takes no arguments and only reads the shell's state.
    if unsafe { SHQueryUserNotificationState() }.is_ok_and(|state| state == QUNS_RUNNING_D3D_FULL_SCREEN) { return Fullscreen::Exclusive; }
    // SAFETY: takes no arguments; returns null when no window is foreground.
    let window: HWND = unsafe { GetForegroundWindow() };
    if window.0.is_null() || foreground_is_ours() || is_shell_window(window) || !covers_monitor(window) { return Fullscreen::None; }
    Fullscreen::Borderless
}

/** Whether the primary mouse button is held right now, anywhere on screen (respects swapped buttons). */
pub fn primary_button_down() -> bool {
    let button = if unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0 { VK_RBUTTON } else { VK_LBUTTON };
    let state: i16 = unsafe { GetAsyncKeyState(i32::from(button.0)) };
    state < 0 // the high bit means "down"
}

#[cfg(debug_assertions)]
pub fn style_flags(hwnd: HWND) -> String {
    let style: isize = get_style(hwnd, GWL_STYLE);
    let ex: isize = get_style(hwnd, GWL_EXSTYLE);
    let caption: isize = WS_CAPTION.0 as isize;
    let checks: [(&str, bool); 4] = [
        ("CAPTION", style & caption == caption), // WS_CAPTION is WS_BORDER | WS_DLGFRAME, so both bits must be set
        ("THICKFRAME", style & WS_THICKFRAME.0 as isize != 0),
        ("LAYERED", ex & WS_EX_LAYERED.0 as isize != 0),
        ("TRANSPARENT", ex & WS_EX_TRANSPARENT.0 as isize != 0),
    ];
    checks.iter().filter(|(_, on)| *on).map(|(name, _)| *name).collect::<Vec<_>>().join("|")
}



// Fonts
/**
 * Every installed font family, sorted and without duplicates. GDI lists system-wide (HKLM) and per-user (HKCU) fonts.
 */
pub fn list_font_families() -> Vec<String> {
    let mut families: BTreeSet<String> = BTreeSet::new();
    let filter: LOGFONTW = LOGFONTW { lfCharSet: DEFAULT_CHARSET, ..Default::default() }; // empty name + default charset = all families
    unsafe {
        let hdc = GetDC(None);
        EnumFontFamiliesExW(hdc, &filter, Some(collect_font_family), LPARAM(std::ptr::from_mut(&mut families) as isize), 0);
        ReleaseDC(None, hdc);
    }
    families.into_iter().collect()
}



// DWM
/**
 * Removes the accent border and the rounded corners that Windows 11 draws through DWM around a window.
 */
pub fn disable_dwm_focus_border(hwnd: HWND) {
    let border: Result<(), windows::core::Error> = set_dwm_attribute(hwnd, DWMWA_BORDER_COLOR, &COLORREF(DWMWA_COLOR_NONE));
    let corners: Result<(), windows::core::Error> = set_dwm_attribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &DWMWCP_DONOTROUND);

    #[cfg(debug_assertions)]
    for (name, result) in [("BORDER_COLOR", border), ("CORNER_PREFERENCE", corners)] {
        if let Err(e) = result { eprintln!("[kawagiif] DWM {name} failed: {e}"); }
    }
    #[cfg(not(debug_assertions))]
    let _ = (border, corners); // only logged in debug builds
}



// WebView2
/**
 * Puts a hidden overlay's web page to sleep, or wakes it up. Every overlay window is its own WebView2 renderer process. Going dormant force to ask to use as little memory as it can, and suspends it. Waking runs the same steps backwards.
 */
pub fn set_webview_dormant(controller: &ICoreWebView2Controller, dormant: bool) {
    let result: Result<(), windows::core::Error> = (|| 
        unsafe {
            // check if the installed WebView2 version is deprecated for these interfaces, they are omitted if not
            let webview = controller.CoreWebView2()?;
            let memory = webview.cast::<ICoreWebView2_19>().ok();
            let suspend = webview.cast::<ICoreWebView2_3>().ok();

            if dormant {
                controller.SetIsVisible(false)?;

                // Chromiun GC 
                if let Some(memory) = &memory {
                    memory.SetMemoryUsageTargetLevel(COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW)?;
                }

                // asynchronous suspend callback
                if let Some(suspend) = &suspend {
                    suspend.TrySuspend(&(TrySuspendCompletedHandler::create(Box::new(|_, _| Ok(())))))?;
                }
            } 
            else {
                if let Some(suspend) = &suspend {
                    suspend.Resume()?;
                }

                if let Some(memory) = &memory {
                    memory.SetMemoryUsageTargetLevel(COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL)?;
                }
                controller.SetIsVisible(true)?;
            }
            windows::core::Result::Ok(())
    })();

    #[cfg(debug_assertions)]
    if let Err(e) = result {
        eprintln!("[kawagiif] WebView2 dormant={dormant} failed: {e}");
    }
    #[cfg(not(debug_assertions))]
    let _ = result; // only logged in debug builds
}
