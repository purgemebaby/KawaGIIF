// This module controls the overlay system with an Object Pool of WebViewWindows
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use crate::native;
pub const CONTROL_LABEL: &str = "control";
pub const OV_LABEL: &str = "OV-SLOT-";
pub const MAX_POOL: u32 = 20;


// How many overlay windows the app reserves at startup.
// This is the maximum number of simultaneous animations that can be placed on the desktop.
// If the user changes the setting, it will only take effect after restarting the app.
pub fn pool_size() -> usize {
    static SIZE: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
    *SIZE.get_or_init(|| crate::config::load().overlay_pool_size.clamp(1, MAX_POOL) as usize)
}

pub fn slot_label(slot: usize) -> String {
    format!("{OV_LABEL}{slot}")
}



#[cfg(target_os = "windows")]
fn reapply_overlay_style(window: &WebviewWindow) {
    if let Ok(hwnd) = window.hwnd() {
        native::windows::force_hide_from_taskbar(hwnd);
        native::windows::force_borderless(hwnd);
        native::windows::disable_dwm_focus_border(hwnd);
        native::windows::ensure_layered(hwnd);
        native::windows::clear_class_background(hwnd);
    }
    let _ = window.set_always_on_top(true);
}

#[cfg(not(target_os = "windows"))]
fn reapply_overlay_style(_window: &WebviewWindow) {}

/// Mantiene la animación dentro del área útil del escritorio.
///
/// El límite de abajo es el borde superior de la barra de tareas, no el de la
/// pantalla: una animación tapando la barra estorba de verdad, porque las
/// overlays son click-through y no se puede apartar. Arriba, en cambio, el
/// límite sí es el borde físico de la pantalla, que es lo pedido.
///
/// El área útil la da Windows (`MONITORINFO.rcWork`), así que funciona con la
/// barra de tareas arriba, abajo o a los lados, y con varias pantallas: se
/// consulta la del monitor donde esté cada ventana.
///
/// Devuelve `true` si tuvo que corregir la posición.
pub fn clamp_to_work_area(window: &WebviewWindow) -> bool {
    #[cfg(target_os = "windows")]
    {
        let Ok(hwnd) = window.hwnd() else {
            return false;
        };
        let Some((wx, wy, ww, wh)) = native::windows::work_area_for(hwnd) else {
            return false;
        };
        let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) else {
            return false;
        };

        let w = size.width as i32;
        let h = size.height as i32;

        // Se limita cada eje por separado. El máximo se calcula antes que el
        // mínimo y luego se aplica el mínimo encima: si la animación es más
        // grande que el área útil, así se queda pegada al borde superior
        // izquierdo en vez de irse a coordenadas negativas.
        let max_x = wx + ww - w;
        let max_y = wy + wh - h;
        let new_x = pos.x.min(max_x).max(wx);
        let new_y = pos.y.min(max_y).max(wy);

        if new_x != pos.x || new_y != pos.y {
            let _ = window.set_position(tauri::PhysicalPosition::new(new_x, new_y));
            return true;
        }
    }
    false
}

/// Click-through de una ventana overlay.
///
/// **Usar SIEMPRE esta, nunca `window.set_ignore_cursor_events`.** La de Tauri
/// quita `WS_EX_LAYERED` junto con `WS_EX_TRANSPARENT` al desactivarla, y con
/// ello la transparencia real de la ventana: la animación quedaba rodeada de la
/// superficie opaca de su propia ventana, que se veía como un marco gris al
/// entrar al modo edición. Ver la nota larga en `native::windows::set_click_through`.
pub fn set_overlay_click_through(window: &WebviewWindow, enabled: bool) {
    // Se usa la implementación de Tauri, NO una propia. Reimplementarla a mano
    // tocando solo `WS_EX_TRANSPARENT` parecía más limpio pero rompió el
    // click-through: cambiar `GWL_EXSTYLE` no basta, Windows necesita además un
    // `SetWindowPos` con `SWP_FRAMECHANGED` para recalcular el hit-testing, y
    // sin él la animación se podía arrastrar fuera del modo edición.
    let _ = window.set_ignore_cursor_events(enabled);

    // Lo único que hay que corregir de ella: al DESACTIVARLA se lleva
    // `WS_EX_LAYERED` junto con `WS_EX_TRANSPARENT`, y con él la transparencia
    // real por píxel de la ventana.
    #[cfg(target_os = "windows")]
    if let Ok(hwnd) = window.hwnd() {
        native::windows::ensure_layered(hwnd);
    }
}

/// Sube una ventana concreta a lo más alto del orden Z.
///
/// `set_edit_mode` las llama de atrás hacia delante para dejar el panel de
/// control por delante de las animaciones: cada llamada pone ESA ventana en lo
/// más alto, así que la última que se sube es la que acaba encima.
fn raise_label(app: &AppHandle, label: &str) {
    #[cfg(target_os = "windows")]
    if let Some(window) = app.get_webview_window(label) {
        if let Ok(hwnd) = window.hwnd() {
            native::windows::raise_to_top(hwnd);
        }
    }
}

pub fn raise_slot(app: &AppHandle, slot: usize) {
    raise_label(app, &slot_label(slot));
}

pub fn raise_control(app: &AppHandle) {
    raise_label(app, CONTROL_LABEL);
}

/// Reafirma los estilos de un slot concreto, desde fuera de este módulo.
///
/// Red de seguridad en las transiciones de modo edición. El marco que se veía
/// al entrar al editor NO venía de aquí —era `WS_EX_LAYERED`, que se perdía en
/// `set_ignore_cursor_events`; ver `set_overlay_click_through`— pero reafirmar
/// los estilos en esas transiciones sigue siendo barato y correcto.
pub fn reassert_slot_style(app: &AppHandle, slot: usize) {
    if let Some(window) = app.get_webview_window(&slot_label(slot)) {
        reapply_overlay_style(&window);
    }
}

/// La ventana de control nace OCULTA y `setup()` decide si mostrarla, según
/// el ajuste `start_minimized_to_tray`. Es seguro hacerlo así porque esta
/// ventana no es transparente: el bug de `WS_EX_LAYERED` descrito en
/// `create_overlay_pool` solo afecta a las que sí lo son.
pub fn create_control_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, CONTROL_LABEL, WebviewUrl::App("index.html".into()))
        .title("KawaGiif")
        .inner_size(960.0, 640.0)
        .min_inner_size(720.0, 480.0)
        .decorations(true)
        .transparent(false)
        .resizable(true)
        .visible(false)
        .build()
}

/// Reafirma periódicamente que las overlays visibles están por encima de todo.
///
/// Hace falta porque el único momento en que se reaplicaban los estilos era el
/// evento `Focused`, y una overlay en click-through **nunca recibe foco**: es
/// justo lo que significa que los clics la atraviesen. Así que cuando otra
/// aplicación se declara topmost —un juego en ventana sin bordes es el caso
/// típico— las animaciones quedaban detrás y ya nada volvía a subirlas.
///
/// Un juego en pantalla completa EXCLUSIVA sigue quedando fuera de alcance, y
/// no por un fallo nuestro: en ese modo el juego toma el control directo de la
/// salida de vídeo y deja al compositor del escritorio fuera del circuito, con
/// lo que el orden de apilado en el que vive `TOPMOST` ya no decide lo que se
/// ve. La única solución para el usuario es poner el juego en ventana sin
/// bordes.
///
/// Cada 2 s: suficiente para que recuperar la posición se perciba inmediato, y
/// lo bastante espaciado como para no aparecer en el perfil de CPU.
pub fn spawn_topmost_keeper(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let app = app.clone();
        // La manipulación de ventanas tiene que ocurrir en el hilo principal;
        // si el bucle de eventos ya murió, esto falla y salimos del hilo.
        if app
            .clone()
            .run_on_main_thread(move || {
                for (label, window) in app.webview_windows() {
                    if !label.starts_with(OV_LABEL) {
                        continue;
                    }
                    if window.is_visible().unwrap_or(false) {
                        #[cfg(debug_assertions)]
                        if let Ok(hwnd) = window.hwnd() {
                            let s = native::windows::describe_styles(hwnd);
                            if s.contains("LAYERED=false") {
                                println!("[kawagiif] TRANSPARENCIA PERDIDA en {label}: {s}");
                            }
                            if native::windows::has_nonclient_frame(hwnd) {
                                println!("[kawagiif] MARCO DE VUELTA en {label}");
                            }
                        }
                        reapply_overlay_style(&window);
                    }
                }
            })
            .is_err()
        {
            break;
        }
    });
}

/// Vuelca el estado real de cada ventana overlay ocupada.
///
/// `momento` describe qué acababa de pasar ("arranque", "entra al editor",
/// "sale del editor"), que es justo lo que hace falta para atar un síntoma
/// visual a una transición concreta: las animaciones se ven bien al arrancar,
/// aparecen marcos al entrar al editor, y al salir se quedan invisibles. Con
/// esto se ve en qué transición cambia qué estilo, en vez de suponerlo.
///
/// Solo en desarrollo: en release no se compila.
#[cfg(debug_assertions)]
pub fn log_overlay_state(app: &AppHandle, momento: &str) {
    println!("[kawagiif] --- overlays: {momento} ---");

    // El desglose de memoria va junto al de ventanas y no por separado: la
    // pregunta útil no es "cuánta RAM" sino "cuánta RAM PARA CUÁNTAS ventanas
    // visibles", y separarlos obligaría a cuadrar dos logs a mano.
    let breakdown = crate::system_stats::debug_memory_breakdown(app.state());
    for line in breakdown.lines() {
        println!("[kawagiif] {line}");
    }

    for slot in 0..pool_size() {
        let label = slot_label(slot);
        let Some(w) = app.get_webview_window(&label) else {
            continue;
        };
        // Las ocultas son ruido: el pool casi siempre tiene más libres que
        // ocupadas y llenarían el log sin aportar nada.
        if !w.is_visible().unwrap_or(false) {
            continue;
        }
        let styles = w
            .hwnd()
            .map(native::windows::describe_styles)
            .unwrap_or_else(|e| format!("(sin HWND: {e})"));
        println!(
            "[kawagiif]   {label}: pos={:?} tam={:?} | {styles}",
            w.outer_position().map(|p| (p.x, p.y)).ok(),
            w.inner_size().map(|s| (s.width, s.height)).ok(),
        );
        // Geometría de la ventana y de sus hijas: si el control de WebView2 no
        // cubre el área cliente entera, ese hueco ES el borde blanco.
        if let Ok(hwnd) = w.hwnd() {
            for line in native::windows::describe_geometry(hwnd).lines() {
                println!("[kawagiif]     {line}");
            }
        }
    }
}

#[cfg(not(debug_assertions))]
pub fn log_overlay_state(_app: &AppHandle, _momento: &str) {}

/// Comando de diagnóstico: vuelca la geometría real de los monitores.
/// Sirve para comprobar con datos dónde cae cada pantalla, en vez de a
/// ojo. Solo se compila en desarrollo.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn debug_monitor(app: AppHandle) -> String {
    let mut out = String::new();

    if let Ok(monitors) = app.available_monitors() {
        for m in &monitors {
            out.push_str(&format!(
                "monitor {:?}: pos={:?} size={:?} scale={}\n",
                m.name(),
                m.position(),
                m.size(),
                m.scale_factor()
            ));
        }
    }
    if let Ok(Some(m)) = app.primary_monitor() {
        out.push_str(&format!(
            "PRIMARIO: pos={:?} size={:?} scale={}\n",
            m.position(),
            m.size(),
            m.scale_factor()
        ));
    }
    out
}

/// Precrea las `pool_size()` ventanas overlay, todas ocultas, dentro
/// de `setup()`.
///
/// POR QUÉ EXISTE ESTE POOL (en vez de crear una ventana nueva por cada
/// animación colocada, que sería el diseño obvio): se confirmó
/// empíricamente, comparando el EXSTYLE crudo vía la API de Win32, que
/// cualquier ventana `transparent(true)` creada DESPUÉS de que la app ya
/// terminó de arrancar — sea directamente dentro de un command handler, o
/// despachada explícitamente al hilo principal con `run_on_main_thread` —
/// nace sin `WS_EX_LAYERED`: la transparencia nunca se aplica y la ventana
/// se ve blanca y opaca. Una ventana con el mismo código exacto, creada en
/// cambio durante `setup()` (antes de que arranque el loop de eventos),
/// siempre queda con `WS_EX_LAYERED` correcto. No es una condición de
/// carrera menor — se probó reordenar el reaplicado de estilo, sacar el
/// `.hide()` inmediato, mover a `run_on_main_thread`, y nada lo arregló
/// salvo crear la ventana en `setup()`.
///
/// La solución: todas las ventanas físicas que van a hacer falta se crean
/// de una sola vez acá, ocultas. Colocar una animación no crea una ventana
/// nueva — asigna un slot libre del pool (`template::place_item_in_slot`) y
/// lo reposiciona/redimensiona/muestra. Quitar una animación libera el slot
/// (lo oculta y lo vuelve a poner en la lista de libres) para que se pueda
/// reusar. Esto pone un techo de `pool_size()` animaciones simultáneas — ver
/// ese valor arriba.
///
/// La medición está reproducida y es concluyente: una ventana transparente
/// creada en caliente sale con `WS_EX_LAYERED` ausente, y **redimensionarla
/// después no lo añade** (era la vía que sugería el issue tauri#10318, que
/// resultó describir otro fallo distinto, de repintado en Windows 11). Por
/// eso el pool sigue aquí en vez de crear ventanas bajo demanda.
pub fn create_overlay_pool(app: &AppHandle) -> tauri::Result<()> {
    for slot in 0..pool_size() {
        let label = slot_label(slot);
        // `overlay.html`, no `index.html`: cada ventana del pool es un proceso
        // de render propio, así que cargar aquí el bundle de la app de control
        // (editor, biblioteca, ajustes) se pagaba multiplicado por el tamaño
        // del pool. Ver la nota de `vite.config.ts`.
        let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("overlay.html".into()))
            .title("")
            .position(0.0, 0.0)
            .inner_size(200.0, 200.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            //
            // ⚠️ `.shadow(false)` NO es opcional, y su ausencia costó siete
            // diagnósticos fallidos. De la documentación de Tauri:
            //
            //   `true` will make undecorated window have a 1px white border,
            //   and on Windows 11, it will have a rounded corners.
            //
            // Y viene activada POR DEFECTO (`decoration_shadow: true` en
            // `tao/src/platform_impl/windows/mod.rs`). En una ventana sin
            // decoración, tao reserva entonces un marco oculto alrededor
            // ("undecorated windows with shadows have hidden offsets",
            // `tao/.../window.rs`), que Windows 11 pinta como borde blanco con
            // las esquinas redondeadas. Es el borde que se veía alrededor de
            // las animaciones, y también el desplazamiento de 8 px que hubo
            // que compensar a mano.
            //
            // Se buscó en flags de estilo, en CSS, en atributos DWM y en el
            // renderizado no-cliente. Estaba en una opción del constructor.
            .shadow(false)
            // Fondo del webview explícitamente transparente. La documentación
            // de Tauri avisa de que en Windows el alfa se ignora… salvo si vale
            // 0, que es justo este caso: alfa 0 sí se respeta desde Windows 8.
            .background_color(tauri::webview::Color(0, 0, 0, 0))
            // Clase de ventana PROPIA, distinta de la de la ventana de control.
            // Es el requisito para poder quitarle el pincel de fondo blanco sin
            // tocar el resto de la app — ver `native::windows::clear_class_background`.
            .window_classname("KawaGiifOverlay")
            .visible(false)
            .build()?;

        set_overlay_click_through(&window, true);
        reapply_overlay_style(&window);

        #[cfg(target_os = "windows")]
        {
            let window_for_focus = window.clone();
            let window_for_geometry = window.clone();
            let app_for_geometry = app.clone();
            window.clone().on_window_event(move |event| match event {
                tauri::WindowEvent::Focused(_) => reapply_overlay_style(&window_for_focus),
                tauri::WindowEvent::Moved(pos) => {
                    // El arrastre lo gestiona Windows, así que no se puede
                    // impedir que salga del área útil: solo corregirlo después.
                    // Si hubo corrección, `set_position` dispara otro `Moved`
                    // con la posición ya válida, que esta vez no corrige nada
                    // y cierra el ciclo — sin bucle infinito.
                    if clamp_to_work_area(&window_for_geometry) {
                        return;
                    }
                    crate::template::update_slot_geometry(
                        &app_for_geometry,
                        slot,
                        Some((pos.x, pos.y)),
                        None,
                    );
                }
                tauri::WindowEvent::Resized(size) => {
                    crate::template::update_slot_geometry(
                        &app_for_geometry,
                        slot,
                        None,
                        Some((size.width, size.height)),
                    );
                }
                _ => {}
            });
        }
    }

    Ok(())
}

/// Reposiciona, redimensiona y muestra la ventana pooled del slot dado —
/// esto es lo que "coloca" una animación en el escritorio, sin crear
/// ninguna ventana nueva.
///
/// La geometría va en píxeles FÍSICOS. Es la unidad que usa toda la app
/// : los eventos `Moved`/`Resized` que
/// alimentan `template::update_slot_geometry` la devuelven en física, así
/// que leerla aquí en lógica hacía que `PlacedMedia.x/y/w/h` se escribiera
/// en una unidad y se leyera en otra. Con escalado al 100% coinciden, por
/// eso el bug pasaba desapercibido.
pub fn show_slot(
    app: &AppHandle,
    slot: usize,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    interactive: bool,
) -> Result<(), String> {
    let label = slot_label(slot);
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("no existe la ventana del slot {slot}"))?;

    window
        .set_position(tauri::PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    set_overlay_click_through(&window, !interactive);
    window.show().map_err(|e| e.to_string())?;

    // Reaplicar AQUÍ, y no solo al crear el pool y en el evento `Focused`, es
    // imprescindible: una overlay restaurada al arrancar nunca recibe foco
    // (nace click-through), así que se quedaba con los estilos que le deja tao
    // y que Tauri no limpia de forma fiable. Medido en el log de arranque:
    //
    //   OV-SLOT-6: APPWINDOW=true TOOLWINDOW=false WINDOWEDGE=true CAPTION=true
    //
    // Es decir, exactamente lo contrario de lo que buscan `force_borderless` y
    // `force_hide_from_taskbar`: esas ventanas salían en la barra de tareas y
    // en el Alt+Tab, y `WINDOWEDGE` es el marco fino que se venía reportando.
    //
    // `show()` es el único punto por el que pasan todas las animaciones al
    // aparecer, vengan de la plantilla al arrancar o de colocarlas a mano, así
    // que es el sitio correcto para asegurarlo.
    reapply_overlay_style(&window);

    // Una sola vez, al mostrarse: la sube por encima de la barra de tareas sin
    // condenarla a ganarle siempre a todo lo demás (ver la nota de
    // `reapply_overlay_style`).
    #[cfg(target_os = "windows")]
    if let Ok(hwnd) = window.hwnd() {
        native::windows::raise_to_top(hwnd);
    }

    // Una plantilla guardada antes de existir este límite puede traer
    // animaciones encima de la barra de tareas; se recolocan al restaurarlas.
    clamp_to_work_area(&window);

    Ok(())
}

/// Oculta la ventana pooled del slot dado y la deja click-through — el
/// slot queda libre para que `template::allocate_slot` lo reuse.
pub fn hide_slot(app: &AppHandle, slot: usize) {
    if let Some(window) = app.get_webview_window(&slot_label(slot)) {
        set_overlay_click_through(&window, true);
        let _ = window.hide();
    }
}

/// Oculta todas las ventanas del pool que estén visibles — usado por
/// "matar todas las ventanas" y por el cierre en cascada. No cierra las
/// ventanas (son parte fija del pool), solo las esconde.
pub fn hide_all_overlay_slots(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(OV_LABEL) {
            set_overlay_click_through(&window, true);
            let _ = window.hide();
        }
    }
}
