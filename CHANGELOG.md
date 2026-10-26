# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-25

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

[0.1.0]: https://github.com/purgemebaby/KawaGIIF/releases/tag/v0.1.0