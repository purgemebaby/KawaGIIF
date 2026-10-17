# KawaGiif - Rust Guide

## 1. Model

Each React window is a thin view that:

- **asks** Rust with `invoke("command", args)`
  .
- **listens** to Rust with `listen("event")`. Rust pushes a notification with `emit` (to everyone) or `emit_to` (to one window).

---

## 2. Lifecycle: from `main()` to exit

`main.rs` only calls `kawagiif_lib::run()`. Everything happens in `lib.rs::run()`,
in this order:

1. **Register shared state** with `.manage(...)`:
   `EditorState`, `LibraryState`, `SysState`. From now on any command can ask
   for them as `State<...>`.

2. **Plugins**: `dialog` (Open-file dialog), `autostart` (Windows registry),
   global shortcuts...

3. **`generate_handler![...]`**: List of every function React may `invoke`.
   A `#[tauri::command]` that isn't here doesn't exist in the frontend.

4. **`setup()`** runs once, on the main thread, before the event loop:
   1. `window_manager::create_control_window` (hidden), at a fixed 960×640 logical px (`CONTROL_BASE`), centred. Sizing it to the monitor cost ~30 % fps in screen transitions. It cannot grow past 1920×1080 logical px (`MAX_CONTROL`, fewer pixels composited per frame), and right after it is built the saved `ui_zoom` is applied with the webview zoom (`Webview::set_zoom`, WebView2's ZoomFactor).
   2. `window_manager::create_overlay_pool`: Creates **all** overlay windows (`OV-SLOT-0..N`), hidden.
   3. `template::load_saved_template_on_boot`: Reads `template.json` into the editor without showing it. `show_saved_overlays` places the animations click-through once the loading screen ends (`show_boot_overlays`), right away when starting in the tray, or after 15 s as a fallback.
   4. Registers the `Ctrl+Alt+Esc` shortcut.
   5. `tray::setup`
   6. `window_manager::spawn_topmost_keeper` background thread, every 2 s.

5. **Event loop** (`.run(...)`): On `RunEvent::ExitRequested` → `handle_exit`
   (discard unsaved edits, hide every overlay).

Only **Tray → Quit** kill all process (including main one).

---

## 3. Layers

Read the modules top to bottom. Each one only calls the ones below it.

| Layer          | Module                                     | What does                                        |
| -------------- | ------------------------------------------ | ------------------------------------------------ | ------------- |
| Wiring         | `lib.rs`                                   | Builder, plugins, `setup`, close/exit policy     |
| Entry points   | `commands.rs`, `tray.rs`                   | Small commands and tray menu                     |
| Domain + state | `template.rs`                              | Placed animations, editor state, slot assignment |
| Domain + state | `library.rs`                               | Imported media, tags                             | the catalogue |
| Window ops     | `window_manager.rs`                        | Pool of windows, show/hide/move, styles          |
| Window ops     | `monitors.rs`                              | Monitor list, centring a box in a work area      |
| OS             | `native/windows.rs`                        | Raw Win32 (`unsafe`)                             |
| Foundations    | `config.rs`, `error.rs`, `system_stats.rs` | Settings file, atomic writes, error type, RAM    |

A transparent window created after startup is born without `WS_EX_LAYERED`
(no real transparency). So **all overlay windows are created in `setup()`** and reused.

- Placing an animation = alloc a slot and showing it. Slots are not saved, but on restart they're handed out again in template order.

- **Free slots sleep.** Each window is its own WebView2 renderer process, so an empty slot used to cost as much as a busy one. When a slot is freed, Rust emits `slot-released`. Rust then makes that webview dormant to use less resources. `show_slot` wakes it before showing it. The window is never destroyed, so `WS_EX_LAYERED` value doesn't reset.

- Two different IDs, don't mix them up:
  - `media_id`: A file in the library (`MediaItem.id`).
  - `instance_id`: 1 placement of that file on the desktop (`PlacedMedia.instance_id`). The same GIF can be placed 3 times.

- `Moved`/`Resized` events report physical pixels, so everything stored in `PlacedMedia` (x, y, width, height) is physical.

---

## 4. Flows, step by step

### 4.1 App boot

`run()` → `setup()` → `create_overlay_pool` (N hidden windows, each with
`watch_overlay_events`) → `load_saved_template_on_boot` → (loading screen ends →
`show_boot_overlays`) → `show_saved_overlays` → for each saved item
`place_item_in_slot(.., interactive=false)` → `show_slot` → `emit_to(slot, "slot-assigned")`.
In each overlay, `OverlayItemApp` already asked `get_slot_info`
on mount and also listens to `slot-assigned` → `loadPlacedMedia` →
`get_placed_media` + `list_media` → `useMediaUrl` → `get_media_path` →
`convertFileSrc` → `asset://` URL → `<video>/<img>/GifCanvasPlayer` (decodes GIF frames on demand: the first frame shows at once).

### 4.2 Placing an animation from the editor

1. `MediaSidebar` mousedown, then either:
   - **click** (released within 5 px) → `invoke("spawn_placed_media", {mediaId, at: {kind: "center", monitor}})`, where `monitor` is the index picked in the editor toolbar (`list_monitors`, primary by default);
   - **drag** (moved more than 5 px) → `at: {kind: "cursor"}`.
2. Rust builds a `PlacedMedia`: a 220×220 box scaled by the monitor's DPI, centred in that monitor's work area or hanging below the cursor. Then `place_item_in_slot(.., true, Arrival::Pop | Arrival::Carried)`, pushes it to `working.items`, emits `placed-items-changed`, returns `{instance_id, window_label}`. A cursor spawn is then carried under the cursor by `window_manager::carry_with_cursor` (a Rust thread, ~120 Hz, until the button is released), which emits `pickup-ended` at the end. The overlay learns how it arrived from `get_slot_info`: a sleeping slot misses events sent while it wakes, so the arrival is stored, not pushed. On release the arrival switches from `Carried` to `Pop` before `pickup-ended`, so the overlay can also ask whether the carry is over. While carried, `CARRIED_SLOT` keeps that overlay above the control window.
3. Drag only: no `startDragging` (its modal move loop blocked the `Moved` events). The overlay's `useSwing` shows the media small (about 150 px, `CARRY_SIDE`) hanging from its top edge, swinging on springs driven by `onMoved`; on `pickup-ended` it stops following moves and grows to full size with the elastic pop.
4. The overlay loads the media; on first `loadedmetadata`/`load` it calls `fit_overlay_to_media(naturalWidth, naturalHeight)` → Rust resizes to the real aspect ratio once (`auto_sized = true`), keeping the window's centre.

Moving to another monitor: Properties → Monitor → `move_overlay_to_monitor(instance_id, monitor)` → `set_position` at the centre of that work area (re-centred if the DPI change resized it) → the usual `Moved` path below.

### 4.3 Dragging / resizing an overlay

Windows moves the window itself → `WindowEvent::Moved` →
`clamp_to_work_area` (if it had to correct, a new `Moved` comes) →
`template::update_slot_geometry(slot, pos)` → updates `working` →
`emit_to(control, "overlay-geometry-changed", instance_id)` →
`useEditorSync` marks it as moved (the editor's Save/Undo summary).
Resizing: the overlay's handle sends `resize_overlay(w, h)` per animation frame → `Resized` → same path. Arrow keys → `nudge_overlay(dx, dy)`.

### 4.3b Edit mode: active vs suspended

`set_edit_mode` only records the intent (the editor screen is open). `template::refresh_edit_activity` decides whether editing is *active*: intent, and the control window visible and not minimized (`window_manager::control_is_open`), and one of our windows in the foreground (`native::foreground_is_ours`, fed by `watch_any_foreground`).
When it is not active, editing is *suspended*: overlays go click-through again, the selection outline and resize handle are hidden, and the control window stops being topmost. The working copy and the selection stay, and editing resumes when the app is foregrounded again. Nothing is saved or discarded automatically.
Losing the foreground suspends after 150 ms (`refresh_edit_activity_soon`), because clicking from one of our windows to another briefly has no foreground window of ours; resuming, hiding and minimizing apply at once. `edit-mode-changed` carries the *active* state.

### 4.4 Save / discard

- Save: `save_template` → `save_template_to_disk(working)` → `saved = working`.
- Discard: `discard_template_changes` → `working = saved` → `respawn_overlays_from(saved, edit_mode)` → `placed-items-changed`.
- Leaving the editor (or pressing X) while dirty: `ControlApp.requestExit` asks `has_unsaved_changes` → modal Save/Discard/Cancel. The X goes through Rust first: `handle_control_close` emits `close-requested` instead of hiding.

### 4.5 Deleting media (one or several)

`StorageScreen.requestDelete(ids)` → `count_placed_media(ids)` → if the
confirmation setting is on **or** any of them is placed, one modal (with the
desktop warning when placed) → `delete_media(ids, force=true)`; otherwise
`delete_media(ids, false)` directly. Rust removes the index entries and only
**our copies** in `media/` (never the user's original), saves the index once →
`template::purge_media_references(ids)` (removes from `working` _and_ `saved`,
frees slots, rewrites `template.json` once) → `library-changed` +
`placed-items-changed`. `force=false` with placed references still returns
`MediaReferenced(n)` as a safety net.

---

## 5. Windows API

Tauri sets some window styles unreliably and resets others on its own.
`window_manager::reapply_overlay_style` calls most of these to reapply them or avoid to lose the values we are interested for to not be changed.

| Function                   | Fixes                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | --- |
| `force_hide_taskb`         | `skip_taskbar(true)` is buggy and Tauri re-runs it on focus. That removes `WS_EX_APPWINDOW`, add `WS_EX_TOOLWINDOW` |
| `force_borderless`         | `decorations(false)` gets undone → strip caption/frame/edge bits + `SWP_FRAMECHANGED`                               |
| `disable_dwm_focus_border` | Windows 11 accent border and rounded corners (drawn by DWM)                                                         |
| `force_layered`            | `set_ignore_cursor_events(false)` removes `WS_EX_LAYERED` → grey opaque frame                                       |     |
| `force_clearbg`            | white class brush flashes before WebView paints                                                                     |
| `top_everything`           | re-stack at top of the topmost band                                                                                 |

It's reapplied on **create, every `show_slot`, `Focused`, edit-mode changes,
and every 2 s by the keeper**, because a click-through overlay never gets
focus, so the focus hook alone would never fire for it.

---

## 6. Events catalogue (Rust → React)

| Event                        | Emitted by                                       | Target       | Listened by                                          |
| ---------------------------- | ------------------------------------------------ | ------------ | ---------------------------------------------------- |
| `library-changed`            | `library::notify_library_changed`                | all          | `LibraryProvider` → `refresh`                        |
| `placed-items-changed`       | `template::notify_placed_items_changed`          | all          | `PlacedItemsList`, `EditorScreen`                    |
| `selection-changed`          | `select_overlay`, `notify_selection_cleared`     | all          | `useEditorSync`, `PlacedItemsList`, `OverlayItemApp` |
| `overlay-geometry-changed`   | `update_slot_geometry`                           | control      | `useEditorSync`                                      |
| `close-requested`            | `lib::handle_control_close`                      | control      | `ControlApp`                                         |
| `slot-assigned`              | `place_item_in_slot` (`emit_to_slot`)            | one overlay  | `OverlayItemApp` (`"self"`)                          |
| `slot-released`              | `release_slot_for_instance`, `release_all_slots` | one overlay  | `OverlayItemApp` (`"self"`) → `overlay_idle`         |
| `edit-mode-changed`          | `place_item_in_slot`, `refresh_edit_activity`    | one overlay  | `OverlayItemApp` (`"self"`)                          |
| `pickup-ended`               | `carry_with_cursor` (button released)            | one overlay  | `useSwing` (`"self"`)                                |
| `item-opacity-changed`       | `update_item` via `set_item_opacity`             | one overlay  | `OverlayItemApp` (`"self"`)                          |
| `item-playback-rate-changed` | `update_item` via `set_item_playback_rate`       | one overlay  | `OverlayItemApp` (`"self"`)                          |
| `click-through-changed`      | `lib::release_all_click_through`                 | each overlay | (not consumed yet)                                   |

`emit` broadcasts to every window. For per-overlay events Rust uses `emit_to`
**and** React listens with `listenToSelf` (`getCurrentWebviewWindow().listen`).

---

## 10. Commands catalogue (React → Rust)

`State<…>`, `AppHandle` and `WebviewWindow` arguments are injected by Tauri:

**commands.rs**
| Command | Args from React | Returns |
|---|---|---|
| `hide_control_window` | — | `()` |
| `resize_overlay` | `width: u32, height: u32` (caller window) | `AppResult<()>` |
| `get_config` | — | `AppConfig` |
| `set_launch_on_startup` | `enabled: bool` | `AppResult<()>` |
| `set_start_minimized_to_tray` | `enabled: bool` | `AppResult<()>` |
| `set_confirm_media_delete` | `enabled: bool` | `AppResult<()>` |
| `set_overlay_pool_size` | `count: u32` | `AppResult<()>` (applies on restart) |
| `set_loading_indicator` | `path: PathBuf` (gif/png/jpg/jpeg) | `AppResult<String>` (stored path) |
| `reset_loading_indicator` | — | `AppResult<()>` |
| `get_loading_indicator` | — | `Option<String>` (None if unset or file missing) |
| `list_system_fonts` | — | `Vec<String>` (sorted families; empty off Windows) |
| `set_ui_font` | `family: Option<String>` (None or blank = system default) | `AppResult<()>` |
| `set_font_scale` | `scale: f32` (clamped 0.85 to 1.3) | `AppResult<()>` |
| `set_ui_zoom` | `zoom: f32` (caller window) | `AppResult<f32>` (clamps to 0.7–1.5, saves `ui_zoom` in config.toml, applies the webview zoom, returns the applied value) |
| `set_nav_animations` | `enabled: bool` | `AppResult<()>` (saves `nav_animations`: the ring menu, the screen pan and the editor burst; off = instant switches) |

**library.rs**
| Command | Args | Returns |
|---|---|---|
| `import_media` | `paths: Vec<PathBuf>` (React sends `{ paths }`) | `AppResult<Vec<MediaItem>>` |
| `list_media` | — | `Vec<MediaItem>` |
| `update_media_tags` | `id: Uuid, tags: Vec<String>` | `AppResult<()>` |
| `list_all_tags` | — | `Vec<TagCount>` |
| `rename_tag` | `from: String, to: String` | `AppResult<usize>` |
| `delete_tag` | `name: String` | `AppResult<usize>` |
| `delete_media` | `ids: Vec<Uuid>, force: bool` | `AppResult<usize>` (files deleted) |
| `get_media_path` | `id: Uuid` | `AppResult<String>` |
| `get_file_size` | `path: PathBuf` | `AppResult<u64>` |

**monitors.rs**
| Command | Args | Returns |
|---|---|---|
| `list_monitors` | — | `AppResult<Vec<MonitorInfo>>` (work areas, physical px; index valid for this run) |

**template.rs**
| Command | Args | Returns |
|---|---|---|
| `load_template` | — | `AppResult<Template>` |
| `get_working_template` | — | `Template` |
| `has_unsaved_changes` | — | `bool` |
| `list_placed_items` | — | `Vec<PlacedItemSummary>` |
| `save_template` | — | `AppResult<()>` |
| `discard_template_changes` | — | `AppResult<()>` |
| `set_edit_mode` | `enabled: bool` | `()` (sets the editor intent only; see 4.3b) |
| `select_overlay` | `instance_id: Option<Uuid>` | `()` |
| `get_placed_media` | `instance_id: Uuid` | `Option<PlacedMedia>` |
| `get_slot_info` | (caller window) | `Option<SlotInfo { instance_id, arrival }>` (not consumed; the overlay plays its entrance once per instance) |
| `get_editor_status` | — | `EditorStatus` (`edit_mode` = editing is active right now, not just intended) |
| `set_item_opacity` | `instance_id: Uuid, opacity: f32` | `()` |
| `set_item_playback_rate` | `instance_id: Uuid, playback_rate: f32` | `()` |
| `spawn_placed_media` | `media_id: Uuid, at: SpawnAt` (`{kind:"center",monitor}` or `{kind:"cursor"}`) | `AppResult<SpawnedOverlay>` |
| `move_overlay_to_monitor` | `instance_id: Uuid, monitor: usize` | `AppResult<Option<PlacedMedia>>` |
| `count_placed_media` | `ids: Vec<Uuid>` | `usize` (placed animations showing any of them) |
| `remove_placed_media` | `instance_id: Uuid` | `()` |
| `fit_overlay_to_media` | `instance_id, natural_width, natural_height` | `()` |
| `nudge_overlay` | `dx: i32, dy: i32` (caller window) | `AppResult<()>` |
| `kill_all_overlays` | — | `()` |
| `overlay_idle` | (caller window) | `()` — puts the caller's webview to sleep if its slot is free |

---
