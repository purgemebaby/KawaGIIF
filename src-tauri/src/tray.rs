use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::template::{self, EditorState};
use crate::window_manager;

/// Tray icon + menú contextual. No hace falta la crate `muda` como
/// dependencia directa — `tauri::menu::*` ya la envuelve internamente.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Abrir panel", true, None::<&str>)?;
    let kill_item = MenuItem::with_id(app, "kill_all", "Matar todas las animaciones", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open_item, &separator, &kill_item, &separator, &quit_item])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("la app debería tener un ícono por defecto empaquetado");

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_control(app),
            "kill_all" => {
                let state = app.state::<EditorState>();
                template::kill_all_overlays(app.clone(), state);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        show_control(app);
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn show_control(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
