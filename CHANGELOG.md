# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Memeboard**, a new section on the home ring. A meme pairs an image, GIF or video with a sound, an animation (pop, still, DVD bounce, bounce, shake, cross the screen, fall, or a path you record with the mouse) and a global shortcut.
  - Up to 10 shortcuts, `Ctrl+AltGr+1` … `Ctrl+AltGr+0` by default. Windows and common app shortcuts are refused, and one already taken by another app is flagged instead of failing silently. `Ctrl+AltGr+Backspace` stops everything.
  - A meme lasts as long as its sound (a video uses its own), 10 s at most; the visual loops until the sound ends.
  - Sounds can go to another output, such as a virtual cable (VB-Cable) to play them in a voice chat, or to the speakers and that device at once.
  - 1 meme at a time by default, up to 10 in the settings; a meme that wouldn't fit in the free memory is not played.
  - Cooldown, what pressing again does (restart, stack, ignore), random speed and pitch, and presets to reuse a look and behaviour.
  - A podium of the most played memes.
  - `KawaGIIF.exe --fire-meme "name"` plays a meme from a Stream Deck or a script.
- MP3, WAV and OGG files in the Library, shown as cassettes in their own tab.

### Changed

- The Library, the editor's Storage panel and the meme pickers show small thumbnails instead of the original files: GIFs and animated WEBPs move only under the pointer, and videos show a poster until hovered. With a large library this cuts the app's memory use a lot.
- The home ring shows only big icons; hovering a sector lights its neon edge, the icon steps inwards and the name flickers on along the edge.
- Imports now read each file's real codec (audio track and first packet, image header, first GIF frame, MP4 tracks) instead of trusting its first bytes, so a renamed or corrupt file is refused.

## [0.1.2] - 2026-10-28

### Fixed

- Updating from the app failed with "the update signature does not specify the version it was signed for". Release 0.1.1 was signed with a Tauri CLI that doesn't record the version, so the updater refused it; this release is signed with CLI 2.12, which does. Install 0.1.2 instead of 0.1.1.

## [0.1.1] - 2026-10-28

### Added

- Import by dragging files from Explorer onto the Library or the editor's Storage panel.
- Import from the editor's Storage panel.
- Rotation slider in the editor, with a reset icon on each slider.
- Ctrl or Shift+click enters selection mode in the Library.

### Changed

- The Library shows at least five cards per row.
- Changing the language no longer reloads the app.
- "Hide as icon" is now "Minimize to tray".
- The control window opens larger, fitted to the monitor.
- Tag manager: icon-only rename and delete buttons, more room for names.
- Oversized PNG, JPEG and WEBP images are shrunk in the background after import.

### Fixed

- Overlays caught clicks a few pixels beyond their visible area; they now only take clicks on the media itself and its handles.
- The sort menu was cut off.
- Undo stayed enabled with nothing to undo.

### Security

- Imported files are checked by content, size and dimensions, both before and after copying; the extension alone is not trusted.
- The app only deletes files inside its own media folder, and only from the control window.

## [0.1.0] - 2026-10-26

### Added

- Place GIF, WEBP, PNG, JPEG, MP4 and SVG files as transparent, always-on-top overlays on the desktop.
- Visual editor: place, drag, resize, nudge and rotate animations, with per-overlay opacity and playback speed.
- Media library: import files, rename them, tag them and filter by tag, type or name.
- The saved desktop layout is restored on launch, and the app can start with Windows.
- English and Spanish interface.
- Custom UI font, text size and control-window zoom.
- Custom loading-screen image and an optional mascot.
- The app checks GitHub for updates at launch: Home shows a card with the new version, and installing it is optional.
- Single instance: launching the app a second time just shows the control panel again.
- No taskbar or Alt+Tab entry; closing the window hides it to the system tray.
- `Ctrl+Alt+Esc` (or `AltGr+Esc`) toggles click-through on every overlay at once: one press makes them clickable, the next one click-through again.

### Fixed

- Launching a second instance crashed with `0xC0000409`; a second launch now just shows the control panel (tauri-plugin-single-instance).
- Overlays fell behind the taskbar after a focus change; they are now raised every 2 s and on every foreground change.
- A thin white strip showed at the top of the overlays on Windows 11 when switching between edit mode and other tabs.

[0.1.2]: https://github.com/purgemebaby/KawaGIIF/releases/tag/v0.1.2
[0.1.1]: https://github.com/purgemebaby/KawaGIIF/releases/tag/v0.1.1
[0.1.0]: https://github.com/purgemebaby/KawaGIIF/releases/tag/v0.1.0