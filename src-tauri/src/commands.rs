use crate::config::{self, AppConfig};
use crate::window_manager;
use tauri::Manager;
use tauri_plugin_autostart::ManagerExt;

#[tauri::command]
pub fn hide_control_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        let _ = window.hide();
    }
}

#[tauri::command]
pub fn set_click_through(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    // Vía el helper, NO `set_ignore_cursor_events`: la de Tauri se lleva por
    // delante `WS_EX_LAYERED` y con él la transparencia de la ventana.
    window_manager::set_overlay_click_through(&window, enabled);
    Ok(())
}

/// Redimensiona la ventana que llama, en píxeles FÍSICOS — la unidad única
/// de toda la app (ver `window_manager::show_slot`).
#[tauri::command]
pub fn resize_overlay(window: tauri::WebviewWindow, width: u32, height: u32) -> Result<(), String> {
    window
        .set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

/// Bloquea o desbloquea el botón de minimizar de la ventana de control. Se
/// usa como guarda mientras el editor tiene cambios sin guardar: minimizar
/// dejaría la edición en un limbo del que no hay forma de volver.
#[tauri::command]
pub fn set_control_minimizable(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        window.set_minimizable(enabled).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> AppConfig {
    let mut cfg = config::load();
    // La fuente de verdad de si el autoarranque está activo es el propio
    // plugin (que consulta el registro de Windows), no lo que quedó escrito
    // la última vez en config.toml — evita que se desincronicen si el
    // usuario lo cambia por fuera de la app.
    if let Ok(enabled) = app.autolaunch().is_enabled() {
        cfg.launch_on_startup = enabled;
    }
    cfg
}

#[tauri::command]
pub fn set_launch_on_startup(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    if enabled {
        autolaunch.enable().map_err(|e| e.to_string())?;
    } else {
        autolaunch.disable().map_err(|e| e.to_string())?;
    }
    // El registro sigue siendo la fuente de verdad al leer (ver `get_config`),
    // pero se persiste también en config.toml para que el archivo no mienta
    // si alguien lo inspecciona a mano.
    let mut cfg = config::load();
    cfg.launch_on_startup = enabled;
    config::save(&cfg)
}

#[tauri::command]
pub fn set_start_minimized_to_tray(enabled: bool) -> Result<(), String> {
    let mut cfg = config::load();
    cfg.start_minimized_to_tray = enabled;
    config::save(&cfg)
}

/// Cuántas animaciones pueden estar colocadas a la vez.
///
/// No emite `config-changed` ni intenta ampliar el pool en caliente: las
/// ventanas overlay solo pueden crearse durante `setup()`, así que el valor
/// nuevo no entra en vigor hasta el siguiente arranque. La interfaz avisa de
/// ello en vez de fingir que el cambio es inmediato.
#[tauri::command]
pub fn set_overlay_pool_size(count: u32) -> Result<(), String> {
    let mut cfg = config::load();
    cfg.overlay_pool_size = count.clamp(1, window_manager::MAX_POOL);
    config::save(&cfg)
}

#[tauri::command]
pub fn set_confirm_media_delete(enabled: bool) -> Result<(), String> {
    let mut cfg = config::load();
    cfg.confirm_media_delete = enabled;
    config::save(&cfg)
}
