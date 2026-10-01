// Raw Windows (Win32) calls.
// Tauri doesn't expose, or doesn't apply reliably, some window settings the
// overlays need: real transparency, hiding from the taskbar, no frame, no
// Windows 11 border, stacking order and the usable screen area. This module
// sets them directly on the window's handle (HWND).
//
// Every function here expects a valid HWND of a window owned by this process,
// called from the main thread. All callers get it from `WebviewWindow::hwnd()`
// on a window that still exists, which is what makes the `unsafe` calls sound.

use std::ffi::c_void;
use std::mem::size_of;
use windows::Win32::Foundation::{COLORREF, HWND};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE,
    DWMWCP_DONOTROUND, DWMWINDOWATTRIBUTE,
};
use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetClassLongPtrW, SetWindowLongPtrW, SetWindowPos, GCLP_HBRBACKGROUND,
    GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST, SET_WINDOW_POS_FLAGS, SWP_FRAMECHANGED, SWP_NOACTIVATE,
    SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WINDOW_LONG_PTR_INDEX, WS_BORDER, WS_CAPTION,
    WS_DLGFRAME, WS_EX_APPWINDOW, WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME, WS_EX_LAYERED,
    WS_EX_STATICEDGE, WS_EX_TOOLWINDOW, WS_EX_WINDOWEDGE, WS_SYSMENU, WS_THICKFRAME,
};

/* Personal Note for me:
- std (the standard library):
    - ffi::c_void: C's `void`; Win32 takes "pointer to anything" as `*const c_void`.
    - mem::size_of: how many bytes a type takes; Win32 often asks for the size of what you pass.
- windows: Microsoft's official Rust bindings to the Windows API. Everything is `unsafe`
  because it's C code the Rust compiler can't check.
    - Win32::Foundation:
        - HWND: "handle to a window", the number Windows uses to identify a window.
        - COLORREF: a color in the 0x00BBGGRR format Win32 uses.
    - Win32::Graphics::Dwm (Desktop Window Manager, the compositor that draws all windows):
        - DwmSetWindowAttribute: changes how DWM draws a window.
        - DWMWINDOWATTRIBUTE: the type of "which attribute to change".
        - DWMWA_BORDER_COLOR: attribute for the Windows 11 border color.
        - DWMWA_COLOR_NONE: special color value meaning "draw no border".
        - DWMWA_WINDOW_CORNER_PREFERENCE: attribute for rounded vs square corners.
        - DWMWCP_DONOTROUND: value meaning "square corners".
    - Win32::Graphics::Gdi (the classic drawing and display API):
        - MonitorFromWindow: which monitor a window is on.
        - MONITOR_DEFAULTTONEAREST: if it's between monitors, pick the closest one.
        - GetMonitorInfoW: a monitor's full and usable (work area) rectangles.
        - MONITORINFO: the struct GetMonitorInfoW fills in.
    - Win32::UI::WindowsAndMessaging (window creation, styles and stacking):
        - GetWindowLongPtrW / SetWindowLongPtrW: read / write a window's style bits.
        - WINDOW_LONG_PTR_INDEX: the type of "which value to read/write".
        - GWL_STYLE: the normal style (frame, title bar, ...).
        - GWL_EXSTYLE: the extended style (transparency, taskbar, topmost, ...).
        - SetClassLongPtrW + GCLP_HBRBACKGROUND: change the background brush of a window CLASS.
        - SetWindowPos: move, resize or reorder a window.
        - SET_WINDOW_POS_FLAGS: the type of SetWindowPos options.
        - SWP_NOMOVE / SWP_NOSIZE / SWP_NOZORDER / SWP_NOACTIVATE: "keep position / size / order / focus".
        - SWP_FRAMECHANGED: "styles changed, recompute and redraw the frame".
        - HWND_TOPMOST: put the window at the top of the always-on-top band.
        - WS_CAPTION / WS_SYSMENU / WS_THICKFRAME / WS_BORDER / WS_DLGFRAME:
          title bar, system menu, resize border, thin border, dialog frame.
        - WS_EX_LAYERED: per-pixel transparency.
        - WS_EX_TOOLWINDOW / WS_EX_APPWINDOW: hide from / force into the taskbar and Alt+Tab.
        - WS_EX_WINDOWEDGE / WS_EX_CLIENTEDGE / WS_EX_STATICEDGE / WS_EX_DLGMODALFRAME:
          the different kinds of 3D edges a window can draw.
*/

fn get_style(hwnd: HWND, index: WINDOW_LONG_PTR_INDEX) -> isize {
    // SAFETY: `hwnd` is a live window of this process (module invariant) and `index` is a valid GWL_* constant.
    unsafe { GetWindowLongPtrW(hwnd, index) }
}

fn set_style(hwnd: HWND, index: WINDOW_LONG_PTR_INDEX, value: isize) {
    // SAFETY: `hwnd` is a live window of this process (module invariant) and `index` is a valid GWL_* constant.
    unsafe {
        SetWindowLongPtrW(hwnd, index, value);
    }
}

fn set_window_pos(hwnd: HWND, insert_after: Option<HWND>, flags: SET_WINDOW_POS_FLAGS) {
    // SAFETY: `hwnd` is a live window of this process; position and size are ignored because of SWP_NOMOVE | SWP_NOSIZE.
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            insert_after,
            0,
            0,
            0,
            0,
            flags | SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
    }
}

fn set_dwm_attribute<T>(
    hwnd: HWND,
    attribute: DWMWINDOWATTRIBUTE,
    value: &T,
) -> windows::core::Result<()> {
    // SAFETY: the pointer comes from a live `&T` and the size passed is exactly `size_of::<T>()`, so DWM reads only valid memory.
    unsafe {
        DwmSetWindowAttribute(
            hwnd,
            attribute,
            std::ptr::from_ref(value).cast::<c_void>(),
            size_of::<T>() as u32,
        )
    }
}

/**
 * Makes sure the window keeps `WS_EX_LAYERED`, the flag that gives it real
 * per-pixel transparency. Tauri's `set_ignore_cursor_events(false)` removes
 * it, and it has been seen dropping again later on, so it's reasserted with
 * the rest of the styles. Without it the window's opaque surface shows
 * around the media as a grey frame.
 */
pub fn ensure_layered(hwnd: HWND) {
    let ex = get_style(hwnd, GWL_EXSTYLE);
    let layered = WS_EX_LAYERED.0 as isize;
    if ex & layered == 0 {
        set_style(hwnd, GWL_EXSTYLE, ex | layered);
    }
}

/**
 * Removes the background brush of this window's CLASS.
 *
 * Before repainting, Windows "erases" a window by filling it with its class
 * brush, which is white by default. On an opaque window the content covers
 * it at once; on a transparent one the white stays visible wherever the
 * webview doesn't recomposite. With no brush, erasing paints nothing.
 *
 * This changes the class, not the window, so it's only safe because the
 * overlays use their own class (`KawaGiifOverlay`). On a shared class it
 * would also strip the control window's background.
 */
pub fn clear_class_background(hwnd: HWND) {
    // SAFETY: `hwnd` is a live window of this process and its class is our own `KawaGiifOverlay`; a null brush (0) is a valid value.
    unsafe {
        SetClassLongPtrW(hwnd, GCLP_HBRBACKGROUND, 0);
    }
}

/**
 * The work area of the monitor the window is on, as `(x, y, width,
 * height)` in physical pixels: the whole screen minus the taskbar and any
 * docked bars. Windows already tracks this (`rcWork`), so it's right
 * wherever the taskbar is and whether or not it auto-hides.
 */
pub fn work_area_for(hwnd: HWND) -> Option<(i32, i32, i32, i32)> {
    let mut info = MONITORINFO {
        cbSize: size_of::<MONITORINFO>() as u32,
        ..Default::default()
    };
    // SAFETY: `hwnd` is a live window; `info` is a properly sized MONITORINFO that outlives the call.
    let ok = unsafe {
        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        GetMonitorInfoW(monitor, std::ptr::from_mut(&mut info)).as_bool()
    };
    let w = info.rcWork;
    ok.then_some((w.left, w.top, w.right - w.left, w.bottom - w.top))
}

/**
 * Keeps the window out of the taskbar and Alt+Tab: removes
 * `WS_EX_APPWINDOW` and adds `WS_EX_TOOLWINDOW`.
 *
 * Tauri's `skip_taskbar(true)` does this unreliably on Windows (a known
 * Tauri v2 bug) and re-runs its own version whenever the window gains
 * focus, overwriting this one. That's why callers reapply it on focus and
 * not only after creating the window.
 */
pub fn force_hide_from_taskbar(hwnd: HWND) {
    let ex = get_style(hwnd, GWL_EXSTYLE);
    set_style(
        hwnd,
        GWL_EXSTYLE,
        (ex & !(WS_EX_APPWINDOW.0 as isize)) | WS_EX_TOOLWINDOW.0 as isize,
    );
}

/**
 * Strips every frame flag from both places Windows stores them.
 *
 * `decorations(false)` gets undone on Windows: `WS_CAPTION` and
 * `WS_SYSMENU` come back in the normal style, which draws a native close
 * button. And tao sets `WS_EX_WINDOWEDGE` in the extended style when it
 * creates the window, which draws a thin 1px edge. It only showed on media
 * with transparency, because an opaque video covers the window edge to edge.
 * Changing styles doesn't redraw the frame by itself, so `SWP_FRAMECHANGED`
 * asks Windows to recompute it.
 */
pub fn force_borderless(hwnd: HWND) {
    let frame = WS_CAPTION.0 | WS_SYSMENU.0 | WS_THICKFRAME.0 | WS_BORDER.0 | WS_DLGFRAME.0;
    set_style(
        hwnd,
        GWL_STYLE,
        get_style(hwnd, GWL_STYLE) & !(frame as isize),
    );

    let edges =
        WS_EX_WINDOWEDGE.0 | WS_EX_CLIENTEDGE.0 | WS_EX_STATICEDGE.0 | WS_EX_DLGMODALFRAME.0;
    set_style(
        hwnd,
        GWL_EXSTYLE,
        get_style(hwnd, GWL_EXSTYLE) & !(edges as isize),
    );

    set_window_pos(hwnd, None, SWP_NOZORDER | SWP_FRAMECHANGED);
}

/**
 * Removes the accent border and the rounded corners that Windows 11 draws
 * through DWM around a window. They're drawn outside the client area, so
 * neither CSS nor style flags can reach them; each one needs its own DWM
 * attribute. On Windows 10 these attributes don't exist and the calls fail
 * harmlessly.
 *
 * Errors are printed in dev builds instead of being swallowed: a silent
 * failure here once passed for a fix and hid the real cause of the border.
 */
pub fn disable_dwm_focus_border(hwnd: HWND) {
    let border = set_dwm_attribute(hwnd, DWMWA_BORDER_COLOR, &COLORREF(DWMWA_COLOR_NONE));
    let corners = set_dwm_attribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &DWMWCP_DONOTROUND);

    #[cfg(debug_assertions)]
    for (name, result) in [("BORDER_COLOR", border), ("CORNER_PREFERENCE", corners)] {
        if let Err(e) = result {
            eprintln!("[kawagiif] DWM {name} failed: {e}");
        }
    }
    #[cfg(not(debug_assertions))]
    let _ = (border, corners);
}

/**
 * Moves the window to the top of the always-on-top band.
 *
 * `set_always_on_top(true)` does nothing when the window is already
 * topmost, so it never reorders it, and the taskbar (also topmost) ended up
 * covering the animations. `SetWindowPos` with `HWND_TOPMOST` always
 * reorders, and `SWP_NOACTIVATE` keeps focus where the user has it.
 */
pub fn raise_to_top(hwnd: HWND) {
    set_window_pos(hwnd, Some(HWND_TOPMOST), SET_WINDOW_POS_FLAGS(0));
}
