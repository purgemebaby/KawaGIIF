# KawaGIIF

An open source Windows app that shows GIFs, images and videos (GIF, WEBP, PNG, JPEG, MP4) as transparent, always-on-top overlays on the desktop. It's a pure viewer: there is no audio.

## Features

- **Media library:** import files, tag them and filter by tag, type or name.
- **Visual editor:** place animations on the desktop, drag, resize and nudge them, and set opacity and playback speed for each one.
- **Click-through:** outside the editor, clicks go through the animations, so they never get in the way. Press `Ctrl+Alt+Esc` to release click-through on every overlay.
- **Hidden from the taskbar and Alt+Tab.** Closing the window sends the app to the system tray.
- **Starts with Windows (optional)** and restores the saved layout on launch.

## Stack

- [Tauri v2](https://tauri.app/): Rust backend, with WebView2 rendering the UI.
- React + TypeScript + Vite for the control panel and the overlay windows.
- The [`windows`](https://crates.io/crates/windows) crate for Win32 window styles that Tauri doesn't handle reliably.

## Development

Requirements: Node.js, Rust (stable) and the [Tauri prerequisites for Windows](https://tauri.app/start/prerequisites/).

```shell
npm install
npm run tauri dev     # run the app with hot reload
npm run tauri build   # build the installer
npm run dev           # frontend only, in a browser, with mocked backend data
```

User data lives in `%LOCALAPPDATA%\KawaGiif`: `config.toml`, `library_index.json`, `template.json` and the `media` folder.

## Objectives

Work that is already decided but not done yet. Detailed specs for M8 and M9 live in the old development plan (written in Spanish, against older code: the blueprint grid it mentions has been removed since).

### M8: editor revamp

- [ ] Floating editor windows (library panel, top bar, unsaved-changes dialog), pre-created hidden at startup like the overlay pool.
- [ ] The control window hides while editing and comes back on exit.
- [ ] Pop and slide-in animations done in CSS, replayed on every entry via a nonce used as a React `key`.
- [ ] The library panel collapses to a thin tab (the window really shrinks) after dragging an animation out of it.
- [ ] Split `set_edit_mode` into `enter_edit_mode` and `exit_edit_mode(Save | Discard)`.
- [ ] Top bar controls: opacity, speed, flip H/V, X/Y/width/height, reset, delete, placed-items list.
- [ ] New commands `set_item_flip`, `set_overlay_bounds` (move and resize in one call) and `reset_item_properties` (keeps position and size).
- [ ] Marching-ants selection outline with an inset shadow.
- [ ] Eight resize handles (corners and edges) using `setPointerCapture`, so a resize doesn't freeze when the cursor leaves the window.
- [ ] Replace `EditorScreen` and `PropertiesPanel`; the Editor nav item becomes a launcher.

### M9: new settings

- [ ] New `AppConfig` fields with `#[serde(default)]`, so old `config.toml` files keep loading.
- [x] UI font picker fed by the installed Windows fonts (GDI enumeration, includes per-user fonts), each option previewed in its own font; the title and loading screen keep their display font.
- [x] UI font size setting (Small, Default, Large, Larger), applied to every UI text through one CSS scale variable.
- [x] Custom loading-screen image from Settings: its own file picker (GIF, PNG or JPEG), copied into the app folder so deleting library media never breaks it, shown inside a 34x34 box with a warning for big or non-square files, and a reset back to the default ball.
- [ ] Soft limit on placed animations, derived from free RAM and a measured per-animation cost, with a user override.
- [ ] Replace the 4 settings setters (`set_launch_on_startup`, `set_start_minimized_to_tray`, `set_confirm_media_delete`, `set_overlay_pool_size`) with one typed `set_setting` command (a Rust enum) when the new settings land.

### Gaps from the original feature list

- [ ] Command-line arguments with `clap`.
- [ ] Hide on hover: fade an animation out when the cursor gets close.
- [ ] Right-click menu on the animation itself, with "delete".
- [ ] Per-asset FPS control (today only the playback rate can be changed).
- [ ] Global shortcut to show or hide every animation at once.
- [ ] Choose the media storage folder from Settings. Postponed: needs a plan for missing or revoked write permissions.

### Known bugs

- [x] A thin white strip showed at the top of the overlays on Windows 11 when switching between edit mode and other tabs (tao re-adds `WS_CAPTION`; fixed with a window subclass that blocks the non-client paint).
- [ ] Launching a second instance crashes it with `0xC0000409`; likely `global_shortcut().register` failing in `setup()`. Planned fix: `tauri-plugin-single-instance`.
- [x] Sleeping overlay slots still cost ~22 MB each: every window was its own renderer. All windows now share one (`--process-per-site`), see [docs/profiling.md](docs/profiling.md).
- [x] Overlays fell behind the taskbar after a focus change: the keeper never re-raised them (tao skips `SetWindowPos` when the topmost flag doesn't change). They are now raised every 2 s and on every foreground change.

### Performance

- [x] Control window sleeps while hidden in the tray; default pool size 4. Measured −35 % to −60 % private memory ([docs/profiling.md](docs/profiling.md)).
- [x] Overlays appear when the loading screen ends; the loading screen follows real boot steps instead of a fixed 5 s.
- [ ] Lighter GIF player: decode frames on demand (WebCodecs `ImageDecoder`) instead of keeping every frame decoded.
- [ ] Destroy the control window on hide and recreate it on show, if its memory in the shared renderer matters.

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
