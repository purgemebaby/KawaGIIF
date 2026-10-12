# Memory profiling

## What to measure

- **Private bytes**: memory only that process owns.
- Measure a **release** build (`npx tauri build --no-bundle` → `src-tauri/target/release/kawagiif.exe`).
- Only one instance can run at a time: a second one aborts at startup (global shortcut registration fails).

## Tools used

1. **[`docs/profile.ps1`](profile.ps1).**: Starts the release exe with several templates and prints private and working-set MB per process role. Close the app before running it. Run it with `powershell -ExecutionPolicy Bypass -File docs/profile.ps1 [-LeakMinutes 5]`.

2. **DevTools heap snapshot (JS heap of one page)**: The control window opens devtools in dev builds. Use Memory → Heap snapshot and sort by Retained size. For an overlay, run the app with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, then open `edge://inspect` in Edge and pick the overlay page. Decoded GIF frames show as `Uint8ClampedArray` held by `GifCanvasPlayer`'s frames.
3. **Sysinternals VMMap (native memory of one process).**
   - Pick the `msedgewebview2.exe` renderer and compare:
     - **Private Data**: JS heap, DOM, decoded images.
     - **Heap**.
     - **Image**.
     - **Mapped/Shareable**: GPU and shared memory.
4. **Windows Performance Recorder (deep dive, optional).**
   - Run `wpr -start Heap -start VirtualAllocation`, reproduce the problem, then `wpr -stop out.etl`.
   - Open `out.etl` in WPA and group by process and stack.

## Before changes (pool size 4)

Private MB per process:

| Scenario | Total | Control renderer | Overlay renderers | Free slots (asleep) | Browser | GPU | Utilities + crashpad | Rust host |
|---|---|---|---|---|---|---|---|---|
| 0 overlays, control shown | **348** | 155 | — | 4 × ~22 | 56 | 20 | 23 | 8 |
| 0 overlays, control in tray | **346** | 155 | — | 4 × ~22 | 54 | 20 | 22 | 8 |
| 1 GIF, tray | **386** | 157 | 56 | 3 × ~22 | 56 | 20 | 22 | 8 |
| 3 GIFs, tray | **474** | 154 | 75 + 63 + 50 | 1 × 22 | 59 | 21 | 22 | 8 |
| 3 GIFs, control shown | **475** | 155 | 73 + 64 + 50 | 1 × 24 | 57 | 21 | 23 | 8 |


- **The control window use about 155 MB, and the same hidden in the tray as shown.**
- An empty window cost about 22 MB. A busy one cost 50–75 MB, and most of that was the renderer's base cost (Blink + V8 + React), not the GIF/Rust executable.
- **The decoded GIF frames were only 3–10 MB per GIF** (frames × width × height × 4 bytes).
- **WebView2 is about 100 MB**
- **Ruste executable is about (8 MB)**.

## Changes made

- **One renderer for every window: `--process-per-site`** (`window_manager::BROWSER_ARGS`).
  - All pages are on the same origin, so they now share one renderer process instead of one each.
  - Trade-off: a renderer crash takes every window down at once, and all pages share one JS main thread. That's fine for these light pages.
- **Control window sleeps while hidden** (`window_manager::hide_control` / `show_control`, through `set_webview_dormant`).
- **Default pool size 4 instead of 8.** The Settings hint now says each reserved slot costs memory.

## After

| Scenario | Before | After | Processes |
|---|---|---|---|
| 0 overlays, control shown | 348 | **260** | 11 → 7 |
| 0 overlays, control in tray | 346 | **138** | 11 → 7 |
| 1 GIF, tray | 386 | **233** | 11 → 7 |
| 3 GIFs, tray | 474 | **307** | 11 → 7 |
| 3 GIFs, control shown | 475 | **319** | 11 → 7 |

About -35 % with animations on screen, and -60 % in the tray with nothing on screen.
