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
   1. `window_manager::create_control_window` (hidden), at a fixed 960×640 logical px (`CONTROL_BASE`), centred. Sizing it to the monitor cost ~30 % fps in screen transitions. It cannot grow past 1700×1056 logical px (`MAX_CONTROL`, fewer pixels composited per frame); `fit_control_to_monitor` also caps its min/max size to the work area of the monitor it is on (at startup and on every `Moved` that lands on another monitor) and shrinks it back onto a screen too small for it, such as a TV. Then right after it is built the saved `ui_zoom` is applied with the webview zoom (`Webview::set_zoom`, WebView2's ZoomFactor).
   2. `window_manager::create_overlay_pool`: Creates **all** overlay windows (`OV-SLOT-0..N`), hidden.
   3. `template::load_saved_template_on_boot`: Reads `template.json` into the editor without showing it. `show_saved_overlays` places the animations click-through once the loading screen ends (`show_boot_overlays`), right away when starting in the tray, or after 15 s as a fallback. Items whose media file is gone from `media/` (deleted by hand) are skipped and stay saved; `list_media` flags them `missing`, so the Library shows a "File missing" badge.
   4. Registers the `Ctrl+Alt+Esc` shortcut.
   5. `tray::setup`
   6. `window_manager::spawn_topmost_keeper` background thread, every 2 s; every 250 ms while the foreground app is a borderless fullscreen window (it may re-raise itself), and no raise at all while it is exclusive-fullscreen Direct3D (nothing can show over it). `native::foreground_fullscreen` tells the three states apart (`SHQueryUserNotificationState` plus a window-rect == monitor-rect check). Over true exclusive fullscreen the game must be set to borderless windowed.

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

- The overlay window is the media (its rotated bounding box) plus `window_manager::HANDLE_MARGIN` (32 logical px) of transparent room on every side, where the editor's handles live and the rotated corners fit. Both clamps (see 4.3) let the window overhang the monitor by that margin, so the media can still touch the screen edge.

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

1. Only a **drag** places: `MediaSidebar` mousedown, then a move of more than
   5 px → `invoke("spawn_placed_media", {mediaId})`. A plain click (released
   within 5 px) does nothing.
2. Rust builds a `PlacedMedia`: a 220×220 logical box plus `HANDLE_MARGIN` of room on every side, scaled by the DPI under the cursor and hanging below it. Then `place_item_in_slot(.., edit_active, Arrival::Carried)`, pushes it to `working.items`, emits `placed-items-changed`, returns `{instance_id, window_label}`. The new overlay is carried under the cursor by `window_manager::carry_with_cursor` (a Rust thread, ~120 Hz, until the button is released), which emits `pickup-ended` at the end. The overlay learns how it arrived from `get_slot_info`: a sleeping slot misses events sent while it wakes, so the arrival is stored, not pushed. On release the arrival switches from `Carried` to `Pop` before `pickup-ended`, so the overlay can also ask whether the carry is over. While carried, `CARRIED_SLOT` keeps that overlay above the control window.
3. No `startDragging` (its modal move loop blocked the `Moved` events). The overlay's `useSwing` shows the media small (about 150 px, `CARRY_SIDE`) hanging from its top edge, swinging on springs driven by `onMoved`; on `pickup-ended` it stops following moves and grows to full size with the elastic pop.
4. The overlay loads the media; on first `loadedmetadata`/`load` it calls `fit_overlay_to_media(naturalWidth, naturalHeight)` → Rust resizes to the real aspect ratio plus the margin once (`auto_sized = true`), keeping the window's centre.

### 4.3 Dragging / resizing / rotating an overlay

Windows moves the window itself → `WindowEvent::Moved` →
`template::update_slot_geometry(slot, pos)` → updates `working` →
`emit_to(control, "overlay-geometry-changed", instance_id)` →
`useEditorSync` marks it as moved (the editor's Save/Undo summary).
Clamping: every overlay gets a non-client subclass at creation
(`native::guard_non_client(hwnd, HANDLE_MARGIN)`, handler
`non_client_guard`). During a drag it answers `WM_MOVING`:
`constrain_moving_rect` shifts the proposed rect into the `rcMonitor` of
the monitor under the cursor, overhanging it by the margin scaled with
`GetDpiForWindow`, so a drag crosses monitors but never leaves them, with
no jitter (the rect is fixed before the move is applied, not after
release). On `Moved`, `clamp_to_work_area` corrects at once the moves made
from Rust (the carry, `nudge_overlay`, `set_overlay_rect`); if it had to,
a new `Moved` comes, which needs no correction, so no loop. A drag is
already constrained, so the clamp finds nothing to fix there.
A selected overlay in edit mode shows three handles: two corner handles
on the media's own top-left and bottom-right corners (they turn with it),
and one rotate sphere centred in the top margin (the transparent
`HANDLE_MARGIN` room), moved to the bottom margin when the window's top
is above its monitor (`currentMonitor()`). A handle drag is rAF-throttled:
the media follows the pointer at once, the IPC goes out at most once per
animation frame, with one final flush on release. A corner drag scales the
media keeping the aspect ratio and the opposite corner fixed, sending
`set_overlay_rect(x, y, width, height)` (moves and resizes in one go): the
scale stays between `MIN_SIDE` (40 physical px) and 150 % of the natural
size (`MAX_UPSCALE`), never below the 220 px spawn size, never larger than
the screen. The sphere rotates the media (Shift snaps to 15°) sending
`rotate_overlay(rotation, width, height)`, applied keeping the window
centre, so the media turns about itself. `Resized` stores the size as
usual.
Arrow keys → `nudge_overlay(dx, dy)` (Shift = 10 px steps).

### 4.3b Edit mode: active vs suspended

`set_edit_mode` only records the intent (the editor screen is open). `template::refresh_edit_activity` decides whether editing is *active*: intent, and the control window visible and not minimized (`window_manager::control_is_open`), and one of our windows in the foreground (`native::foreground_is_ours`, fed by `watch_any_foreground`).
When it is not active, editing is *suspended*: overlays go click-through again, the selection outline and handles are hidden, and the control window stops being topmost. The working copy and the selection stay, and editing resumes when the app is foregrounded again. Nothing is saved or discarded automatically.
Losing the foreground suspends after 150 ms (`refresh_edit_activity_soon`), because clicking from one of our windows to another briefly has no foreground window of ours; resuming, hiding and minimizing apply at once. `edit-mode-changed` carries the *active* state.
Leaving the editor sends `set_edit_mode(false)` as soon as navigation starts (`ControlApp.changeScreen`), not when the exit animation ends; the editor's unmount sends it again as a safety net, and its mount effect drops a late `set_edit_mode(true)` once it has been cleaned up. `select_overlay` ignores clicks while editing is not active, and `Ctrl+Alt+Esc` (`release_all_click_through`) also clears the selection (`template::clear_selection`), so no stale selection shows up when the editor opens again.

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

`raise_visible_overlays` raises the control window first (while edit mode
keeps it topmost) and then the overlays above it, so the editor never loses
sight of them; a carried overlay goes above everything. Since tao applies
`set_always_on_top` through queued window changes, `raise_overlays_above_control`
re-runs the raise after the queue drains, from `refresh_edit_activity` and
from the any-foreground hook (a click on the control window raises it).

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
| `item-reset`                 | `reset_placed_media`                              | one overlay  | `OverlayItemApp` (`"self"`) → refits                 |
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
| `set_overlay_rect` | `x: i32, y: i32, width: u32, height: u32` (caller window) | `AppResult<()>` (moves and resizes in one go, physical px; a corner drag keeps the opposite corner fixed, so the centre moves) |
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
| `open_data_folder` | — | `AppResult<()>` (opens `%LOCALAPPDATA%\KawaGiif` in Explorer, creating it if missing) |
| `set_show_mascot` | `enabled: bool` | `AppResult<()>` (saves `show_mascot`: the chibi mascot in Home, Settings, the Editor and the empty Library) |
| `set_language` | `language: String` (`"en"` or `"es"`, `config::LANGUAGES`) | `AppResult<()>` (saves the UI language and relabels the tray menu; the control window reloads itself to apply the rest of the UI) |

**library.rs**
| Command | Args | Returns |
|---|---|---|
| `find_reimports` | `paths: Vec<PathBuf>` | `Vec<String>` (the given paths whose file is already in the library, matched on `MediaItem.source_path`) |
| `import_media` | `paths: Vec<PathBuf>, replace_existing: bool` (React sends `{ paths, replaceExisting }`) | `AppResult<ImportResult>` = `{ items, rejected }` (new and replaced items; `rejected` lists the file names whose real content (`sniff_bytes`: PNG/JPEG/GIF/WEBP/MP4 signatures, `<svg` for SVG) does not match the extension, which are not imported and which the Library shows in a notice; a path already in the library is replaced when `replace_existing` (same id, tags, name and placements; new stored file, old one deleted), else skipped; names are stored without the extension, and a name already used becomes `name (2)`; entries saved with an extension are stripped once on load) |
| `rename_media` | `id: Uuid, name: String` | `AppResult<()>` (trims, collapses spaces, max 120 chars, empty is an error; sets `original_file_name` only, never touches files) |
| `list_media` | — | `Vec<MediaItem>` (`missing: true` when the file is gone; never stored) |
| `update_media_tags` | `id: Uuid, tags: Vec<String>` | `AppResult<()>` |
| `update_tags_many` | `ids: Vec<Uuid>, add: Vec<String>, remove: Vec<String>` | `AppResult<usize>` (items changed; one save, one `library-changed`) |
| `list_all_tags` | — | `Vec<TagCount>` |
| `rename_tag` | `from: String, to: String` | `AppResult<usize>` |
| `delete_tag` | `name: String` | `AppResult<usize>` |
| `delete_media` | `ids: Vec<Uuid>, force: bool` | `AppResult<usize>` (files deleted) |
| `get_media_path` | `id: Uuid` | `AppResult<String>` |
| `get_file_size` | `path: PathBuf` | `AppResult<u64>` |

`MediaItem.original_file_name` is the editable display name (kept under that name to avoid a migration). `MediaItem.source_path` is the canonicalized, lowercased path of the imported file (`Option`, absent in old indexes), used to detect a re-import.

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
| `select_overlay` | `instance_id: Option<Uuid>` | `()` (ignored unless editing is active) |
| `get_placed_media` | `instance_id: Uuid` | `Option<PlacedMedia>` |
| `get_slot_info` | (caller window) | `Option<SlotInfo { instance_id, arrival }>` (not consumed; the overlay plays its entrance once per instance) |
| `get_editor_status` | — | `EditorStatus` (`edit_mode` = editing is active right now, not just intended) |
| `set_item_opacity` | `instance_id: Uuid, opacity: f32` | `()` |
| `set_item_playback_rate` | `instance_id: Uuid, playback_rate: f32` | `()` |
| `rotate_overlay` | `rotation: f32, width: u32, height: u32` (caller window) | `AppResult<()>` (stores the rotation; the overlay sends the window size that fits the rotated media, applied keeping the centre) |
| `reset_placed_media` | `instance_id: Uuid` | `Option<PlacedMedia>` (opacity 1, speed 1, rotation 0, `auto_sized` reopened; emits `item-reset` and the overlay refits) |
| `spawn_placed_media` | `media_id: Uuid` | `AppResult<SpawnedOverlay>` |
| `count_placed_media` | `ids: Vec<Uuid>` | `usize` (placed animations showing any of them) |
| `remove_placed_media` | `instance_id: Uuid` | `()` |
| `fit_overlay_to_media` | `instance_id, natural_width, natural_height` | `()` |
| `nudge_overlay` | `dx: i32, dy: i32` (caller window) | `AppResult<()>` |
| `kill_all_overlays` | — | `()` |
| `overlay_idle` | (caller window) | `()` — puts the caller's webview to sleep if its slot is free |

---
