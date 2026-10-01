// App entry point.
// Registers the plugins, the shared state and every command the frontend can
// call, creates the windows at startup, and decides what closing and quitting do.

mod commands;
mod config;
mod error;
mod library;
#[cfg(windows)]
mod native;
mod system_stats;
mod template;
mod tray;
mod window_manager;

use tauri::{AppHandle, Emitter, EventTarget, Manager, RunEvent, WebviewWindow, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use library::LibraryState;
use system_stats::SysState;
use template::EditorState;

/* Personal Note for me:
- tauri: the app framework.
    - AppHandle: handle to the running app.
    - Emitter: trait that adds `.emit_to()` to send an event to one window.
    - EventTarget: says WHICH window an event goes to.
    - Manager: trait that adds `state`, `get_webview_window`, `handle`, ...
    - RunEvent: app-wide events from the event loop (e.g. "the app is about to exit").
    - WebviewWindow: a native window with a web page inside.
    - WindowEvent: events of one window (e.g. "the user clicked the X").
- tauri_plugin_global_shortcut: keyboard shortcuts that work even when the app has no focus.
    - Shortcut: a key combination.
    - Modifiers / Code: the Ctrl/Alt/Shift part and the key part of it.
    - ShortcutState: pressed or released.
    - GlobalShortcutExt: trait that adds `.global_shortcut()` to register shortcuts.
- library::LibraryState / system_stats::SysState / template::EditorState:
  our shared state, registered once with `.manage()` so commands can use it.
*/

/**
 * Turns click-through off on every overlay.
 *
 * It's bound to a global shortcut, not to a key inside the overlay: with
 * click-through on, an overlay can't be clicked, so it can never get the
 * keyboard focus a local key listener would need.
 */
fn release_all_click_through(app: &AppHandle) {
    for window in window_manager::overlay_windows(app) {
        window_manager::set_overlay_click_through(&window, false);
        let _ = app.emit_to(
            EventTarget::webview_window(window.label()),
            "click-through-changed",
            false,
        );
    }
}

/**
 * The X button hides the app to the tray instead of quitting; the real exit
 * is "Quit" in the tray menu. If the editor is open with unsaved changes,
 * the window doesn't hide either: React gets `close-requested` and shows
 * the save / discard / cancel guard, so no edit is left in limbo.
 */
fn handle_control_close(control: &WebviewWindow) {
    let pending_edit = {
        let editor = control.state::<EditorState>();
        let editor = editor.lock();
        editor.is_editing() && editor.is_dirty()
    };
    if pending_edit {
        let _ = control.emit_to(
            EventTarget::webview_window(window_manager::CONTROL_LABEL),
            "close-requested",
            (),
        );
    } else {
        let _ = control.hide();
    }
}

/**
 * Every real exit ends here. Unsaved editor changes are discarded, because
 * no dialog can be shown while the process is shutting down, and
 * discarding keeps the disk matching what reopening the app will show.
 */
fn handle_exit(app: &AppHandle) {
    app.state::<EditorState>().lock().discard_changes();
    window_manager::hide_all_overlay_slots(app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let release_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Escape);

    tauri::Builder::default()
        .manage(EditorState::default())
        .manage(LibraryState::default())
        .manage(SysState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if *shortcut == release_shortcut && event.state == ShortcutState::Pressed {
                        release_all_click_through(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::resize_overlay,
            commands::hide_control_window,
            commands::get_config,
            commands::set_launch_on_startup,
            commands::set_start_minimized_to_tray,
            commands::set_confirm_media_delete,
            commands::set_overlay_pool_size,
            commands::set_control_minimizable,
            library::import_media,
            library::list_media,
            library::update_media_tags,
            library::list_all_tags,
            library::rename_tag,
            library::delete_tag,
            library::delete_media,
            library::get_media_path,
            library::get_file_size,
            system_stats::get_system_stats,
            #[cfg(debug_assertions)]
            system_stats::debug_memory_breakdown,
            template::load_template,
            template::get_working_template,
            template::has_unsaved_changes,
            template::list_placed_items,
            template::save_template,
            template::discard_template_changes,
            template::set_edit_mode,
            template::select_overlay,
            template::get_placed_media,
            template::get_instance_id_for_window,
            template::get_editor_status,
            template::set_item_opacity,
            template::set_item_playback_rate,
            template::spawn_placed_media,
            template::remove_placed_media,
            template::nudge_overlay,
            template::fit_overlay_to_media,
            template::kill_all_overlays,
        ])
        .setup(move |app| {
            #[cfg(debug_assertions)]
            system_stats::log_environment();

            let handle = app.handle();
            let control = window_manager::create_control_window(handle)?;
            window_manager::create_overlay_pool(handle)?;

            let control_for_close = control.clone();
            control.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    handle_control_close(&control_for_close);
                }
            });

            #[cfg(debug_assertions)]
            control.open_devtools();

            template::spawn_saved_template_on_boot(handle, &handle.state::<EditorState>());
            app.global_shortcut().register(release_shortcut)?;
            tray::setup(handle)?;
            window_manager::spawn_topmost_keeper(handle);

            if !config::load().start_minimized_to_tray {
                let _ = control.show();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build the Tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } = event {
                handle_exit(app);
            }
        });
}
