use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::config;
use crate::window_manager;

/// Geometría en píxeles FÍSICOS desde el esquema 2 — ver la nota de
/// `window_manager::show_slot` sobre por qué toda la app usa una sola unidad.
#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct PlacedMedia {
    pub instance_id: String,
    pub media_id: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub opacity: f32,
    pub playback_rate: Option<f32>,
    /// Si la ventana ya se ajustó al tamaño real del medio.
    ///
    /// Antes esto se deducía comparando el tamaño con el de creación
    /// (220×220), y era frágil: en cuanto el evento `Resized` escribía un
    /// valor ligeramente distinto, la comparación fallaba y el ajuste no se
    /// hacía nunca — de ahí que las bandas negras salieran unas veces sí y
    /// otras no. Una marca explícita no puede desincronizarse.
    #[serde(default)]
    pub auto_sized: bool,
}

#[derive(Serialize, Deserialize, Clone, Default, PartialEq)]
pub struct Template {
    #[serde(default = "schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub items: Vec<PlacedMedia>,
}

/// v1: geometría en píxeles lógicos. v2: en físicos.
const CURRENT_TEMPLATE_SCHEMA: u32 = 2;

fn schema_version() -> u32 {
    CURRENT_TEMPLATE_SCHEMA
}

/// Resumen de un elemento colocado, ya cruzado con la biblioteca del lado de
/// Rust. Así la lista del editor se pinta con UNA llamada en vez de una por
/// elemento para resolver su nombre de archivo.
#[derive(Serialize)]
pub struct PlacedItemSummary {
    pub instance_id: String,
    pub media_id: String,
    pub original_file_name: String,
    pub media_type: crate::library::MediaType,
    pub selected: bool,
}

pub struct EditorState {
    pub working: Mutex<Template>,
    pub saved: Mutex<Template>,
    pub selected: Mutex<Option<String>>,
    pub edit_mode: Mutex<bool>,
    // Asignación en tiempo de ejecución de instance_id -> slot del pool de
    // ventanas overlay. NO se persiste — al reiniciar la app se reasignan
    // slots frescos por orden de aparición en la plantilla. Ver la nota
    // larga en `window_manager::create_overlay_pool` sobre por qué existe
    // un pool en vez de crear una ventana por animación.
    slot_by_instance: Mutex<HashMap<String, usize>>,
    instance_by_slot: Mutex<HashMap<usize, String>>,
    free_slots: Mutex<Vec<usize>>,
}

impl Default for EditorState {
    fn default() -> Self {
        Self {
            working: Mutex::new(Template::default()),
            saved: Mutex::new(Template::default()),
            selected: Mutex::new(None),
            edit_mode: Mutex::new(false),
            slot_by_instance: Mutex::new(HashMap::new()),
            instance_by_slot: Mutex::new(HashMap::new()),
            free_slots: Mutex::new((0..window_manager::pool_size()).collect()),
        }
    }
}

fn template_path() -> PathBuf {
    config::data_dir().join("template.json")
}

/// Lee la plantilla y la migra si viene de un esquema anterior.
///
/// v1 → v2: la geometría se guardaba en píxeles LÓGICOS y ahora se guarda en
/// FÍSICOS. Se multiplica por el factor de escala del monitor principal, que
/// al 100% de escalado es 1.0 y por tanto no cambia nada — que es el caso de
/// la mayoría de plantillas existentes.
pub fn load_template_from_disk(app: &AppHandle) -> Template {
    let mut tpl: Template = match std::fs::read_to_string(template_path()) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => Template::default(),
    };

    if tpl.schema_version < 2 {
        let scale = app
            .primary_monitor()
            .ok()
            .flatten()
            .map(|m| m.scale_factor())
            .unwrap_or(1.0);

        for item in &mut tpl.items {
            item.x = (item.x as f64 * scale).round() as i32;
            item.y = (item.y as f64 * scale).round() as i32;
            item.width = (item.width as f64 * scale).round() as u32;
            item.height = (item.height as f64 * scale).round() as u32;
        }
        tpl.schema_version = CURRENT_TEMPLATE_SCHEMA;
    }

    tpl
}

fn save_template_to_disk(tpl: &Template) -> Result<(), String> {
    std::fs::create_dir_all(config::data_dir()).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(tpl).map_err(|e| e.to_string())?;
    // Escritura atómica: escribir a un temporal y renombrar, para no dejar
    // template.json a medio escribir si algo falla a mitad de camino.
    let tmp_path = config::data_dir().join("template.json.tmp");
    std::fs::write(&tmp_path, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, template_path()).map_err(|e| e.to_string())
}

/// Asigna un slot libre del pool a `instance_id`, lo reposiciona y lo
/// muestra, y avisa a esa ventana (que ya existe y está montada desde el
/// arranque — nunca se crea/destruye) qué instancia le toca mostrar ahora
/// vía el evento `slot-assigned`.
fn place_item_in_slot(
    app: &AppHandle,
    state: &EditorState,
    item: &PlacedMedia,
    interactive: bool,
) -> Result<(), String> {
    let slot = {
        let mut free = state.free_slots.lock().unwrap();
        free.pop()
            .ok_or_else(|| "se alcanzó el máximo de animaciones colocadas a la vez".to_string())?
    };

    state
        .slot_by_instance
        .lock()
        .unwrap()
        .insert(item.instance_id.clone(), slot);
    state
        .instance_by_slot
        .lock()
        .unwrap()
        .insert(slot, item.instance_id.clone());

    window_manager::show_slot(app, slot, item.x, item.y, item.width, item.height, interactive)?;

    emit_to_slot(app, slot, "slot-assigned", &item.instance_id);
    // Imprescindible, y su ausencia era el bug del tirador de redimensionado
    // que "a veces salía y a veces no": `set_edit_mode` solo avisa a los slots
    // ocupados EN ESE MOMENTO, así que una animación colocada ya dentro del
    // editor no se enteraba nunca de que estaba en modo edición y se quedaba
    // sin tirador. Las colocadas antes de entrar sí lo tenían — de ahí que
    // pareciera aleatorio.
    emit_to_slot(app, slot, "edit-mode-changed", interactive);

    Ok(())
}

/// Envía un evento a UNA sola ventana overlay.
///
/// Ojo con esto, que costó un bug muy feo: en Tauri v2 `emit` difunde a
/// TODAS las ventanas aunque lo llames sobre una `WebviewWindow` concreta
/// (por dentro hace `self.manager().emit(...)`, el manager de la app). Con
/// `window.emit` cada overlay recibía el `instance_id` de la última colocada
/// y se repintaba con ella: colocar una animación nueva cambiaba también las
/// que ya estaban.
///
/// La otra mitad del arreglo está en el frontend: un `listen()` pelado se
/// registra con target `Any`, que es un *sniffer* y recibe todo igualmente.
/// Por eso `OverlayItemApp` usa `getCurrentWebviewWindow().listen()`. Hacen
/// falta las dos mitades; con una sola no se arregla nada.
fn emit_to_slot<S: serde::Serialize + Clone>(
    app: &AppHandle,
    slot: usize,
    event: &str,
    payload: S,
) {
    let label = window_manager::slot_label(slot);
    let _ = app.emit_to(tauri::EventTarget::webview_window(&label), event, payload);
}

/// Igual que `emit_to_slot`, pero resolviendo antes el slot a partir del
/// `instance_id`. Si esa instancia no está colocada ahora mismo, no hace nada.
fn emit_to_instance<S: serde::Serialize + Clone>(
    app: &AppHandle,
    state: &EditorState,
    instance_id: &str,
    event: &str,
    payload: S,
) {
    let slot = state
        .slot_by_instance
        .lock()
        .unwrap()
        .get(instance_id)
        .copied();
    if let Some(slot) = slot {
        emit_to_slot(app, slot, event, payload);
    }
}

/// Libera el slot ocupado por `instance_id`, si tiene uno: oculta esa
/// ventana pooled y la devuelve a la lista de libres.
fn release_slot_for_instance(app: &AppHandle, state: &EditorState, instance_id: &str) {
    let slot = state.slot_by_instance.lock().unwrap().remove(instance_id);
    if let Some(slot) = slot {
        state.instance_by_slot.lock().unwrap().remove(&slot);
        window_manager::hide_slot(app, slot);
        state.free_slots.lock().unwrap().push(slot);
    }

    // Si justo era la seleccionada, no dejar la selección apuntando a un
    // instance_id que ya no existe — el panel de propiedades quedaría
    // mostrando controles para algo que ya no está.
    let mut selected = state.selected.lock().unwrap();
    if selected.as_deref() == Some(instance_id) {
        *selected = None;
        drop(selected);
        let _ = app.emit("selection-changed", Option::<String>::None);
    }
}

/// Libera TODOS los slots ocupados actualmente (oculta esas ventanas y
/// resetea el pool de libres completo). Usado antes de recrear todo desde
/// cero (arranque, deshacer) y por el botón "matar todas las ventanas".
fn release_all_slots(app: &AppHandle, state: &EditorState) {
    window_manager::hide_all_overlay_slots(app);
    state.slot_by_instance.lock().unwrap().clear();
    state.instance_by_slot.lock().unwrap().clear();
    *state.free_slots.lock().unwrap() = (0..window_manager::pool_size()).collect();
}

/// "Matar todas las ventanas": oculta todas las animaciones colocadas SIN
/// tocar `template.json` ni el estado en memoria de la plantilla — al
/// reabrir el editor o reiniciar la app, vuelven a aparecer intactas.
#[tauri::command]
pub fn kill_all_overlays(app: AppHandle, state: State<EditorState>) {
    release_all_slots(&app, &state);
    notify_placed_items_changed(&app);
}

/// Cuántos elementos colocados (entre la plantilla de trabajo y la guardada)
/// usan esta media. Lo consulta `library::delete_media` antes de borrar nada,
/// para poder avisar en vez de dejar referencias colgantes.
pub fn count_references_to_media(state: &EditorState, media_id: &str) -> usize {
    let working = state.working.lock().unwrap();
    let saved = state.saved.lock().unwrap();

    let mut ids: Vec<&str> = working
        .items
        .iter()
        .chain(saved.items.iter())
        .filter(|i| i.media_id == media_id)
        .map(|i| i.instance_id.as_str())
        .collect();
    ids.sort_unstable();
    ids.dedup();
    ids.len()
}

/// Elimina de la plantilla (trabajo Y guardada) todos los elementos que usen
/// esta media, libera sus slots y regraba el disco. Se llama desde
/// `library::delete_media` cuando el usuario confirma el borrado forzado.
pub fn purge_media_references(
    app: &AppHandle,
    state: &EditorState,
    media_id: &str,
) -> Result<(), String> {
    let doomed: Vec<String> = state
        .working
        .lock()
        .unwrap()
        .items
        .iter()
        .filter(|i| i.media_id == media_id)
        .map(|i| i.instance_id.clone())
        .collect();

    state
        .working
        .lock()
        .unwrap()
        .items
        .retain(|i| i.media_id != media_id);
    state
        .saved
        .lock()
        .unwrap()
        .items
        .retain(|i| i.media_id != media_id);

    for instance_id in &doomed {
        release_slot_for_instance(app, state, instance_id);
    }

    // La plantilla guardada acaba de cambiar, así que hay que persistirla:
    // si no, al reiniciar volverían las referencias a una media que ya no
    // existe, que es justo el bug que esto arregla.
    let saved = state.saved.lock().unwrap().clone();
    save_template_to_disk(&saved)?;

    notify_placed_items_changed(app);
    Ok(())
}

/// Avisa de que la lista de elementos colocados cambió, para que la lista del
/// editor se refresque sola.
fn notify_placed_items_changed(app: &AppHandle) {
    let _ = app.emit("placed-items-changed", ());
}

fn respawn_overlays_from(
    app: &AppHandle,
    state: &EditorState,
    tpl: &Template,
    interactive: bool,
) -> Result<(), String> {
    release_all_slots(app, state);
    for item in &tpl.items {
        place_item_in_slot(app, state, item, interactive)?;
    }
    Ok(())
}

/// Se llama una sola vez al arrancar la app, DESPUÉS de que
/// `window_manager::create_overlay_pool` ya creó el pool completo en
/// `setup()`. Si ya hay una plantilla guardada de una sesión anterior, sus
/// animaciones se colocan acá mismo en modo NO interactivo (click-through)
/// — esto es lo que hace que la app funcione como wallpaper real apenas
/// arranca, sin que haga falta pasar por el editor primero.
///
/// A diferencia del resto de caminos, aquí quedarse sin slots NO es un error:
/// se colocan los que quepan y se ignora el resto. El tamaño del pool es un
/// ajuste, así que una plantilla puede tener perfectamente más elementos que
/// slots hay ahora — al bajar el ajuste, o al actualizar desde una versión
/// que reservaba más. Propagar el fallo desde aquí lo convertiría en un
/// pánico durante `setup()` (quien nos llama hace `.expect`), es decir: una
/// app que ya no arranca y de la que solo se sale borrando `template.json` a
/// mano. Los elementos sobrantes siguen guardados en disco y vuelven a
/// aparecer en cuanto se sube el ajuste.
pub fn spawn_saved_template_on_boot(app: &AppHandle, state: &EditorState) {
    let tpl = load_template_from_disk(app);
    *state.working.lock().unwrap() = tpl.clone();
    *state.saved.lock().unwrap() = tpl.clone();

    release_all_slots(app, state);
    let mut skipped = 0usize;
    for item in &tpl.items {
        if place_item_in_slot(app, state, item, false).is_err() {
            skipped += 1;
        }
    }

    if skipped > 0 {
        eprintln!(
            "[kawagiif] {skipped} animación(es) guardadas no se colocaron: la plantilla \
             tiene {} elementos y el pool reserva {}. Sube «Animaciones simultáneas» \
             en Ajustes y reinicia para recuperarlas.",
            tpl.items.len(),
            window_manager::pool_size(),
        );
    }

    window_manager::log_overlay_state(app, "arranque, plantilla restaurada");
}

/// Llamado desde `window_manager` cuando una ventana overlay pooled se
/// mueve o redimensiona a mano (arrastre o resize handle). Solo se aplica
/// en modo edición — fuera de él las overlays son click-through y no
/// deberían poder moverse de todos modos, pero el guard es la fuente de
/// verdad. El slot se traduce a instance_id acá, ya que quien nos llama
/// (`window_manager`) no conoce esa asignación.
pub fn update_slot_geometry(
    app: &AppHandle,
    slot: usize,
    pos: Option<(i32, i32)>,
    size: Option<(u32, u32)>,
) {
    let state = app.state::<EditorState>();
    if !*state.edit_mode.lock().unwrap() {
        return;
    }
    let Some(instance_id) = state.instance_by_slot.lock().unwrap().get(&slot).cloned() else {
        return;
    };
    {
        let mut tpl = state.working.lock().unwrap();
        if let Some(item) = tpl.items.iter_mut().find(|i| i.instance_id == instance_id) {
            if let Some((x, y)) = pos {
                item.x = x;
                item.y = y;
            }
            if let Some((w, h)) = size {
                item.width = w;
                item.height = h;
            }
        }
    }
    let _ = app.emit_to(
        tauri::EventTarget::webview_window(window_manager::CONTROL_LABEL),
        "overlay-geometry-changed",
        instance_id,
    );
}

/// Recarga la plantilla desde disco y vuelve a colocar sus animaciones
/// (en modo no interactivo — `set_edit_mode(true)` las hace interactivas
/// justo después). Hace falta respawnear acá, no solo actualizar el
/// estado en memoria: si el usuario había apretado "matar todas las
/// ventanas" o nunca entró al editor esta sesión, las ventanas pooled
/// todavía no están mostrando nada.
#[tauri::command]
pub fn load_template(app: AppHandle, state: State<EditorState>) -> Result<Template, String> {
    let tpl = load_template_from_disk(&app);
    respawn_overlays_from(&app, &state, &tpl, false)?;
    *state.working.lock().unwrap() = tpl.clone();
    *state.saved.lock().unwrap() = tpl.clone();
    notify_placed_items_changed(&app);
    Ok(tpl)
}

#[tauri::command]
pub fn get_working_template(state: State<EditorState>) -> Template {
    state.working.lock().unwrap().clone()
}

/// Si la plantilla de trabajo difiere de la última guardada. Es lo que
/// dispara las guardas de "tienes cambios sin guardar" al minimizar, cerrar
/// o navegar fuera del editor.
#[tauri::command]
pub fn has_unsaved_changes(state: State<EditorState>) -> bool {
    *state.working.lock().unwrap() != *state.saved.lock().unwrap()
}

/// Los elementos colocados ahora mismo, ya cruzados con la biblioteca.
/// Alimenta la lista del editor, que permite quitar elementos uno a uno en
/// vez de tener que deshacerlo todo de golpe.
#[tauri::command]
pub fn list_placed_items(state: State<EditorState>) -> Vec<PlacedItemSummary> {
    let media = crate::library::list_media();
    let selected = state.selected.lock().unwrap().clone();

    state
        .working
        .lock()
        .unwrap()
        .items
        .iter()
        .map(|item| {
            let found = media.iter().find(|m| m.id == item.media_id);
            PlacedItemSummary {
                instance_id: item.instance_id.clone(),
                media_id: item.media_id.clone(),
                // Si la media ya no está en la biblioteca lo decimos en
                // claro, en vez de dejar una fila con el nombre vacío.
                original_file_name: found
                    .map(|m| m.original_file_name.clone())
                    .unwrap_or_else(|| "(archivo no encontrado)".to_string()),
                media_type: found.map(|m| m.media_type).unwrap_or(crate::library::MediaType::Gif),
                selected: selected.as_deref() == Some(item.instance_id.as_str()),
            }
        })
        .collect()
}

#[tauri::command]
pub fn save_template(state: State<EditorState>) -> Result<(), String> {
    let working = state.working.lock().unwrap().clone();
    save_template_to_disk(&working)?;
    *state.saved.lock().unwrap() = working;
    Ok(())
}

#[tauri::command]
pub fn discard_template_changes(app: AppHandle, state: State<EditorState>) -> Result<(), String> {
    let saved = state.saved.lock().unwrap().clone();
    *state.working.lock().unwrap() = saved.clone();
    let edit_mode = *state.edit_mode.lock().unwrap();
    respawn_overlays_from(&app, &state, &saved, edit_mode)?;
    notify_placed_items_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn set_edit_mode(app: AppHandle, state: State<EditorState>, enabled: bool) -> Result<(), String> {
    *state.edit_mode.lock().unwrap() = enabled;

    // Al salir de modo edición hay que limpiar la selección — si no, el
    // borde azul de "seleccionado" de la última animación clickeada queda
    // pegado indefinidamente (la ventana nunca se recrea, así que nada
    // más lo iba a resetear).
    if !enabled {
        *state.selected.lock().unwrap() = None;
        let _ = app.emit("selection-changed", Option::<String>::None);
    }

    let occupied_slots: Vec<usize> = state.instance_by_slot.lock().unwrap().keys().copied().collect();
    for slot in occupied_slots {
        if let Some(window) = app.get_webview_window(&window_manager::slot_label(slot)) {
            window_manager::set_overlay_click_through(&window, !enabled);
        }
        // Imprescindible AQUÍ: al volverse interactiva, la overlay pasa a
        // poder ganar foco, y Tauri aprovecha ese momento para reaplicar su
        // propio arreglo de `skip_taskbar`, que pisa el nuestro y devuelve el
        // marco a la ventana. Fuera del editor no ocurre porque una ventana
        // click-through no gana foco nunca.
        window_manager::reassert_slot_style(&app, slot);
        emit_to_slot(&app, slot, "edit-mode-changed", enabled);
    }

    // La ventana de grid se crea una sola vez en `setup()` (ver la nota en
    // `window_manager::create_overlay_pool` — el mismo problema de fondo
    // aplicaba también acá). Acá solo se muestra/oculta.
    // La malla decorativa del editor se eliminó: no aportaba lo suficiente
    // frente a los problemas que daba (tapaba la barra de tareas, se colaba en
    // el orden Z robando clics, y fue sospechosa del marco blanco hasta que se
    // descartó con una prueba). Con ella se fue también el ajuste "tamaño de
    // grid".

    // El grid y las overlays son always-on-top; si `control` no lo es
    // también mientras se edita, el grid la tapa apenas se abre el editor.
    if let Some(control) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        let _ = control.set_always_on_top(enabled);
    }

    // ORDEN Z, y es imprescindible desde que el grid absorbe clics.
    //
    // El grid, las animaciones y la ventana de control son las tres
    // "siempre encima", así que entre ellas manda el orden de apilado, no esa
    // propiedad. Y el grid se acaba de mostrar, con lo que está por DELANTE de
    // todo: se tragaba los clics de las animaciones y del propio panel del
    // editor — "no podía pulsar nada".
    //
    // Se recolocan de atrás hacia delante: grid (escudo, al fondo), luego las
    // animaciones, y la ventana de control por encima de todas.
    if enabled {
        // Se suben de atrás hacia delante y de forma EXPLÍCITA: cada llamada
        // coloca esa ventana en lo más alto, así que la última queda encima.
        // No vale `set_focus` para la de control — no garantiza reordenar
        // frente a otras ventanas siempre-encima.
        let slots: Vec<usize> = state.instance_by_slot.lock().unwrap().keys().copied().collect();
        for slot in slots {
            window_manager::raise_slot(&app, slot);
        }
        window_manager::raise_control(&app);
    }

    window_manager::log_overlay_state(
        &app,
        if enabled { "entra al editor" } else { "sale del editor" },
    );

    Ok(())
}

/// Estado actual del editor, para que una ventana pueda PREGUNTARLO en vez de
/// esperar a que le llegue un aviso.
///
/// Depender solo de los eventos es frágil por dos motivos distintos, y los dos
/// se habían manifestado: un aviso emitido antes de que el destinatario se
/// registre se pierde sin dejar rastro, y `set_edit_mode` solo avisa a los
/// slots ocupados en ese instante. Con un getter, la ventana se sincroniza
/// sola al arrancar y cada vez que cambia de animación, y los eventos pasan a
/// ser lo que deben ser: una optimización para no sondear, no la única fuente
/// de verdad.
#[derive(serde::Serialize)]
pub struct EditorStatus {
    pub edit_mode: bool,
    pub selected: Option<String>,
}

#[tauri::command]
pub fn get_editor_status(state: State<EditorState>) -> EditorStatus {
    EditorStatus {
        edit_mode: *state.edit_mode.lock().unwrap(),
        selected: state.selected.lock().unwrap().clone(),
    }
}

#[tauri::command]
pub fn select_overlay(app: AppHandle, state: State<EditorState>, instance_id: Option<String>) {
    *state.selected.lock().unwrap() = instance_id.clone();
    // Broadcast a TODAS las ventanas, no solo `control`: cada overlay
    // necesita saber si es ella la seleccionada (para su borde de selección
    // y para habilitar el nudge por teclado localmente).
    let _ = app.emit("selection-changed", instance_id);
}

#[tauri::command]
pub fn get_placed_media(state: State<EditorState>, instance_id: String) -> Option<PlacedMedia> {
    state
        .working
        .lock()
        .unwrap()
        .items
        .iter()
        .find(|item| item.instance_id == instance_id)
        .cloned()
}

/// Le permite a una ventana overlay pooled averiguar qué `instance_id` le
/// toca mostrar ahora mismo, a partir de su propio label (`overlay-slot-N`)
/// — ya no alcanza con leer el label directamente como en el prototipo,
/// porque una misma ventana física se reusa para distintas animaciones a
/// lo largo de su vida.
#[tauri::command]
pub fn get_instance_id_for_window(window: tauri::WebviewWindow, state: State<EditorState>) -> Option<String> {
    let slot_str = window.label().strip_prefix(window_manager::OV_LABEL)?;
    let slot: usize = slot_str.parse().ok()?;
    state.instance_by_slot.lock().unwrap().get(&slot).cloned()
}

/// Payload de los eventos que cambian una propiedad de un elemento.
///
/// Lleva el `instance_id` a propósito, aunque el evento ya vaya dirigido a
/// una sola ventana: es una segunda barrera para que un error de enrutado no
/// vuelva a corromper elementos ajenos en silencio. El overlay descarta lo
/// que no sea suyo.
#[derive(Serialize, Clone)]
pub struct ItemValueChanged<T: Clone> {
    pub instance_id: String,
    pub value: T,
}

#[tauri::command]
pub fn set_item_opacity(app: AppHandle, state: State<EditorState>, instance_id: String, opacity: f32) {
    {
        let mut tpl = state.working.lock().unwrap();
        if let Some(item) = tpl.items.iter_mut().find(|i| i.instance_id == instance_id) {
            item.opacity = opacity;
        }
    }
    emit_to_instance(
        &app,
        &state,
        &instance_id,
        "item-opacity-changed",
        ItemValueChanged {
            instance_id: instance_id.clone(),
            value: opacity,
        },
    );
}

#[tauri::command]
pub fn set_item_playback_rate(
    app: AppHandle,
    state: State<EditorState>,
    instance_id: String,
    playback_rate: f32,
) {
    {
        let mut tpl = state.working.lock().unwrap();
        if let Some(item) = tpl.items.iter_mut().find(|i| i.instance_id == instance_id) {
            item.playback_rate = Some(playback_rate);
        }
    }
    emit_to_instance(
        &app,
        &state,
        &instance_id,
        "item-playback-rate-changed",
        ItemValueChanged {
            instance_id: instance_id.clone(),
            value: playback_rate,
        },
    );
}

#[derive(Serialize)]
pub struct SpawnedOverlay {
    pub instance_id: String,
    pub window_label: String,
}

#[tauri::command]
pub fn spawn_placed_media(
    app: AppHandle,
    state: State<EditorState>,
    media_id: String,
) -> Result<SpawnedOverlay, String> {
    let instance_id = Uuid::new_v4().to_string();
    let item = PlacedMedia {
        instance_id: instance_id.clone(),
        media_id,
        x: 120,
        y: 120,
        // Cuadrado provisional: al colocar todavía no se sabe la forma del
        // archivo. `fit_overlay_to_media` lo corrige en cuanto el medio carga
        // y reporta sus dimensiones reales.
        width: SPAWN_BOX,
        height: SPAWN_BOX,
        opacity: 1.0,
        playback_rate: Some(1.0),
        // `fit_overlay_to_media` lo pone a true en cuanto el medio carga y
        // dice cuánto mide de verdad.
        auto_sized: false,
    };

    // spawn_placed_media solo se invoca desde la barra de media del editor,
    // así que la overlay nueva nace directamente interactiva.
    place_item_in_slot(&app, &state, &item, true)?;
    state.working.lock().unwrap().items.push(item);

    let slot = state.slot_by_instance.lock().unwrap()[&instance_id];
    notify_placed_items_changed(&app);
    window_manager::log_overlay_state(&app, "animación colocada");
    Ok(SpawnedOverlay {
        instance_id,
        window_label: window_manager::slot_label(slot),
    })
}

#[tauri::command]
pub fn remove_placed_media(app: AppHandle, state: State<EditorState>, instance_id: String) {
    state
        .working
        .lock()
        .unwrap()
        .items
        .retain(|item| item.instance_id != instance_id);
    release_slot_for_instance(&app, &state, &instance_id);
    notify_placed_items_changed(&app);
}

/// Tamaño provisional al colocar, antes de saber cuánto mide el medio.
const SPAWN_BOX: u32 = 220;
/// Lado mayor máximo al colocar. Solo ENCOGE: un GIF pequeño se queda a su
/// tamaño real y un vídeo 1080p se reduce a algo manejable en vez de taparlo
/// todo.
const MAX_SPAWN_SIDE: f64 = 480.0;

/// Ajusta la ventana al tamaño real del medio, la primera vez que este carga
/// y dice cuánto mide.
///
/// Las ventanas nacen cuadradas porque al colocar todavía no se sabe qué
/// forma tiene el archivo, así que un vídeo apaisado quedaba con franjas
/// negras arriba y abajo. Aquí se corrige poniendo la ventana a la resolución
/// nativa del medio, reducida proporcionalmente si excede `MAX_SPAWN_SIDE`.
///
/// **Solo actúa una vez**, controlado por la marca `auto_sized`. Si el
/// usuario ya redimensionó a mano, se respeta: sería muy desconcertante que
/// un elemento cambiara de tamaño solo porque se recargó su contenido.
#[tauri::command]
pub fn fit_overlay_to_media(
    app: AppHandle,
    state: State<EditorState>,
    instance_id: String,
    natural_width: u32,
    natural_height: u32,
) {
    if natural_width == 0 || natural_height == 0 {
        return;
    }

    let (target_w, target_h) = {
        let mut tpl = state.working.lock().unwrap();
        let Some(item) = tpl.items.iter_mut().find(|i| i.instance_id == instance_id) else {
            return;
        };
        if item.auto_sized {
            return;
        }

        // Factor de reducción: 1.0 si ya cabe (nunca se agranda).
        let longest = natural_width.max(natural_height) as f64;
        let shrink = (MAX_SPAWN_SIDE / longest).min(1.0);
        let w = ((natural_width as f64 * shrink).round() as u32).max(40);
        let h = ((natural_height as f64 * shrink).round() as u32).max(40);

        item.width = w;
        item.height = h;
        item.auto_sized = true;
        (w, h)
    };

    if let Some(slot) = state
        .slot_by_instance
        .lock()
        .unwrap()
        .get(&instance_id)
        .copied()
    {
        if let Some(window) = app.get_webview_window(&window_manager::slot_label(slot)) {
            let _ = window.set_size(tauri::PhysicalSize::new(target_w, target_h));
        }
    }
}

#[tauri::command]
pub fn nudge_overlay(window: tauri::WebviewWindow, dx: i32, dy: i32) -> Result<(), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: pos.x + dx,
            y: pos.y + dy,
        }))
        .map_err(|e| e.to_string())?;
    // Mismo límite que al arrastrar: las flechas tampoco pueden meter la
    // animación debajo de la barra de tareas.
    window_manager::clamp_to_work_area(&window);
    Ok(())
}
