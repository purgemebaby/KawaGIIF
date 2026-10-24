# KawaGiif

KawaGiif shows GIFs, images and videos (GIF, WEBP, PNG, JPEG, MP4) as transparent, always-on-top, click-through overlays
on the Windows desktop. Tauri v2: Rust backend, React UI inside WebView2. Open-source, light enough to stay on all day next to games. Priorities, in order: **stay out of the way** (click-through, no taskbar/Alt+Tab entry, low RAM/CPU) → **keep simple code the owner can read**. Measure before optimizing. Don't add a dependency that a few lines of code can replace.

## Stack

Tauri 2.11 (tao 0.35) · `windows` 0.61 (**must equal the version Tauri uses**, check with `cargo tree`, or `HWND` types
clash) · `webview2-com` 0.38 · React 19 · Vite 8 · TypeScript 6 · Motion 14 (springs, overlay bundle only) · plugins: dialog, autostart, global-shortcut.

## Commands

```shell
npm run tauri dev                    # the real app (hot reload). Needed for anything Win32/transparency
npm run dev                          # UI only, in a browser, with mocked backend data (src/lib/ipc.ts)
npx tauri build --no-bundle          # release exe: src-tauri/target/release/kawagiif.exe (measure with this one)

cargo clippy                         # in src-tauri
npx tsc --noEmit
npm run build

powershell -ExecutionPolicy Bypass -File docs/profile.ps1   # RAM per scenario, release build, app closed
```

## Project map

```
index.html / overlay.html        one Vite entry per window class
src/                             React frontend
  main.tsx                       control window entry (applies font settings before rendering)
  entries/overlay.tsx            overlay entry: keep this bundle light, never import control-only code
  windows/                       ControlApp (boot, exit guard, composition) and OverlayItemApp (slot, media, playback)
  components/                    screens (Home, Storage, Editor, Settings, Loading), home/RadialMenu (ring menu), BrandBar (section logo), MediaThumb (shared thumbnail), ui/SketchIcon (hand-drawn icons, draw-in + hover animations via a `pixel-hover` ancestor; ui/PixelIcon is the old pixel-art set, kept unused until the owner decides), tags/ (chips, popovers, bulk tags, manager), pieces; settings/ holds one file per settings row
  context/LibraryProvider.tsx    media library state shared by the control window
  hooks/                         useScreenTransitions (pan + burst), useZoomShortcuts, useEditHandles (overlay sphere/corners), useStorageResize, usePersistentState (localStorage + codecs), useTauriEvent, useEditorSync, useMediaUrl, useDismiss, useMediaSelection, useSwing (overlay pickup), useFlipGrid (Polaroid slides), ...
  lib/                           ipc.ts (invoke/listen + browser mocks), config.ts (AppConfig + loadConfig), appEvent.ts (in-window announce/listen), media.ts, mediaFilter.ts (search/tags/sort), tags.ts (clean + colour per tag name), sketch.ts (seeded hand-drawn strokes) + sketchIcons.ts (24×24 shapes), pixelIcons.ts (old 16×16 grids), placed.ts, overlayGeometry.ts, pointerDrag.ts, appearance.ts, zoom.ts, radial.ts (ring geometry), navTransition.ts (screen pan), editorBurst.ts (ring→editor morph), navAnimations.ts
  i18n/en.ts                     every visible string (`t.*`)
  styles/                        tokens, base, motion, components, index (control), overlay
src-tauri/src/
  lib.rs                         builder, plugins, command registry, setup, exit
  window_manager.rs              control window (fixed 960×640, max 1700×1056), overlay pool, raising, dormant webviews, BROWSER_ARGS
  template.rs                    placed animations, slots, template.json, boot placement, edit mode
  library.rs                     media library and tags (library_index.json)
  config.rs                      config.toml, data folder, write_atomic
  commands.rs                    settings, appearance, loading indicator, control window
  tray.rs · system_stats.rs · error.rs (AppError)
  native/windows.rs              every unsafe Win32 / WebView2 call
src-tauri/capabilities/          control.json, overlay.json (OV-SLOT-*)
```

User data: `%LOCALAPPDATA%\KawaGiif` → `config.toml`, `library_index.json`, `template.json`, `media/`, `loading-indicator-*`.

## Windows / WebView2 rules (do not break)

- tao re-adds `WS_CAPTION` and drops `WS_EX_LAYERED` on style changes (white strip, grey frame). After any click-through change
  call `force_layered` + `force_borderless` (`set_overlay_click_through` does); each overlay also has a non-client subclass.
- tao only calls `SetWindowPos(TOPMOST)` when the flag changes, so the taskbar can bury overlays: the keeper (every 2 s) and the
  foreground hook raise them explicitly.
- Every webview shares 1 WebView2 env, so they all need the **same** `BROWSER_ARGS` (`--process-per-site` makes them share 1 renderer).
- Hidden windows go dormant (`set_webview_dormant`) and are woken before showing. Hidden costs RAM otherwise.
- Write files with `config::write_atomic`. Don't touch tools or files outside the repo.

## Visual design

- Dark, soft, "kawaii": surfaces `--kg-bg-*`, accent purple `#a97bff` (`--kg-accent`), pink `--kg-accent-2`, danger `--kg-danger`.
- Fonts: **Modak** (`--kg-font-display`) only for the title and loading screen, never scaled or user-changed. **Fredoka** (`--kg-font-heading`) for screen and section headings. Everything else uses the
  user's UI font (`--kg-font-ui`, set through `fontStack` in `lib/appearance.ts`) and `--kg-font-scale`, which multiplies every `--kg-text-*`.
- Everything visual comes from `src/styles/tokens.css` (colors, space, shadows, durations, text sizes). Motion lives in `motion.css`.
  No hard-coded `font-size`, color or spacing when a token exists. Visible strings go through `src/i18n/en.ts`, in English.

## Clean code and performance

- Small functions that do one thing, early returns, no dead or commented-out code, no duplicated logic (reuse the existing helpers).
  Names say _what_, comments say _why_. Fix the cause, not the symptom.
- Commands return `AppResult`, never `unwrap`/`expect`. Handle every error path the user can reach.
- `docs/profile.ps1`.

### Rust

**Comments:** one line each. `/** … */` above structs, enums and free functions; `///` above commands and associated functions;
`//` for short notes. Keep the _why_ only when it isn't obvious, cut to 1–2 lines.

**Code**

- Trivial functions on one line: `fn media_dir() -> PathBuf { config::data_dir().join("media") }`.
- Renaming a command, a command argument or an event means updating the React side in the same change.

### React / TypeScript

- Formatting comes from `.prettierrc.json` (tabs, single quotes, 80 columns). Don't hand-format.
- `PascalCase` components and files, `useX` hooks, `camelCase` the rest, `SCREAMING_CASE` constants.
- One component per file unless a tiny private sub-component is used only there. A new settings row is its own file in `components/settings/`.
- Reuse `useTauriEvent`, `useMediaUrl`, `useDismiss`, `lib/placed.ts`, `lib/media.ts` instead of repeating logic.
- Comments only where the logic isn't obvious, one line.

## How agents work here

- **Context7 first.** Before implementing something new or fixing a bug that involves a library, fetch the current docs with the Context7 MCP: `resolve-library-id`, then `query-docs` with one concept per query.
- **See UI changes before calling them done.**
  - Control-window layout: run `npm run dev`, then capture headless with the installed Firefox and **an isolated profile** and read the PNG:
    `firefox.exe --headless --no-remote -profile <tempdir> --screenshot out.png --window-size=960,640 http://localhost:1420`.
    The capture is taken at page load, so it shows the loading screen; other screens need a way past it
    (a dev-only URL flag would fix this). Also check `720,480` and the largest font scale.
- **Done means:** `cargo clippy`, `npx tsc --noEmit`, `npm run build` and Prettier pass without warnings. No commits unless asked. No `--no-verify`. Stay inside the repo. Sub-agents (`kg-coder`, `kg-thinker`, `kg-reviewer`) can't browse: web searches go through main agent.

## Conventions

- Repo content (code, comments, docs, commits) is English.
- Commit messages: `type(scope): summary`, then a bulleted body.
- After changing commands, windows or the boot flow, update `docs/Rust-Guide.md`.


Use the following swarm agent system. Delegate every task to a GLM/DeepSeek subagent called via Ollama to do the simple tasks. You are in charge of supervising their task, optimising the code, refactorization, reduce the quantity of code lines by using other existing functions and use Context7 MCP to read library and language updated documentation.