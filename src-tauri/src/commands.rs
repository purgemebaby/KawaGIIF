/* Small commands that don't belong to a bigger module: the control window, overlay resizing and settings. */
use std::path::PathBuf;
use tauri::{AppHandle, Manager, PhysicalSize, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;
use uuid::Uuid;

use crate::config::{self, AppConfig};
use crate::error::{AppError, AppResult};
use crate::window_manager;
#[cfg(windows)]
use crate::native::windows as native;

/* Personal Note for me:
- tauri_plugin_autostart::ManagerExt: trait that adds `.autolaunch()` to AppHandle, to register the app to start with Windows.
- WebviewWindow as a command argument: Tauri fills it with the window that made the call.
*/

const FONT_SCALE_MIN: f32 = 0.85;
const FONT_SCALE_MAX: f32 = 1.3;
const UI_ZOOM_MIN: f32 = 0.7;
const UI_ZOOM_MAX: f32 = 1.5;

/** Full path of the stored loading indicator file. Only a plain `loading-indicator-*` name counts, so a hand-edited config can't point outside the data folder. */
fn loading_indicator_path() -> Option<PathBuf> {
    let name: String = config::load().loading_indicator?;
    let plain: bool = name.starts_with("loading-indicator-") && !name.contains(['/', '\\']) && !name.contains("..");
    plain.then(|| config::data_dir().join(name))
}



// Control window commands
#[tauri::command]
pub fn hide_control_window(app: AppHandle) { window_manager::hide_control(&app); }

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



// Loading indicator commands
/// Copies the picked image into the data folder under a unique name (so WebView2 never serves a cached old one) and returns its path.
#[tauri::command]
pub fn set_loading_indicator(path: PathBuf) -> AppResult<String> {
    let ext: String = path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase();
    if !matches!(ext.as_str(), "gif" | "png" | "jpg" | "jpeg") { return Err(AppError::UnsupportedImage); }

    let stored_name: String = format!("loading-indicator-{}.{ext}", Uuid::new_v4());
    let stored_path: PathBuf = config::data_dir().join(&stored_name);
    std::fs::create_dir_all(config::data_dir())?;
    std::fs::copy(&path, &stored_path)?;

    let previous: Option<PathBuf> = loading_indicator_path();
    // A failed save drops the new copy, so the data folder never collects orphans.
    if let Err(e) = config::update(|c| c.loading_indicator = Some(stored_name)) { let _ = std::fs::remove_file(&stored_path); return Err(e); }
    if let Some(old) = previous { let _ = std::fs::remove_file(old); }
    Ok(stored_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn reset_loading_indicator() -> AppResult<()> {
    let previous: Option<PathBuf> = loading_indicator_path();
    config::update(|c| c.loading_indicator = None)?;
    if let Some(old) = previous { let _ = std::fs::remove_file(old); }
    Ok(())
}

/// `None` when nothing is set or the file was deleted by hand, so the loading screen falls back to the ball.
#[tauri::command]
pub fn get_loading_indicator() -> Option<String> {
    loading_indicator_path().filter(|p| p.exists()).map(|p| p.to_string_lossy().into_owned())
}



// Appearance commands
/// Installed font families, sorted. Empty off Windows (the picker then only offers the system default).
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    #[cfg(windows)]
    { native::list_font_families() }
    #[cfg(not(windows))]
    { Vec::new() }
}

/// `None` or a blank name restores the system default font.
#[tauri::command]
pub fn set_ui_font(family: Option<String>) -> AppResult<()> {
    let family: Option<String> = family.map(|f| f.trim().to_owned()).filter(|f| !f.is_empty());
    config::update(|c| c.ui_font = family)
}

#[tauri::command]
pub fn set_font_scale(scale: f32) -> AppResult<()> {
    config::update(|c| c.font_scale = if scale.is_finite() { scale.clamp(FONT_SCALE_MIN, FONT_SCALE_MAX) } else { 1.0 })
}

/// Saves and applies the control window's WebView2 zoom; returns the clamped value so the UI shows what was applied.
#[tauri::command]
pub fn set_ui_zoom(window: WebviewWindow, zoom: f32) -> AppResult<f32> {
    let zoom: f32 = if zoom.is_finite() { zoom.clamp(UI_ZOOM_MIN, UI_ZOOM_MAX) } else { 1.0 };
    config::update(|c| c.ui_zoom = zoom)?;
    window.set_zoom(f64::from(zoom))?;
    Ok(zoom)
}
