// Small commands the frontend calls that don't belong to a bigger module:
// the control window, overlay resizing and the settings screen.

use tauri::{AppHandle, Manager, PhysicalSize, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

use crate::config::{self, AppConfig};
use crate::error::AppResult;
use crate::window_manager;

/* Personal Note for me:
- tauri: the app framework.
    - AppHandle: handle to the running app, used to look windows up.
    - Manager: trait that adds `get_webview_window` to AppHandle.
    - PhysicalSize: a width/height in real screen pixels (not scaled by Windows DPI).
    - WebviewWindow: a native window with a web page inside. As a command
      argument, Tauri fills it with the window that made the call.
- tauri_plugin_autostart: registers the app to start with Windows.
    - ManagerExt: trait that adds `.autolaunch()` to AppHandle.
- crate::config: our settings file.
    - AppConfig: the settings struct sent to the Settings screen.
- crate::error::AppResult: our `Result<T, AppError>` shortcut.
- crate::window_manager: our window module, for the control window label and pool limits.
*/

#[tauri::command]
pub fn hide_control_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        let _ = window.hide();
    }
}

#[tauri::command]
pub fn resize_overlay(window: WebviewWindow, width: u32, height: u32) -> AppResult<()> {
    window.set_size(PhysicalSize::new(width, height))?;
    Ok(())
}

/**
 * Locks or unlocks the control window's minimize button.
 *
 * The editor disables it while there are unsaved changes: the overlays stay
 * interactive while the editor is open, so minimizing would leave the user
 * in an edit session with no visible way back to save or discard it.
 */
#[tauri::command]
pub fn set_control_minimizable(app: AppHandle, enabled: bool) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        window.set_minimizable(enabled)?;
    }
    Ok(())
}

/**
 * The current settings, with `launch_on_startup` read from the autostart
 * plugin (the Windows registry) instead of `config.toml`. The registry is
 * the real source of truth: the user can turn autostart off from Task
 * Manager, and the file would then report a stale value.
 */
#[tauri::command]
pub fn get_config(app: AppHandle) -> AppConfig {
    let mut config = config::load();
    if let Ok(enabled) = app.autolaunch().is_enabled() {
        config.launch_on_startup = enabled;
    }
    config
}

#[tauri::command]
pub fn set_launch_on_startup(app: AppHandle, enabled: bool) -> AppResult<()> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable()?;
    } else {
        autolaunch.disable()?;
    }
    config::update(|c| c.launch_on_startup = enabled)
}

#[tauri::command]
pub fn set_start_minimized_to_tray(enabled: bool) -> AppResult<()> {
    config::update(|c| c.start_minimized_to_tray = enabled)
}

#[tauri::command]
pub fn set_confirm_media_delete(enabled: bool) -> AppResult<()> {
    config::update(|c| c.confirm_media_delete = enabled)
}

/**
 * How many animations can be placed at once.
 *
 * Only saved, never applied live: overlay windows can only be created during
 * startup (see `window_manager::create_overlay_pool`), so the new size takes
 * effect on the next launch. The Settings screen tells the user so.
 */
#[tauri::command]
pub fn set_overlay_pool_size(count: u32) -> AppResult<()> {
    config::update(|c| c.overlay_pool_size = count.clamp(1, window_manager::MAX_POOL))
}
