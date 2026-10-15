/* Keeps which media is placed where and with what settings, saves and restores it (`template.json`), and decides which overlay window of the pool shows each animation.*/
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;
use tauri::{AppHandle, Emitter, EventTarget, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use uuid::Uuid;

use crate::config;
use crate::error::{AppError, AppResult};
use crate::library::{LibraryState, MediaType};
use crate::monitors;
use crate::window_manager;

/* Personal Note for me:
- tauri::Emitter + EventTarget: `emit_to(EventTarget::webview_window(label), ..)` sends an event to one window only.
*/

const SPAWN_BOX: u32 = 220;
const PICKUP_GRIP: u32 = 16; //a dragged spawn hangs this far below the cursor, held by its top edge
const MAX_SPAWN_SIDE: f64 = 480.0;
const MIN_SIDE: u32 = 40;
const SAVE_DEBOUNCE: Duration = Duration::from_millis(400);
const BOOT_FALLBACK: Duration = Duration::from_secs(15);
static BOOT_SHOWN: AtomicBool = AtomicBool::new(false); //the boot placement already ran (or the editor took over)

fn template_path() -> PathBuf { config::data_dir().join("template.json") }

/** Reads `template.json` (positions and sizes in physical pixels, what `Moved`/`Resized` report). A missing or broken file gives an empty template. */
fn load_template_from_disk() -> Template {
    std::fs::read_to_string(template_path())
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default()
}

fn save_template_to_disk(tpl: &Template) -> AppResult<()> {
    config::write_atomic(&template_path(), &serde_json::to_vec_pretty(tpl)?)
}

/** Writes the saved template once moves stop for `SAVE_DEBOUNCE`: a drag fires dozens of `Moved` per second. */
fn schedule_save(app: &AppHandle, generation: u64) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(SAVE_DEBOUNCE);
        let state = app.state::<EditorState>();
        let editor = state.lock();
        if editor.save_generation != generation { return; } // a newer move will save
        let result = save_template_to_disk(&editor.saved);

        #[cfg(debug_assertions)]
        if let Err(e) = result { eprintln!("[kawagiif] template save after move failed: {e}"); }
        #[cfg(not(debug_assertions))]
        let _ = result;
    });
}

/** Sends an event to one overlay only: plain `emit` broadcasts to every window, even on a `WebviewWindow`. */
fn emit_to_slot<S: Serialize + Clone>(app: &AppHandle, slot: usize, event: &str, payload: S) {
    let _ = app.emit_to(EventTarget::webview_window(window_manager::slot_label(slot)), event, payload);
}

fn notify_placed_items_changed(app: &AppHandle) {
    let _ = app.emit("placed-items-changed", ());
}

fn notify_selection_cleared(app: &AppHandle) {
    let _ = app.emit("selection-changed", Option::<Uuid>::None);
}



#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct PlacedMedia {
    pub instance_id: Uuid,
    pub media_id: Uuid,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub opacity: f32,
    pub playback_rate: Option<f32>,
    #[serde(default)]
    pub auto_sized: bool,
}

#[derive(Serialize, Deserialize, Clone, Default, PartialEq)]
pub struct Template {
    #[serde(default)]
    pub items: Vec<PlacedMedia>,
}

#[derive(Serialize)]
pub struct PlacedItemSummary {
    pub instance_id: Uuid,
    pub media_id: Uuid,
    pub original_file_name: String,
    pub media_type: MediaType,
    pub selected: bool,
}

/**Lets a window ask for the editor state: an event sent before it starts listening is lost.*/
#[derive(Serialize)]
pub struct EditorStatus {
    pub edit_mode: bool,
    pub selected: Option<Uuid>,
}

/**
 * How an animation entered its slot, which picks the overlay's entrance: none when the editor reloads it, the pop for a
 * click or a restore at startup, the pop plus the claw swing for a drag from the list.
 */
#[derive(Serialize, Clone, Copy, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Arrival {
    #[default]
    Reload,
    Pop,
    Carried,
}

/**What an overlay asks for once it's awake: a sleeping slot misses the events sent while it wakes up.*/
#[derive(Serialize)]
pub struct SlotInfo {
    pub instance_id: Uuid,
    pub arrival: Arrival,
}

#[derive(Serialize)]
pub struct SpawnedOverlay {
    pub instance_id: Uuid,
    pub window_label: &'static str,
}

/**Payload of the per-item events; carries `instance_id` so an overlay can drop anything that isn't its own.*/
#[derive(Serialize, Clone)]
struct ItemValueChanged<T: Clone> {
    instance_id: Uuid,
    value: T,
}

/**
 * Everything the editor tracks: `working` (being edited) vs `saved` (on disk) tells if there are unsaved changes;
 * `slots[n]` is the animation shown by overlay `n` (not persisted). Never hold this lock while calling
 * `window_manager`: window calls fire `Moved`/`Resized` synchronously and `update_slot_geometry` re-locks (deadlock).
 */
pub struct Editor {
    working: Template,
    saved: Template,
    selected: Option<Uuid>,
    edit_mode: bool,
    slots: Vec<Option<Uuid>>,
    arrivals: Vec<Arrival>, //per slot, read by `get_slot_info`
    save_generation: u64, //last move waiting for `schedule_save`
}
impl Editor {
    pub fn is_dirty(&self) -> bool { self.working != self.saved }

    /// Unsaved changes while the editor is open, the case where closing must ask first.
    pub fn has_unsaved_edits(&self) -> bool { self.edit_mode && self.is_dirty() }

    pub fn discard_changes(&mut self) { self.working = self.saved.clone(); }

    fn slot_of(&self, instance_id: &Uuid) -> Option<usize> {
        self.slots.iter().position(|s| s.as_ref() == Some(instance_id))
    }

    fn occupied_slots(&self) -> Vec<usize> {
        (0..self.slots.len()).filter(|&i| self.slots[i].is_some()).collect()
    }

    fn alloc_slot(&mut self, instance_id: Uuid, arrival: Arrival) -> AppResult<usize> {
        let slot = self.slots.iter().position(Option::is_none).ok_or(AppError::PoolFull(self.slots.len()))?;
        self.slots[slot] = Some(instance_id);
        self.arrivals[slot] = arrival;
        Ok(slot)
    }

    fn free_slot(&mut self, instance_id: &Uuid) -> Option<usize> {
        let slot = self.slot_of(instance_id)?;
        self.slots[slot] = None;
        self.arrivals[slot] = Arrival::Reload;
        Some(slot)
    }

    fn item_mut(&mut self, instance_id: &Uuid) -> Option<&mut PlacedMedia> {
        self.working.items.iter_mut().find(|item| item.instance_id == *instance_id)
    }

    /// Applies a drag/resize to `working`, and to `saved` too when asked. Returns whether anything changed.
    fn apply_geometry(&mut self, instance_id: &Uuid, pos: Option<(i32, i32)>, size: Option<(u32, u32)>, also_saved: bool) -> bool {
        let apply = |item: &mut PlacedMedia| {
            let before = (item.x, item.y, item.width, item.height);
            if let Some((x, y)) = pos { item.x = x; item.y = y; }
            if let Some((w, h)) = size { item.width = w; item.height = h; }
            before != (item.x, item.y, item.width, item.height)
        };
        let mut changed = self.item_mut(instance_id).is_some_and(&apply);
        if also_saved {
            if let Some(item) = self.saved.items.iter_mut().find(|item| item.instance_id == *instance_id) {
                changed |= apply(item);
            }
        }
        changed
    }
}

pub struct EditorState(Mutex<Editor>);
impl Default for EditorState {
    fn default() -> Self {
        Self(Mutex::new(Editor {
            working: Template::default(),
            saved: Template::default(),
            selected: None,
            edit_mode: false,
            slots: vec![None; window_manager::pool_size()],
            arrivals: vec![Arrival::Reload; window_manager::pool_size()],
            save_generation: 0,
        }))
    }
}
impl EditorState {
    pub fn lock(&self) -> MutexGuard<'_, Editor> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}



// Slot orchestration
/**
 * Takes a free pool window, shows the animation in it and tells it (`slot-assigned`) plus the current edit mode,
 * since `set_edit_mode` only notifies slots occupied at that moment. `arrival` is stored before the window wakes, so
 * the overlay reads it with `get_slot_info` even if it slept through the event.
 */
fn place_item_in_slot(app: &AppHandle, state: &EditorState, item: &PlacedMedia, interactive: bool, arrival: Arrival) -> AppResult<usize> {
    let slot = state.lock().alloc_slot(item.instance_id, arrival)?;
    window_manager::show_slot(app, slot, item.x, item.y, item.width, item.height, interactive)?;
    emit_to_slot(app, slot, "slot-assigned", item.instance_id);
    emit_to_slot(app, slot, "edit-mode-changed", interactive);
    Ok(slot)
}

fn release_slot_for_instance(app: &AppHandle, state: &EditorState, instance_id: &Uuid) {
    let (slot, was_selected) = {
        let mut editor = state.lock();
        let was_selected = editor.selected == Some(*instance_id);
        if was_selected { editor.selected = None; }
        (editor.free_slot(instance_id), was_selected)
    };

    if let Some(slot) = slot {
        window_manager::hide_slot(app, slot);
        emit_to_slot(app, slot, "slot-released", ());
    }
    if was_selected { notify_selection_cleared(app); }
}

fn release_all_slots(app: &AppHandle, state: &EditorState) {
    let freed = {
        let mut editor = state.lock();
        let freed = editor.occupied_slots();
        editor.slots.fill(None);
        editor.arrivals.fill(Arrival::Reload);
        freed
    };
    window_manager::hide_all_overlay_slots(app);
    for slot in freed {
        emit_to_slot(app, slot, "slot-released", ());
    }
}

fn slot_is_free(app: &AppHandle, slot: usize) -> bool {
    app.state::<EditorState>().lock().slots.get(slot).is_some_and(Option::is_none)
}

fn respawn_overlays_from(app: &AppHandle, state: &EditorState, tpl: &Template, interactive: bool) -> AppResult<()> {
    release_all_slots(app, state);
    for item in &tpl.items {
        place_item_in_slot(app, state, item, interactive, Arrival::Reload)?;
    }
    Ok(())
}

/// Called by an overlay page once it shows nothing (startup, after `slot-released`), so it has already dropped its media
/// before being put to sleep.
#[tauri::command]
pub fn overlay_idle(app: AppHandle, window: WebviewWindow) {
    let Some(slot) = window_manager::slot_from_label(window.label()) else { return; };
    if slot_is_free(&app, slot) {
        window_manager::set_slot_dormant(&window, true, move || slot_is_free(&app, slot));
    }
}

/// Hides every placed animation without touching the template; they return on the next editor open or app start.
#[tauri::command]
pub fn kill_all_overlays(app: AppHandle, state: State<EditorState>) {
    release_all_slots(&app, &state);
    notify_placed_items_changed(&app);
}

/** Placed animations (working or saved) that show any of `media_ids`. */
pub fn count_references_to_media(state: &EditorState, media_ids: &HashSet<Uuid>) -> usize {
    let editor = state.lock();
    editor.working.items.iter().chain(&editor.saved.items)
        .filter(|item| media_ids.contains(&item.media_id))
        .map(|item| item.instance_id)
        .collect::<HashSet<_>>()
        .len()
}

/**
 * Removes every placed animation using one of `media_ids` from both templates and rewrites `template.json` once;
 * otherwise the deleted media would come back as blank overlays on the next start.
 */
pub fn purge_media_references(app: &AppHandle, state: &EditorState, media_ids: &HashSet<Uuid>) -> AppResult<()> {
    let (doomed, saved) = {
        let mut editor = state.lock();
        let doomed: Vec<Uuid> = editor.working.items.iter()
            .filter(|item| media_ids.contains(&item.media_id))
            .map(|item| item.instance_id)
            .collect();
        editor.working.items.retain(|item| !media_ids.contains(&item.media_id));
        editor.saved.items.retain(|item| !media_ids.contains(&item.media_id));
        (doomed, serde_json::to_vec_pretty(&editor.saved)?)
    };

    for instance_id in &doomed {
        release_slot_for_instance(app, state, instance_id);
    }
    config::write_atomic(&template_path(), &saved)?;
    notify_placed_items_changed(app);
    Ok(())
}

/// How many placed animations show any of `ids`, so the delete dialog can warn before anything is deleted.
#[tauri::command]
pub fn count_placed_media(state: State<EditorState>, ids: Vec<Uuid>) -> usize {
    count_references_to_media(&state, &ids.into_iter().collect())
}

/** Loads the saved template at startup without showing it: `show_saved_overlays` does that once the loading screen ends. */
pub fn load_saved_template_on_boot(state: &EditorState) {
    let tpl = load_template_from_disk();
    let mut editor = state.lock();
    editor.saved = tpl.clone();
    editor.working = tpl;
}

/** Shows the loaded template if the loading screen never reports (hidden window, crashed page). */
pub fn spawn_boot_fallback(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(BOOT_FALLBACK);
        show_saved_overlays(&app);
    });
}

/**
 * Places the saved template click-through (live wallpaper without opening the editor), once per run. Running out of
 * slots must not fail: the pool size is a setting. Extra items stay saved.
 */
pub fn show_saved_overlays(app: &AppHandle) {
    if BOOT_SHOWN.swap(true, Ordering::SeqCst) { return; }

    let state = app.state::<EditorState>();
    let tpl: Template = state.lock().saved.clone();
    release_all_slots(app, &state);

    let skipped = tpl.items.iter().filter(|item| place_item_in_slot(app, &state, item, false, Arrival::Pop).is_err()).count();
    if skipped > 0 {
        eprintln!(
            "[kawagiif] {skipped} saved animation(s) were not placed: the template has {} items and the pool holds {}. \
             Raise \"Simultaneous animations\" in Settings and restart.",
            tpl.items.len(),
            window_manager::pool_size(),
        );
    }
    window_manager::log_overlay_state(app, "startup, template restored");
}

/**
 * Called by `window_manager` on drag/resize of an overlay. In edit mode it changes the working copy; outside it
 * (after Ctrl+Alt+Esc) it changes the saved copy too and writes `template.json` once the drag settles.
 */
pub fn update_slot_geometry(app: &AppHandle, slot: usize, pos: Option<(i32, i32)>, size: Option<(u32, u32)>) {
    let state = app.state::<EditorState>();
    let (instance_id, pending_save) = {
        let mut editor = state.lock();
        let Some(instance_id) = editor.slots.get(slot).copied().flatten() else { return; };
        let edit_mode = editor.edit_mode;
        let changed = editor.apply_geometry(&instance_id, pos, size, !edit_mode);

        if edit_mode { (instance_id, None) }
        else if changed { editor.save_generation += 1; (instance_id, Some(editor.save_generation)) }
        else { return; }
    };

    match pending_save {
        None => { let _ = app.emit_to(EventTarget::webview_window(window_manager::CONTROL_LABEL), "overlay-geometry-changed", instance_id); }
        Some(generation) => schedule_save(app, generation),
    }
}



// Template Commands
/// Reloads the template from disk and places it again (windows may be showing nothing after "kill all");
/// they come up click-through and `set_edit_mode(true)` makes them interactive. When the overlays already show exactly
/// that template (the usual case when opening the editor) nothing is re-placed: re-placing made every overlay fetch
/// and decode its GIF again, freezing all windows for ~400 ms.
#[tauri::command]
pub fn load_template(app: AppHandle, state: State<EditorState>) -> AppResult<Template> {
    BOOT_SHOWN.store(true, Ordering::SeqCst);
    let tpl = load_template_from_disk();
    let already_shown: bool = {
        let editor = state.lock();
        let shown: HashSet<Uuid> = editor.slots.iter().flatten().copied().collect();
        editor.working == tpl && shown == tpl.items.iter().map(|item| item.instance_id).collect()
    };
    if !already_shown { respawn_overlays_from(&app, &state, &tpl, false)?; }
    {
        let mut editor = state.lock();
        editor.working = tpl.clone();
        editor.saved = tpl.clone();
    }
    notify_placed_items_changed(&app);
    Ok(tpl)
}

/// The loading screen ended: show the saved template (only the first call of a run does anything).
#[tauri::command]
pub fn show_boot_overlays(app: AppHandle) { show_saved_overlays(&app); }

#[tauri::command]
pub fn get_working_template(state: State<EditorState>) -> Template { state.lock().working.clone() }

#[tauri::command]
pub fn has_unsaved_changes(state: State<EditorState>) -> bool { state.lock().is_dirty() }

#[tauri::command]
pub fn save_template(state: State<EditorState>) -> AppResult<()> {
    let mut editor = state.lock();
    save_template_to_disk(&editor.working)?;
    editor.saved = editor.working.clone();
    Ok(())
}

#[tauri::command]
pub fn discard_template_changes(app: AppHandle, state: State<EditorState>) -> AppResult<()> {
    let (saved, edit_mode) = {
        let mut editor = state.lock();
        editor.discard_changes();
        (editor.saved.clone(), editor.edit_mode)
    };
    respawn_overlays_from(&app, &state, &saved, edit_mode)?;
    notify_placed_items_changed(&app);
    Ok(())
}



// Editor Commands
/// Placed animations already joined with the library (one call instead of one lookup per row); the locks are never nested.
#[tauri::command]
pub fn list_placed_items(state: State<EditorState>, library: State<LibraryState>) -> Vec<PlacedItemSummary> {
    let (placed, selected): (Vec<(Uuid, Uuid)>, Option<Uuid>) = {
        let editor = state.lock();
        (editor.working.items.iter().map(|item| (item.instance_id, item.media_id)).collect(), editor.selected)
    };

    let index = library.lock();
    placed
        .into_iter()
        .map(|(instance_id, media_id)| {
            let found = index.find(&media_id);
            PlacedItemSummary {
                instance_id,
                media_id,
                original_file_name: found.map_or_else(|| "(file not found)".to_owned(), |m| m.original_file_name.clone()),
                media_type: found.map_or(MediaType::Gif, |m| m.media_type),
                selected: selected == Some(instance_id),
            }
        })
        .collect()
}

/// Enters or leaves edit mode. Leaving clears the selection (pool windows are never recreated, so the outline would stay).
/// Overlays toggle click-through and get their styles reapplied (interactive ones gain focus and Tauri redoes its
/// `skip_taskbar` fix). Everything is topmost, so overlays are raised first and the control window last to end on top.
#[tauri::command]
pub fn set_edit_mode(app: AppHandle, state: State<EditorState>, enabled: bool) {
    let occupied = {
        let mut editor = state.lock();
        editor.edit_mode = enabled;
        if !enabled { editor.selected = None; }
        editor.occupied_slots()
    };
    if !enabled { notify_selection_cleared(&app); }

    for &slot in &occupied {
        if let Some(window) = window_manager::slot_window(&app, slot) {
            window_manager::set_overlay_click_through(&window, !enabled);
        }
        window_manager::reassert_slot_style(&app, slot);
        emit_to_slot(&app, slot, "edit-mode-changed", enabled);
    }

    if let Some(control) = app.get_webview_window(window_manager::CONTROL_LABEL) {
        let _ = control.set_always_on_top(enabled);
    }
    if enabled {
        for &slot in &occupied {
            window_manager::raise_slot(&app, slot);
        }
        window_manager::raise_control(&app);
    }

    window_manager::log_overlay_state(&app, if enabled { "enter editor" } else { "leave editor" });
}

#[tauri::command]
pub fn get_editor_status(state: State<EditorState>) -> EditorStatus {
    let editor = state.lock();
    EditorStatus { edit_mode: editor.edit_mode, selected: editor.selected }
}

#[tauri::command]
pub fn select_overlay(app: AppHandle, state: State<EditorState>, instance_id: Option<Uuid>) {
    state.lock().selected = instance_id;
    let _ = app.emit("selection-changed", instance_id);
}

#[tauri::command]
pub fn get_placed_media(state: State<EditorState>, instance_id: Uuid) -> Option<PlacedMedia> {
    state.lock().working.items.iter().find(|item| item.instance_id == instance_id).cloned()
}

/// The animation shown by the calling overlay and how it arrived. It answers the same for as long as the animation
/// stays in the slot: an overlay asks several times while it wakes up, and it plays the entrance once per new instance.
#[tauri::command]
pub fn get_slot_info(window: WebviewWindow, state: State<EditorState>) -> Option<SlotInfo> {
    let slot = window_manager::slot_from_label(window.label())?;
    let editor = state.lock();
    let instance_id = editor.slots.get(slot).copied().flatten()?;
    Some(SlotInfo { instance_id, arrival: editor.arrivals[slot] })
}



// Item Property Commands
fn update_item<T: Serialize + Clone>(
    app: &AppHandle, state: &EditorState, instance_id: Uuid, event: &str, value: T, apply: impl FnOnce(&mut PlacedMedia),
) {
    let slot = {
        let mut editor = state.lock();
        if let Some(item) = editor.item_mut(&instance_id) { apply(item); }
        editor.slot_of(&instance_id)
    };
    if let Some(slot) = slot {
        emit_to_slot(app, slot, event, ItemValueChanged { instance_id, value });
    }
}

#[tauri::command]
pub fn set_item_opacity(app: AppHandle, state: State<EditorState>, instance_id: Uuid, opacity: f32) {
    update_item(&app, &state, instance_id, "item-opacity-changed", opacity, |item| item.opacity = opacity);
}

#[tauri::command]
pub fn set_item_playback_rate(app: AppHandle, state: State<EditorState>, instance_id: Uuid, playback_rate: f32) {
    update_item(&app, &state, instance_id, "item-playback-rate-changed", playback_rate, |item| {
        item.playback_rate = Some(playback_rate);
    });
}



// Placement Commands
/** Where a new animation appears: the centre of a monitor (a click in the media bar) or hanging from the cursor (a drag). */
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SpawnAt {
    Center { monitor: usize },
    Cursor,
}

fn scaled(side: u32, scale: f64) -> u32 { (f64::from(side) * scale).round() as u32 }

/** Top-left corner and side of the starting box, in physical pixels, sized for the DPI of the monitor it lands on. */
fn spawn_box(app: &AppHandle, at: &SpawnAt) -> AppResult<(i32, i32, u32)> {
    match at {
        SpawnAt::Center { monitor } => {
            let monitor = monitors::monitor_at(app, *monitor)?;
            let side = scaled(SPAWN_BOX, monitor.scale_factor());
            let (x, y) = monitors::centered_in(&monitor, side, side);
            Ok((x, y, side))
        }
        SpawnAt::Cursor => {
            let cursor = app.cursor_position()?;
            let scale = app.monitor_from_point(cursor.x, cursor.y)?.map_or(1.0, |m| m.scale_factor());
            let side = scaled(SPAWN_BOX, scale);
            let x = cursor.x.round() as i32 - (side / 2) as i32;
            let y = cursor.y.round() as i32 - scaled(PICKUP_GRIP, scale) as i32;
            Ok((x, y, side))
        }
    }
}

/// Places a new animation from the media bar. It starts square because the real shape is unknown until it loads;
/// `fit_overlay_to_media` fixes it then. A cursor spawn is carried under the cursor until the button is released; its
/// overlay swings meanwhile (`Arrival::Carried`, ended by `pickup-ended`).
#[tauri::command]
pub fn spawn_placed_media(app: AppHandle, state: State<EditorState>, media_id: Uuid, at: SpawnAt) -> AppResult<SpawnedOverlay> {
    let (x, y, side) = spawn_box(&app, &at)?;
    let grip_y: i32 = match at { SpawnAt::Cursor => app.cursor_position()?.y.round() as i32 - y, SpawnAt::Center { .. } => 0 };
    let item = PlacedMedia {
        instance_id: Uuid::new_v4(),
        media_id,
        x,
        y,
        width: side,
        height: side,
        opacity: 1.0,
        playback_rate: Some(1.0),
        auto_sized: false,
    };
    let instance_id = item.instance_id;

    let carried: bool = matches!(at, SpawnAt::Cursor);
    let slot = place_item_in_slot(&app, &state, &item, true, if carried { Arrival::Carried } else { Arrival::Pop })?;
    state.lock().working.items.push(item);
    if carried {
        let handle = app.clone();
        window_manager::carry_with_cursor(&app, slot, grip_y, move || {
            // an overlay that only asks after the drop gets the plain pop, not a swing that would wait for no moves
            {
                let state = handle.state::<EditorState>();
                let mut editor = state.lock();
                if editor.slots.get(slot) == Some(&Some(instance_id)) { editor.arrivals[slot] = Arrival::Pop; }
            }
            emit_to_slot(&handle, slot, "pickup-ended", instance_id);
        });
    }

    notify_placed_items_changed(&app);
    window_manager::log_overlay_state(&app, "animation placed");
    Ok(SpawnedOverlay { instance_id, window_label: window_manager::slot_label(slot) })
}

/// Moves a placed animation to the centre of another monitor. `Moved` (and `Resized`, when the DPI differs) store the
/// new geometry like a drag would, so Save and Undo keep working.
#[tauri::command]
pub fn move_overlay_to_monitor(
    app: AppHandle, state: State<EditorState>, instance_id: Uuid, monitor: usize,
) -> AppResult<Option<PlacedMedia>> {
    let target = monitors::monitor_at(&app, monitor)?;
    let (slot, width, height) = {
        let editor = state.lock();
        let Some(item) = editor.working.items.iter().find(|item| item.instance_id == instance_id) else { return Ok(None); };
        (editor.slot_of(&instance_id), item.width, item.height)
    };

    let (x, y) = monitors::centered_in(&target, width, height);
    match slot.and_then(|slot| window_manager::slot_window(&app, slot)) {
        Some(window) => {
            window.set_position(PhysicalPosition::new(x, y))?;
            // crossing to a monitor with another DPI resizes the window, so centre it again with its new size
            let size = window.outer_size()?;
            if (size.width, size.height) != (width, height) {
                let (x, y) = monitors::centered_in(&target, size.width, size.height);
                window.set_position(PhysicalPosition::new(x, y))?;
            }
        }
        None => { state.lock().apply_geometry(&instance_id, Some((x, y)), None, false); }
    }
    Ok(state.lock().working.items.iter().find(|item| item.instance_id == instance_id).cloned())
}

#[tauri::command]
pub fn remove_placed_media(app: AppHandle, state: State<EditorState>, instance_id: Uuid) {
    state.lock().working.items.retain(|item| item.instance_id != instance_id);
    release_slot_for_instance(&app, &state, &instance_id);
    notify_placed_items_changed(&app);
}

/// Sizes the window to the media's aspect ratio, shrunk to `MAX_SPAWN_SIDE` (scaled to the monitor's DPI) but never
/// enlarged, keeping its centre. Runs once per animation (`auto_sized`) so reloading the media doesn't undo a manual resize.
#[tauri::command]
pub fn fit_overlay_to_media(
    app: AppHandle, state: State<EditorState>, instance_id: Uuid, natural_width: u32, natural_height: u32,
) {
    if natural_width == 0 || natural_height == 0 { return; }

    let window = state.lock().slot_of(&instance_id).and_then(|slot| window_manager::slot_window(&app, slot));
    let scale = window.as_ref().and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);

    let (x, y, width, height) = {
        let mut editor = state.lock();
        let Some(item) = editor.item_mut(&instance_id) else { return; };
        if item.auto_sized { return; }

        let longest = f64::from(natural_width.max(natural_height));
        let shrink = (MAX_SPAWN_SIDE * scale / longest).min(1.0);
        let fit = |side: u32| ((f64::from(side) * shrink).round() as u32).max(MIN_SIDE);
        let (width, height) = (fit(natural_width), fit(natural_height));
        item.x += (item.width as i32 - width as i32) / 2;
        item.y += (item.height as i32 - height as i32) / 2;
        item.width = width;
        item.height = height;
        item.auto_sized = true;
        (item.x, item.y, width, height)
    };

    if let Some(window) = window {
        let _ = window.set_size(PhysicalSize::new(width, height));
        let _ = window.set_position(PhysicalPosition::new(x, y));
    }
}

#[tauri::command]
pub fn nudge_overlay(window: WebviewWindow, dx: i32, dy: i32) -> AppResult<()> {
    let pos = window.outer_position()?;
    window.set_position(PhysicalPosition::new(pos.x + dx, pos.y + dy))?;
    window_manager::clamp_to_work_area(&window);
    Ok(())
}
