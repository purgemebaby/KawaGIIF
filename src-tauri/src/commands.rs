/* Small commands that don't belong to a bigger module: the control window, overlay resizing and settings. */
use tauri::{AppHandle, Manager, PhysicalSize, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

use crate::config::{self, AppConfig};
use crate::error::AppResult;
use crate::window_manager;

/* Personal Note for me:
- tauri_plugin_autostart::ManagerExt: trait that adds `.autolaunch()` to AppHandle, to register the app to start with Windows.
- WebviewWindow as a command argument: Tauri fills it with the window that made the call.
*/



// Control window commands
#[tauri::command]
pub fn hide_control_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        let _ = window.hide();
    }
}

/// Minimizing during an unsaved edit leaves no visible way back (overlays stay interactive), so the editor locks it.
#[tauri::command]
pub fn set_control_minimizable(app: AppHandle, enabled: bool) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        window.set_minimizable(enabled)?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_overlay(window: WebviewWindow, width: u32, height: u32) -> AppResult<()> {
    window.set_size(PhysicalSize::new(width, height))?;
    Ok(())
}



// Settings commands
/// `launch_on_startup` comes from the registry (autostart plugin), not `config.toml`: the user can change it elsewhere.
#[tauri::command]
pub fn get_config(app: AppHandle) -> AppConfig {
    let mut config: AppConfig = config::load();
    if let Ok(enabled) = app.autolaunch().is_enabled() {
        config.launch_on_startup = enabled;
    }
    config
}

#[tauri::command]
pub fn set_launch_on_startup(app: AppHandle, enabled: bool) -> AppResult<()> {
    let autolaunch = app.autolaunch();
    if enabled { autolaunch.enable()?; } else { autolaunch.disable()?; }
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

/// Only saved: the overlay pool is created at startup, so the new size applies on the next launch.
#[tauri::command]
pub fn set_overlay_pool_size(count: u32) -> AppResult<()> {
    config::update(|c| c.overlay_pool_size = count.clamp(1, window_manager::MAX_POOL))
}
