// Placed animations ("the template").
// Keeps which media is placed where on the desktop and with what settings,
// saves and restores it (`template.json`), and decides which overlay window
// from the pool shows each animation.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{
    AppHandle, Emitter, EventTarget, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow,
};
use uuid::Uuid;

use crate::config;
use crate::error::{AppError, AppResult};
use crate::library::{LibraryState, MediaType};
use crate::window_manager;

/* Personal Note for me:
- serde: (de)serialization framework.
    - Serialize / Deserialize: derive them to read/write the struct as JSON.
- std (the standard library):
    - collections::HashSet: a set of unique values; used to count distinct IDs.
    - path::PathBuf: an owned file path.
    - sync::Mutex: a lock so only one thread at a time touches the editor state.
    - sync::MutexGuard: what `lock()` returns; dropping it releases the lock.
    - sync::PoisonError: the error a Mutex returns after a panic while it was held.
- tauri: the app framework.
    - AppHandle: handle to the running app.
    - Emitter: trait that adds `.emit()` / `.emit_to()` to send events to web pages.
    - EventTarget: says WHICH window an event goes to.
    - Manager: trait that adds `get_webview_window`, `state`, `primary_monitor`, ...
    - PhysicalPosition / PhysicalSize: coordinates and sizes in real screen pixels.
    - State: gives a command access to a value registered with `.manage()`.
    - WebviewWindow: a native window with a web page. As a command argument it's the caller.
- uuid::Uuid: 16-byte unique IDs for placed animations and media.
- crate::config: data folder path and the atomic file writer.
- crate::error: `AppError` and `AppResult`.
- crate::library: the media library.
    - LibraryState: the in-memory library index.
    - MediaType: gif / mp4 / jpeg / png / webp.
- crate::window_manager: shows, hides and moves the overlay windows.
*/

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
    #[serde(default = "schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub items: Vec<PlacedMedia>,
}

const CURRENT_TEMPLATE_SCHEMA: u32 = 2;
const SPAWN_BOX: u32 = 220;
const MAX_SPAWN_SIDE: f64 = 480.0;
const MIN_SIDE: u32 = 40;

fn schema_version() -> u32 {
    CURRENT_TEMPLATE_SCHEMA
}

/**
 * Everything the editor tracks, behind a single lock.
 *
 * - `working` is the template being edited, `saved` is what's on disk.
 *   Comparing them answers "are there unsaved changes?".
 * - `slots[n]` is the animation that overlay window `n` is showing, or
 *   `None` if that window is free. It isn't saved: on restart, slots are
 *   handed out again in template order.
 *
 * Window calls (`set_position`, `show`, ...) fire `Moved`/`Resized` events
 * synchronously, and their handler (`update_slot_geometry`) takes this
 * lock. So the lock must always be released before calling into
 * `window_manager`, or the app deadlocks.
 */
pub struct Editor {
    working: Template,
    saved: Template,
    selected: Option<Uuid>,
    edit_mode: bool,
    slots: Vec<Option<Uuid>>,
}

impl Editor {
    pub fn is_dirty(&self) -> bool {
        self.working != self.saved
    }

    pub fn is_editing(&self) -> bool {
        self.edit_mode
    }

    pub fn discard_changes(&mut self) {
        self.working = self.saved.clone();
    }

    fn slot_of(&self, instance_id: &Uuid) -> Option<usize> {
        self.slots
            .iter()
            .position(|s| s.as_ref() == Some(instance_id))
    }

    fn occupied_slots(&self) -> Vec<usize> {
        (0..self.slots.len())
            .filter(|&i| self.slots[i].is_some())
            .collect()
    }

    fn alloc_slot(&mut self, instance_id: Uuid) -> AppResult<usize> {
        let slot = self
            .slots
            .iter()
            .position(Option::is_none)
            .ok_or(AppError::PoolFull(self.slots.len()))?;
        self.slots[slot] = Some(instance_id);
        Ok(slot)
    }

    fn free_slot(&mut self, instance_id: &Uuid) -> Option<usize> {
        let slot = self.slot_of(instance_id)?;
        self.slots[slot] = None;
        Some(slot)
    }

    fn item_mut(&mut self, instance_id: &Uuid) -> Option<&mut PlacedMedia> {
        self.working
            .items
            .iter_mut()
            .find(|item| item.instance_id == *instance_id)
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
        }))
    }
}

impl EditorState {
    pub fn lock(&self) -> MutexGuard<'_, Editor> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

fn template_path() -> PathBuf {
    config::data_dir().join("template.json")
}

/**
 * Reads `template.json` and migrates it from older schemas.
 *
 * v1 stored geometry in logical pixels, v2 stores physical pixels (the unit
 * Windows reports in `Moved`/`Resized`). Migrating multiplies by the primary
 * monitor's scale factor, which is 1.0 at 100% scaling, so most old
 * templates come through unchanged.
 */
fn load_template_from_disk(app: &AppHandle) -> Template {
    let mut tpl: Template = std::fs::read_to_string(template_path())
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default();

    if tpl.schema_version < CURRENT_TEMPLATE_SCHEMA {
        let scale = app
            .primary_monitor()
            .ok()
            .flatten()
            .map_or(1.0, |m| m.scale_factor());
        let scaled = |v: f64| (v * scale).round();
        for item in &mut tpl.items {
            item.x = scaled(f64::from(item.x)) as i32;
            item.y = scaled(f64::from(item.y)) as i32;
            item.width = scaled(f64::from(item.width)) as u32;
            item.height = scaled(f64::from(item.height)) as u32;
        }
        tpl.schema_version = CURRENT_TEMPLATE_SCHEMA;
    }
    tpl
}

fn save_template_to_disk(tpl: &Template) -> AppResult<()> {
    config::write_atomic(&template_path(), &serde_json::to_vec_pretty(tpl)?)
}

/**
 * Sends an event to one overlay window only.
 *
 * `emit` in Tauri v2 always broadcasts to every window, even when called on
 * a specific `WebviewWindow`. Using it here made every overlay switch to the
 * last placed animation. `emit_to` with the window label fixes the sending
 * half; the receiving half is `getCurrentWebviewWindow().listen()` in
 * `OverlayItemApp`, because a plain `listen()` receives every event too.
 */
fn emit_to_slot<S: Serialize + Clone>(app: &AppHandle, slot: usize, event: &str, payload: S) {
    let _ = app.emit_to(
        EventTarget::webview_window(window_manager::slot_label(slot)),
        event,
        payload,
    );
}

fn notify_placed_items_changed(app: &AppHandle) {
    let _ = app.emit("placed-items-changed", ());
}

fn notify_selection_cleared(app: &AppHandle) {
    let _ = app.emit("selection-changed", Option::<Uuid>::None);
}

/**
 * Shows one animation on the desktop.
 *
 * Takes a free window from the pool, moves and sizes it, and tells that
 * window which animation it now shows (`slot-assigned`). It also sends the
 * current edit mode: `set_edit_mode` only notifies slots occupied at that
 * moment, so an animation placed while the editor is open would otherwise
 * never learn it's editable and would be missing its resize handle.
 */
fn place_item_in_slot(
    app: &AppHandle,
    state: &EditorState,
    item: &PlacedMedia,
    interactive: bool,
) -> AppResult<usize> {
    let slot = state.lock().alloc_slot(item.instance_id)?;
    window_manager::show_slot(
        app,
        slot,
        item.x,
        item.y,
        item.width,
        item.height,
        interactive,
    )?;
    emit_to_slot(app, slot, "slot-assigned", item.instance_id);
    emit_to_slot(app, slot, "edit-mode-changed", interactive);
    Ok(slot)
}

fn release_slot_for_instance(app: &AppHandle, state: &EditorState, instance_id: &Uuid) {
    let (slot, was_selected) = {
        let mut editor = state.lock();
        let was_selected = editor.selected == Some(*instance_id);
        if was_selected {
            editor.selected = None;
        }
        (editor.free_slot(instance_id), was_selected)
    };

    if let Some(slot) = slot {
        window_manager::hide_slot(app, slot);
    }
    if was_selected {
        notify_selection_cleared(app);
    }
}

fn release_all_slots(app: &AppHandle, state: &EditorState) {
    state.lock().slots.fill(None);
    window_manager::hide_all_overlay_slots(app);
}

fn respawn_overlays_from(
    app: &AppHandle,
    state: &EditorState,
    tpl: &Template,
    interactive: bool,
) -> AppResult<()> {
    release_all_slots(app, state);
    for item in &tpl.items {
        place_item_in_slot(app, state, item, interactive)?;
    }
    Ok(())
}

/**
 * Hides every placed animation without touching the template, in memory or
 * on disk. They come back the next time the editor opens or the app starts.
 */
#[tauri::command]
pub fn kill_all_overlays(app: AppHandle, state: State<EditorState>) {
    release_all_slots(&app, &state);
    notify_placed_items_changed(&app);
}

pub fn count_references_to_media(state: &EditorState, media_id: &Uuid) -> usize {
    let editor = state.lock();
    editor
        .working
        .items
        .iter()
        .chain(&editor.saved.items)
        .filter(|item| item.media_id == *media_id)
        .map(|item| item.instance_id)
        .collect::<HashSet<_>>()
        .len()
}

/**
 * Removes every placed animation that uses `media_id`, from both the
 * working and the saved template, and rewrites `template.json`.
 *
 * Saving here is required: otherwise the deleted media would come back as
 * blank overlays on the next start, pointing at a file that no longer exists.
 */
pub fn purge_media_references(
    app: &AppHandle,
    state: &EditorState,
    media_id: &Uuid,
) -> AppResult<()> {
    let (doomed, saved) = {
        let mut editor = state.lock();
        let doomed: Vec<Uuid> = editor
            .working
            .items
            .iter()
            .filter(|item| item.media_id == *media_id)
            .map(|item| item.instance_id)
            .collect();
        editor
            .working
            .items
            .retain(|item| item.media_id != *media_id);
        editor.saved.items.retain(|item| item.media_id != *media_id);
        (doomed, serde_json::to_vec_pretty(&editor.saved)?)
    };

    for instance_id in &doomed {
        release_slot_for_instance(app, state, instance_id);
    }
    config::write_atomic(&template_path(), &saved)?;
    notify_placed_items_changed(app);
    Ok(())
}

/**
 * Restores the saved template when the app starts, with every animation
 * click-through, so the app works as a live wallpaper right away without
 * opening the editor.
 *
 * Running out of slots is not an error here. The pool size is a setting, so
 * a template can hold more items than there are windows (after lowering the
 * setting, for example). Failing would panic inside `setup()` and leave an
 * app that never starts. Extra items stay saved and come back once the
 * setting is raised again.
 */
pub fn spawn_saved_template_on_boot(app: &AppHandle, state: &EditorState) {
    let tpl = load_template_from_disk(app);
    release_all_slots(app, state);

    let skipped = tpl
        .items
        .iter()
        .filter(|item| place_item_in_slot(app, state, item, false).is_err())
        .count();
    if skipped > 0 {
        eprintln!(
            "[kawagiif] {skipped} saved animation(s) were not placed: the template has {} items \
             and the pool holds {}. Raise \"Simultaneous animations\" in Settings and restart.",
            tpl.items.len(),
            window_manager::pool_size(),
        );
    }

    let mut editor = state.lock();
    editor.saved = tpl.clone();
    editor.working = tpl;
    drop(editor);

    window_manager::log_overlay_state(app, "startup, template restored");
}

/**
 * Called by `window_manager` when the user drags or resizes an overlay.
 * Only has an effect in edit mode, and translates the window's slot into
 * the animation it shows, which `window_manager` doesn't know about.
 */
pub fn update_slot_geometry(
    app: &AppHandle,
    slot: usize,
    pos: Option<(i32, i32)>,
    size: Option<(u32, u32)>,
) {
    let state = app.state::<EditorState>();
    let instance_id = {
        let mut editor = state.lock();
        if !editor.edit_mode {
            return;
        }
        let Some(instance_id) = editor.slots.get(slot).copied().flatten() else {
            return;
        };
        if let Some(item) = editor.item_mut(&instance_id) {
            if let Some((x, y)) = pos {
                item.x = x;
                item.y = y;
            }
            if let Some((w, h)) = size {
                item.width = w;
                item.height = h;
            }
        }
        instance_id
    };

    let _ = app.emit_to(
        EventTarget::webview_window(window_manager::CONTROL_LABEL),
        "overlay-geometry-changed",
        instance_id,
    );
}

/**
 * Reloads the template from disk and places its animations again.
 *
 * Respawning, not just updating memory, is needed: after "kill all" or on a
 * session where the editor was never opened, the pool windows aren't
 * showing anything yet. They come up click-through; `set_edit_mode(true)`
 * makes them interactive right after.
 */
#[tauri::command]
pub fn load_template(app: AppHandle, state: State<EditorState>) -> AppResult<Template> {
    let tpl = load_template_from_disk(&app);
    respawn_overlays_from(&app, &state, &tpl, false)?;
    {
        let mut editor = state.lock();
        editor.working = tpl.clone();
        editor.saved = tpl.clone();
    }
    notify_placed_items_changed(&app);
    Ok(tpl)
}

#[tauri::command]
pub fn get_working_template(state: State<EditorState>) -> Template {
    state.lock().working.clone()
}

#[tauri::command]
pub fn has_unsaved_changes(state: State<EditorState>) -> bool {
    state.lock().is_dirty()
}

#[derive(Serialize)]
pub struct PlacedItemSummary {
    pub instance_id: Uuid,
    pub media_id: Uuid,
    pub original_file_name: String,
    pub media_type: MediaType,
    pub selected: bool,
}

/**
 * The placed animations, already joined with the library so the editor
 * list renders with one call instead of one lookup per row. The two locks
 * are taken one after the other, never nested.
 */
#[tauri::command]
pub fn list_placed_items(
    state: State<EditorState>,
    library: State<LibraryState>,
) -> Vec<PlacedItemSummary> {
    let (placed, selected): (Vec<(Uuid, Uuid)>, Option<Uuid>) = {
        let editor = state.lock();
        (
            editor
                .working
                .items
                .iter()
                .map(|item| (item.instance_id, item.media_id))
                .collect(),
            editor.selected,
        )
    };

    let index = library.lock();
    placed
        .into_iter()
        .map(|(instance_id, media_id)| {
            let found = index.find(&media_id);
            PlacedItemSummary {
                instance_id,
                media_id,
                original_file_name: found.map_or_else(
                    || "(file not found)".to_owned(),
                    |m| m.original_file_name.clone(),
                ),
                media_type: found.map_or(MediaType::Gif, |m| m.media_type),
                selected: selected == Some(instance_id),
            }
        })
        .collect()
}

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

/**
 * Enters or leaves edit mode.
 *
 * - Leaving clears the selection, or the last selected overlay would keep
 *   its selection outline forever (pool windows are never recreated).
 * - Every placed overlay toggles click-through, and its window styles are
 *   reapplied: once interactive it can gain focus, and Tauri reapplies its
 *   own `skip_taskbar` fix on focus, which brings the frame back.
 * - The control window is made always-on-top while editing, then the
 *   overlays and the control window are raised in that order. All of them
 *   are topmost, so only the stacking order decides who is in front, and
 *   the control panel must end up above the animations.
 */
#[tauri::command]
pub fn set_edit_mode(app: AppHandle, state: State<EditorState>, enabled: bool) {
    let occupied = {
        let mut editor = state.lock();
        editor.edit_mode = enabled;
        if !enabled {
            editor.selected = None;
        }
        editor.occupied_slots()
    };
    if !enabled {
        notify_selection_cleared(&app);
    }

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

    window_manager::log_overlay_state(
        &app,
        if enabled {
            "enter editor"
        } else {
            "leave editor"
        },
    );
}

/**
 * Lets a window ask for the editor state instead of only waiting for
 * events. An event sent before the window starts listening is lost, so
 * overlays call this when they mount and whenever they switch animation;
 * events then only save them from polling.
 */
#[derive(Serialize)]
pub struct EditorStatus {
    pub edit_mode: bool,
    pub selected: Option<Uuid>,
}

#[tauri::command]
pub fn get_editor_status(state: State<EditorState>) -> EditorStatus {
    let editor = state.lock();
    EditorStatus {
        edit_mode: editor.edit_mode,
        selected: editor.selected,
    }
}

#[tauri::command]
pub fn select_overlay(app: AppHandle, state: State<EditorState>, instance_id: Option<Uuid>) {
    state.lock().selected = instance_id;
    let _ = app.emit("selection-changed", instance_id);
}

#[tauri::command]
pub fn get_placed_media(state: State<EditorState>, instance_id: Uuid) -> Option<PlacedMedia> {
    state
        .lock()
        .working
        .items
        .iter()
        .find(|item| item.instance_id == instance_id)
        .cloned()
}

#[tauri::command]
pub fn get_instance_id_for_window(
    window: WebviewWindow,
    state: State<EditorState>,
) -> Option<Uuid> {
    let slot = window_manager::slot_from_label(window.label())?;
    state.lock().slots.get(slot).copied().flatten()
}

/**
 * Payload of the per-item property events. It carries the `instance_id`
 * even though the event already goes to a single window, so the overlay
 * can drop anything that isn't its own if routing is ever wrong again.
 */
#[derive(Serialize, Clone)]
struct ItemValueChanged<T: Clone> {
    instance_id: Uuid,
    value: T,
}

fn update_item<T: Serialize + Clone>(
    app: &AppHandle,
    state: &EditorState,
    instance_id: Uuid,
    event: &str,
    value: T,
    apply: impl FnOnce(&mut PlacedMedia),
) {
    let slot = {
        let mut editor = state.lock();
        if let Some(item) = editor.item_mut(&instance_id) {
            apply(item);
        }
        editor.slot_of(&instance_id)
    };
    if let Some(slot) = slot {
        emit_to_slot(app, slot, event, ItemValueChanged { instance_id, value });
    }
}

#[tauri::command]
pub fn set_item_opacity(
    app: AppHandle,
    state: State<EditorState>,
    instance_id: Uuid,
    opacity: f32,
) {
    update_item(
        &app,
        &state,
        instance_id,
        "item-opacity-changed",
        opacity,
        |item| {
            item.opacity = opacity;
        },
    );
}

#[tauri::command]
pub fn set_item_playback_rate(
    app: AppHandle,
    state: State<EditorState>,
    instance_id: Uuid,
    playback_rate: f32,
) {
    update_item(
        &app,
        &state,
        instance_id,
        "item-playback-rate-changed",
        playback_rate,
        |item| {
            item.playback_rate = Some(playback_rate);
        },
    );
}

#[derive(Serialize)]
pub struct SpawnedOverlay {
    pub instance_id: Uuid,
    pub window_label: &'static str,
}

/**
 * Places a new animation from the editor's media bar. It starts as a
 * square because the media's real shape is unknown until it loads;
 * `fit_overlay_to_media` fixes the size as soon as it does.
 */
#[tauri::command]
pub fn spawn_placed_media(
    app: AppHandle,
    state: State<EditorState>,
    media_id: Uuid,
) -> AppResult<SpawnedOverlay> {
    let item = PlacedMedia {
        instance_id: Uuid::new_v4(),
        media_id,
        x: 120,
        y: 120,
        width: SPAWN_BOX,
        height: SPAWN_BOX,
        opacity: 1.0,
        playback_rate: Some(1.0),
        auto_sized: false,
    };
    let instance_id = item.instance_id;

    let slot = place_item_in_slot(&app, &state, &item, true)?;
    state.lock().working.items.push(item);

    notify_placed_items_changed(&app);
    window_manager::log_overlay_state(&app, "animation placed");
    Ok(SpawnedOverlay {
        instance_id,
        window_label: window_manager::slot_label(slot),
    })
}

#[tauri::command]
pub fn remove_placed_media(app: AppHandle, state: State<EditorState>, instance_id: Uuid) {
    state
        .lock()
        .working
        .items
        .retain(|item| item.instance_id != instance_id);
    release_slot_for_instance(&app, &state, &instance_id);
    notify_placed_items_changed(&app);
}

/**
 * Sizes the window to the media's real dimensions the first time it loads.
 *
 * The size keeps the media's aspect ratio, shrunk to fit `MAX_SPAWN_SIDE`
 * but never enlarged, so a 1080p video doesn't cover the screen and a small
 * GIF stays sharp. It runs only once per animation (`auto_sized`): if the
 * user resized it by hand, reloading the media must not undo that.
 */
#[tauri::command]
pub fn fit_overlay_to_media(
    app: AppHandle,
    state: State<EditorState>,
    instance_id: Uuid,
    natural_width: u32,
    natural_height: u32,
) {
    if natural_width == 0 || natural_height == 0 {
        return;
    }

    let (slot, width, height) = {
        let mut editor = state.lock();
        let Some(item) = editor.item_mut(&instance_id) else {
            return;
        };
        if item.auto_sized {
            return;
        }

        let longest = f64::from(natural_width.max(natural_height));
        let shrink = (MAX_SPAWN_SIDE / longest).min(1.0);
        let fit = |side: u32| ((f64::from(side) * shrink).round() as u32).max(MIN_SIDE);
        item.width = fit(natural_width);
        item.height = fit(natural_height);
        item.auto_sized = true;
        let (width, height) = (item.width, item.height);
        (editor.slot_of(&instance_id), width, height)
    };

    if let Some(window) = slot.and_then(|slot| window_manager::slot_window(&app, slot)) {
        let _ = window.set_size(PhysicalSize::new(width, height));
    }
}

#[tauri::command]
pub fn nudge_overlay(window: WebviewWindow, dx: i32, dy: i32) -> AppResult<()> {
    let pos = window.outer_position()?;
    window.set_position(PhysicalPosition::new(pos.x + dx, pos.y + dy))?;
    window_manager::clamp_to_work_area(&window);
    Ok(())
}
