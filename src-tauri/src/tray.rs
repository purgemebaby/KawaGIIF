// System tray icon.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::template::{self, EditorState};
use crate::window_manager;

/* Personal Note for me:
- tauri.
    - menu::Menu: Native menu made of items.
    - menu::MenuItem: one clickable entry, identified by an id string.
    - menu::PredefinedMenuItem: built-in entries.
    - tray::TrayIconBuilder: sets up and creates the tray icon.
    - tray::TrayIconEvent: what happened to the icon (click, hover, ...).
    - tray::MouseButton / MouseButtonState: which button, and pressed or released.
    - AppHandle: handle to the running app.
    - Manager: trait that adds `get_webview_window`, `state`, `default_window_icon`.
- crate::template: the placed animations, for "Kill all animations".
- crate::window_manager: for the control window label.
*/

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open panel", true, None::<&str>)?;
    let kill = MenuItem::with_id(app, "kill_all", "Kill all animations", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &separator, &kill, &separator, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("the app should bundle a default icon");

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_control(app),
            "kill_all" => template::kill_all_overlays(app.clone(), app.state::<EditorState>()),
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
                toggle_control(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn toggle_control(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_control(app);
        }
    }
}

fn show_control(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
