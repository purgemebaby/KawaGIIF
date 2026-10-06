/* Raw Windows (Win32) calls. 
This module sets windows attributes directly on the window's handle (HWND).
Every function here expects a valid HWND of a window owned by this process,
called from the main thread.
*/

use std::ffi::c_void;
use std::mem::size_of;

use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2Controller, ICoreWebView2_19, ICoreWebView2_3,
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
};
use webview2_com::TrySuspendCompletedHandler;
use windows::core::Interface;
use windows::Win32::Foundation::{COLORREF, HWND};
use windows::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, 
    DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE, 
    DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND, DWMWINDOWATTRIBUTE,
};

use windows::Win32::Graphics::Gdi::{
    GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
};

use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowLongPtrW, SetClassLongPtrW, SetWindowLongPtrW, SetWindowPos, 
    GCLP_HBRBACKGROUND, GWL_EXSTYLE, GWL_STYLE, 
    HWND_TOPMOST, SET_WINDOW_POS_FLAGS,
    SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    WINDOW_LONG_PTR_INDEX, WS_BORDER, WS_CAPTION, WS_DLGFRAME, WS_SYSMENU, WS_THICKFRAME,
    WS_EX_APPWINDOW, WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME, WS_EX_LAYERED, WS_EX_STATICEDGE, WS_EX_TOOLWINDOW, WS_EX_WINDOWEDGE,
};

/* Personal Note for me:
- windows: Official bindings to the WinAPI.
    - core::Interface: trait that adds `.cast::<T>()` to ask a COM object for another interface version.
    - Win32::Foundation:
        - HWND: "handle to a window", window's ID.
        - COLORREF: a color in the 0x00BBGGRR format Win32 uses.

    - Win32::Graphics::Dwm (Desktop Window Manager, compositor):
        - DwmSetWindowAttribute: how DWM draws a window.
        - DWMWINDOWATTRIBUTE: type of "which attribute to change".
        - DWMWA_COLOR_NONE: special color value meaning "draw no border".
        - DWMWA_WINDOW_CORNER_PREFERENCE: rounded/square corners.

    - Win32::Graphics::Gdi (classic drawing and display API):
        - MonitorFromWindow: which monitor a window is on.
        - MONITOR_DEFAULTTONEAREST: if it's between monitors, pick the closest one.
        - GetMonitorInfoW: a monitor's full and usable (work area) rectangles.

    - Win32::UI::WindowsAndMessaging (window creation, styles and stacking):
        - GetWindowLongPtrW / SetWindowLongPtrW: read / write a window's style bits.
        - WINDOW_LONG_PTR_INDEX: type of "which value to read/write".
        - SetClassLongPtrW + GCLP_HBRBACKGROUND: change the background brush of a window class.
        - SetWindowPos: move, resize or reorder a window.
        - SET_WINDOW_POS_FLAGS: type of SetWindowPos options.
        - SWP_NOMOVE / SWP_NOSIZE / SWP_NOZORDER / SWP_NOACTIVATE: keep position / size / order / focus.
        - SWP_FRAMECHANGED: "styles changed, recompute and redraw the frame".
        - HWND_TOPMOST: put the window at the top of the always-on-top band.
        - WS_CAPTION / WS_SYSMENU / WS_THICKFRAME / WS_BORDER / WS_DLGFRAME:
          title bar, system menu, resize border, thin border, dialog frame.
        - WS_EX_LAYERED: per-px transparency.
        - WS_EX_TOOLWINDOW / WS_EX_APPWINDOW: hide from / force into the taskbar and Alt+Tab.
        - WS_EX_WINDOWEDGE / WS_EX_CLIENTEDGE / WS_EX_STATICEDGE / WS_EX_DLGMODALFRAME:
        different kinds of 3D edges a window can draw.

    To access variables, use VAR.0
*/



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
 * Puts a hidden overlay's web page to sleep, or wakes it up. Every overlay window is its own WebView2 renderer process. Going dormant force to ask
 *  to use as little memory as it can, and suspends it. Waking runs the same steps backwards.
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
