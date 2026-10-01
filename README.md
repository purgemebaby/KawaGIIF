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

## Recommended IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
