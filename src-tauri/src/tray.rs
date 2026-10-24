/* System tray icon and its menu. */
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::config;
use crate::template::{self, EditorState};
use crate::window_manager;

/* Personal Note for me:
- tauri::menu: Menu is a native menu and MenuItem a clickable entry identified by an id string; PredefinedMenuItem the
  built-in ones (separator).
- tauri::tray: TrayIconBuilder creates the icon and TrayIconEvent says what happened to it (click, hover...).
*/

// the id the tray icon is built with, so apply_language can find it again
const TRAY_ID: &str = "main";


/** Recovers main app window (identified by `CONTROL_LABEL`) and depending of its visibility,
the function will hide the main app window or show it.*/
fn toggle_control(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        if window.is_visible().unwrap_or(false) {
            window_manager::hide_control(app);
        } else {
            window_manager::show_control(app);
        }
    }
}


/** Tray labels (`open`, `kill_all`, `quit`) in a UI language; anything else falls back to English. */
fn labels(language: &str) -> [&'static str; 3] {
    match language {
        "es" => ["Abrir panel", "Cerrar todas las animaciones", "Salir"],
        _ => ["Open panel", "Kill all animations", "Quit"],
    }
}

/** Builds the tray menu in the given language, both at startup and when the language changes. */
fn build_menu(app: &AppHandle, language: &str) -> tauri::Result<Menu<Wry>> {
    let [open, kill, quit] = labels(language);
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let kill = MenuItem::with_id(app, "kill_all", kill, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    Menu::with_items(app, &[&open, &separator, &kill, &separator, &quit])
}

/** Rebuilds the tray menu in the given language, so a language switch relabels it live; no tray yet just succeeds. */
pub fn apply_language(app: &AppHandle, language: &str) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let menu = build_menu(app, language)?;
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}


//Tray displayable menu of commands and toggle control
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &config::load().language)?;

    let icon = app.default_window_icon().cloned().expect("the app should bundle a default icon");

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => window_manager::show_control(app),
            "kill_all" => template::kill_all_overlays(app.clone(), app.state::<EditorState>()),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click{
                button: MouseButton::Left,
                button_state: MouseButtonState::Up, .. } = event {toggle_control(tray.app_handle());}
        }).build(app)?;
    Ok(())
}