<p align="center">
  <img src="docs/media/banner.webp" alt="KawaGIIF banner">
</p>

<p align="center">
  <a href="https://github.com/purgemebaby/KawaGIIF/actions/workflows/ci.yml"><img src="https://github.com/purgemebaby/KawaGIIF/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/purgemebaby/KawaGIIF/actions/workflows/codeql.yml"><img src="https://github.com/purgemebaby/KawaGIIF/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <a href="https://github.com/purgemebaby/KawaGIIF/releases/latest"><img src="https://img.shields.io/github/v/release/purgemebaby/KawaGIIF?color=a97bff&label=version" alt="Latest version"></a>
  <a href="https://github.com/purgemebaby/KawaGIIF/releases"><img src="https://img.shields.io/github/downloads/purgemebaby/KawaGIIF/total?color=ff7bd5&label=downloads" alt="Downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/purgemebaby/KawaGIIF?color=a97bff" alt="License: MIT"></a>
  <br>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4?logo=windows&logoColor=white" alt="Platform: Windows 10 | 11">
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Rust-stable-B7410E?logo=rust&logoColor=white" alt="Rust">
  <a href="#-contributing"><img src="https://img.shields.io/badge/PRs-welcome-a97bff" alt="PRs welcome"></a>
  <a href="https://ko-fi.com/L0T824SRAJ"><img src="https://img.shields.io/badge/Ko--fi-support-72a4f2?logo=ko-fi&logoColor=white" alt="Support on Ko-fi"></a>
</p>

<h1 align="center">KawaGIIF</h1>

<p align="center"><b>Give your desktop some personality.</b></p>

## <img src="src/assets/mascot/home.webp" height="40"> Introduction

KawaGIIF lets you drop any GIF, image or looping video straight onto your screen, with no window, no frame and no background. Just the animation, floating on top of everything, exactly where you put it.

- Set it once and it comes back every time you turn on the PC.

- Overlays sit on top of borderless-fullscreen games, ignore your clicks so they never steal focus, and the app idles in the tray using about as much memory as a browser tab.

- Layer transparent PNGs, SVGs and animated WEBPs over your wallpaper and widgets. Resize, rotate, fade and speed up each one until the setup is pixel-perfect, then save it as your layout. KawaGIIF is free, open source and made to stay out of your way.

## Contents

- [Features](#-features)
- [Download & install](#-download--install)
- [Usage](#-usage)
- [Compatibility](#compatibility)
- [Known issues](#known-issues)
- [Build from source](#-build-from-source)
- [Translations](#translations)
- [Privacy](#privacy)
- [FAQ](#faq)
- [Contributing](#-contributing)
- [AI policy](#ai-policy)
- [Roadmap](#roadmap)
- [Support](#-support)
- [Acknowledgements](#acknowledgements)
- [License](#license)

## <img src="src/assets/mascot/library.webp" height="40"> Features

**Library**

- Import GIF, WEBP, PNG, JPEG, MP4 and SVG files. They are copied into the app's own folder, so moving or deleting the originals never breaks anything.
- Rename items, tag them, and filter by tag, type or name.

**Editor**

- Drag animations from the library onto the desktop.
- Move, resize, nudge and rotate each one, and set its opacity and playback speed.
- Save the layout or discard the changes.

**On the desktop**

- Click-through outside the editor: clicks reach whatever is below. `Ctrl+Alt+Esc` (or `AltGr+Esc`) makes every overlay clickable; press it again to go back to click-through.
- Optional start with Windows, restoring your saved layout.

**Interface**

- English and Spanish.
- UI font picker (any installed font), text size, window zoom and more...

## <img src="src/assets/mascot/update.webp" height="40"> Download & install

1. Download the latest `KawaGIIF_x.y.z_x64-setup.exe` from the [releases page](https://github.com/purgemebaby/KawaGIIF/releases/latest).
2. Run it. The installer is not signed yet, so Windows SmartScreen may show "Windows protected your PC": click **More info**, then **Run anyway**.
3. KawaGIIF opens with its control panel. Close the window at any time: the app keeps running in the system tray.

**Updates.** At launch KawaGIIF checks GitHub for a newer release.

**Uninstall.** Use _Settings → Apps → Installed apps → KawaGIIF → Uninstall_. Your library and settings stay in `%LOCALAPPDATA%\KawaGIIF`

## <img src="src/assets/mascot/editor.webp" height="40"> Usage

**Quick start**

1. Open **Library** and import some files.
2. Open **Editor** and drag an item from the media bar onto the desktop.
3. Move, resize or rotate it, and adjust opacity and speed in the properties panel.
4. Press **Save**. Your layout comes back every time KawaGIIF starts.

**Shortcuts**

| Keys                                     | Where                    | Action                               |
| ---------------------------------------- | ------------------------ | ------------------------------------ |
| `Ctrl` + `Alt` + `Esc` / `Ctrl` + `AltGr` + `Esc` | Anywhere                 | Toggle click-through on every overlay |
| `Delete` / `Backspace`                   | Editor                   | Remove the selected animation        |
| Arrow keys (`Shift` for 10 px)           | Editor, overlay selected | Nudge the animation by 1 px          |
| `Ctrl` + `+` / `-` / `0`, `Ctrl` + wheel | Control panel            | Zoom the interface in, out, or reset |

## Compatibility

|                                           | Status                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| Windows 11 (25H2)                         |  Tested                                                                                  |
| Windows 10 (22H2)                         | Expected to work, not tested yet                                                        |
| Architecture                              | x64                                                                                        |
| WebView2 runtime                          | Preinstalled on Windows 11, the installer downloads it on Windows 10 if missing |
| Games in borderless / windowed fullscreen | Overlays show on top                                                                    |
| Games in exclusive fullscreen             | Not possible, see [Known issues](#known-issues)                                         |
| macOS / Linux                             | Not supported: the app right now relies on Win32 window styles                                       |

## Known issues

- No overlays over exclusive-fullscreen games. In that mode the game takes over the screen and Windows stops compositing other windows, so nothing can be drawn on top without injecting code into the game, which anti-cheat systems flag. Set the game to _borderless_ or _windowed fullscreen_ instead.
- KawaGIIF is a pure viewer and videos play muted, by design.
- SmartScreen warns on first install until the app builds up reputation or gets a code-signing certificate.
- Windows 10 is not tested yet, so reports are welcome.

## <img src="src/assets/mascot/settings-body.webp" height="40"> Build from source

**Requirements**

- [Node.js](https://nodejs.org/) LTS
- [Rust](https://rustup.rs/) stable, 1.90 or newer
- The [Tauri prerequisites for Windows](https://tauri.app/start/prerequisites/): Microsoft C++ Build Tools and WebView2

**Clone.** A plain `git clone` also downloads `docs/media/`, the images used only by this README. To get only what you need to build, skip that folder:

```shell
git clone --filter=blob:none --sparse https://github.com/purgemebaby/KawaGIIF.git
cd KawaGIIF
git sparse-checkout set --no-cone '*' '!docs/media/*'
```

`--filter=blob:none` downloads a file only when it is checked out, and the sparse checkout leaves `docs/media/` out, so those files never reach your disk. Run `git sparse-checkout disable` if you want it later.

**Build and run**

```shell
npm install
npm run tauri dev       # run the app with hot reload
npm run tauri build     # build the NSIS installer (src-tauri/target/release/bundle/nsis)
npm run dev             # frontend only, in a browser, with mocked backend data
cd src-tauri && cargo test
```

**Dependencies.** At runtime KawaGIIF only needs the WebView2 runtime. It is built with [Tauri 2](https://tauri.app/) (Rust + WebView2), [React 19](https://react.dev/) with TypeScript and Vite, the [`windows`](https://crates.io/crates/windows) crate for the Win32 window styles Tauri doesn't cover, [gifuct-js](https://github.com/matt-way/gifuct-js) as a GIF decoder fallback and [Motion](https://motion.dev/) for the overlay animations. The Tauri plugins are pinned to versions that match Tauri 2.11, because the `windows` crate must stay on the same version Tauri uses.

The architecture is described in [docs/Rust-Guide.md](docs/Rust-Guide.md), and memory measurements in [docs/profiling.md](docs/profiling.md).

## Translations

Available languages: **English** and **Spanish**. Change the language in _Settings_.

To add a language:

1. Copy `src/i18n/en.ts` to `src/i18n/<code>.ts` and translate it. It is typed from the English file, so the compiler tells you about any missing key.
2. Register it in `DICTIONARIES` and `LANGUAGES` in `src/i18n/index.ts`.
3. Add the code to `LANGUAGES` in `src-tauri/src/config.rs`.
4. Translate the three tray menu labels in `src-tauri/src/tray.rs`.

Then open a pull request. Machine-assisted translations are fine, see the [AI policy](#ai-policy).

## Privacy

- No telemetry, no analytics, no accounts.
- The only network request is the update check against this repository's GitHub releases at launch.
- Imported files are copied to `%LOCALAPPDATA%\KawaGIIF\media` and never leave your computer.

## FAQ

**Why does Windows warn me when I install it?**
The installer isn't code-signed yet. It is built in the open by [GitHub Actions](.github/workflows/release.yml) from this repository.

**How much memory does it use?**
About 140 MB with the panel in the tray and around 230 to 310 MB with one to three GIFs placed, measured on Windows 11 ([details](docs/profiling.md)). The _Simultaneous animations_ setting controls how many overlay windows are reserved.

**Where are my files and settings?**
In `%LOCALAPPDATA%\KawaGIIF`; _Settings → App folder → Open folder_ takes you there. If a data file ever gets corrupted, KawaGIIF keeps it next to the others as `<name>.broken-<date>` instead of overwriting it.

## <img src="src/assets/mascot/empty-library.webp" height="40"> Contributing

Issues and pull requests are welcome (bugs, ideas, support...) For a bug report, include your Windows version, the KawaGIIF version and the steps to reproduce it.

Before opening a pull request, make sure these pass (CI runs them too):

```shell
npx tsc --noEmit
npx prettier --check "src/**/*.{ts,tsx,css}"
npm run build
cd src-tauri
cargo clippy --all-targets -- -D warnings
cargo test
```

Conventions:

- Formatting comes from `.prettierrc.json` (tabs, single quotes, 80 columns).
- Every visible string goes through `src/i18n`, and every colour, size and spacing comes from `src/styles/tokens.css`.
- Rust commands return `AppResult`. No `unwrap` in app code.
- Commit messages follow `type(scope): summary`, for example `fix(editor): keep the selection after a resize`.
- Recommended setup: [VS Code](https://code.visualstudio.com/) with the [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) and [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) extensions.

To report a security problem, please use a [private security advisory](https://github.com/purgemebaby/KawaGIIF/security/advisories/new) instead of a public issue.

## AI policy

AI tools are very welcome. You can use them to write code, documentation or translations, and send the result as a pull request. I don't mind at all if you use them.

However, you stay responsible for what you submit and make sure to test it, see if CI passes, and understand it well enough to answer questions in the review. 

## Roadmap

**Next (0.1.x)**

- Add a "marketplace" to search directly images, GIFs... from many sources to download them and use it without leaving the app.

**Settings and features**

- A soft limit on placed animations, based on free memory.
- One typed `set_setting` command instead of one per setting.
- Command-line arguments, fade-on-hover, a right-click menu on overlays, per-animation FPS, and a global shortcut to show or hide everything.
- Choose the media storage folder.

Done items move to the [CHANGELOG](CHANGELOG.md).

## <img src="src/assets/mascot/loading-icon.webp" height="40"> Support

KawaGIIF actual features are free and always will be. If you enjoy it, you can buy me some cokes:

<a href="https://ko-fi.com/L0T824SRAJ"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support me on Ko-fi"></a>

## Acknowledgements

- The [Fredoka](https://fonts.google.com/specimen/Fredoka) and [Modak](https://fonts.google.com/specimen/Modak) fonts, under the SIL Open Font License

## License

KawaGIIF is released under the [MIT License](LICENSE).
