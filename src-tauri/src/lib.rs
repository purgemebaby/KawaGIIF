mod commands;
mod config;
mod library;
mod native;
mod system_stats;
mod template;
mod tray;
mod window_manager;

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use template::EditorState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Escape local solo funciona si el overlay que lo recibe tiene el foco
    // de teclado, y con click-through activo no hay forma de volver a
    // clickearlo para dárselo. Este atajo global es la vía de escape que
    // funciona sin importar qué ventana tenga el foco — se aplica a TODAS
    // las overlays activas, no solo a la que tuviera el foco.
    let release_shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Escape);

    tauri::Builder::default()
        .manage(EditorState::default())
        .manage(system_stats::SysState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if *shortcut == release_shortcut && event.state == ShortcutState::Pressed {
                        for (label, window) in app.webview_windows() {
                            if label.starts_with(window_manager::OV_LABEL) {
                                window_manager::set_overlay_click_through(&window, false);
                                let _ = app.emit_to(
                                    tauri::EventTarget::webview_window(&label),
                                    "click-through-changed",
                                    false,
                                );
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::set_click_through,
            commands::resize_overlay,
            commands::hide_control_window,
            library::import_media,
            library::list_media,
            library::update_media_tags,
            library::list_all_tags,
            library::rename_tag,
            library::delete_tag,
            library::delete_media,
            library::get_media_path,
            library::get_file_size,
            commands::get_config,
            commands::set_launch_on_startup,
            commands::set_start_minimized_to_tray,
            commands::set_confirm_media_delete,
            commands::set_overlay_pool_size,
            commands::set_control_minimizable,
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
            #[cfg(debug_assertions)]
            window_manager::debug_monitor,
        ])
        .setup(move |app| {
            // Lo PRIMERO, antes de crear ninguna ventana: medio comportamiento
            // nativo de esta app depende de la versión de Windows y del motor
            // web, y dar por supuesta cualquiera de las dos ya costó seis
            // diagnósticos fallidos. Ver `system_stats::log_environment`.
            #[cfg(debug_assertions)]
            system_stats::log_environment();

            let app_handle = app.handle();
            let control = window_manager::create_control_window(app_handle)?;
            window_manager::create_overlay_pool(app_handle)?;

            // Cerrar con el botón X no cierra la app — la esconde a la
            // bandeja del sistema (patrón estándar tipo Discord/Slack). El
            // cierre real es "Salir" desde el menú del tray, que sí llama
            // a `app.exit(0)` y dispara el cierre en cascada de más abajo.
            //
            // Con el editor abierto y cambios sin guardar, ni siquiera se
            // esconde: se le pasa la pelota a React vía `close-requested`
            // para que muestre la guarda de guardar/descartar/cancelar.
            // Ocultarla sin preguntar dejaría la edición en un limbo.
            let control_for_close = control.clone();
            control.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();

                    let state = control_for_close.state::<EditorState>();
                    let dirty = *state.working.lock().unwrap() != *state.saved.lock().unwrap();
                    let editing = *state.edit_mode.lock().unwrap();

                    if editing && dirty {
                        let _ = control_for_close.emit_to(
                            tauri::EventTarget::webview_window(window_manager::CONTROL_LABEL),
                            "close-requested",
                            (),
                        );
                    } else {
                        let _ = control_for_close.hide();
                    }
                }
            });

            // Abrir las devtools solo en desarrollo. En release ni siquiera
            // se compila esta línea.
            #[cfg(debug_assertions)]
            control.open_devtools();

            // Si ya hay una plantilla guardada de una sesión anterior, sus
            // animaciones se colocan acá mismo en modo NO interactivo — así
            // la app funciona como wallpaper real apenas arranca, sin que
            // haga falta pasar por el editor primero.
            let state = app_handle.state::<EditorState>();
            template::spawn_saved_template_on_boot(app_handle, &state);

            app.global_shortcut().register(release_shortcut)?;

            tray::setup(app_handle)?;

            // Las overlays son click-through, así que nunca reciben foco y el
            // reaplicado de estilos por `Focused` no llega a dispararse nunca
            // para ellas. Sin esto, cualquier app que se declare topmost las
            // deja detrás para siempre.
            window_manager::spawn_topmost_keeper(app_handle);

            // La ventana se creó oculta; se muestra salvo que el usuario haya
            // pedido arrancar minimizado en la bandeja. Hasta ahora este
            // ajuste se guardaba pero nunca se leía, así que no hacía nada.
            if !config::load().start_minimized_to_tray {
                let _ = control.show();
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error al construir la aplicación Tauri")
        .run(|app, event| {
            // Cualquier camino de salida real (Quit desde el tray, o en el
            // futuro Alt+F4 si algún día se permite) converge acá — un solo
            // punto de cierre en cascada, sin duplicar la lógica.
            //
            // Los cambios sin guardar del editor se DESCARTAN. Aquí no se
            // puede mostrar un diálogo (el proceso ya está cerrando), así que
            // hay que elegir un comportamiento fijo, y descartar es el que
            // deja el disco coincidiendo siempre con lo que verás al reabrir.
            // Las salidas que sí pueden preguntar (minimizar, cerrar con la
            // X, navegar fuera del editor) tienen su guarda en React.
            if let tauri::RunEvent::ExitRequested { .. } = event {
                let state = app.state::<EditorState>();
                let saved = state.saved.lock().unwrap().clone();
                *state.working.lock().unwrap() = saved;

                window_manager::hide_all_overlay_slots(app);
            }
        });
}
