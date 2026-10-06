# KawaGiif — Resumen del proyecto

## Objetivo del proyecto

Una aplicación open source en Rust llamada KawaGiif que muestra animaciones, GIFs, imágenes y vídeos (MP4, WEBP...) como elementos superpuestos, transparentes y siempre visibles sobre el escritorio de Windows.

## Arquitectura elegida

Backend Rust + frontend React, Tauri, Windows API. En Windows, el WebView es WebView2 (el motor Chromium que trae integrado el propio sistema operativo a través de Edge), que incluye la decodificación de MP4/H.264, GIF y WEBP animado.

## Funcionalidades a implementar (lista original)

- Archivo de configuración persistente (biblioteca de assets, posición y ajustes de cada animación).
- Arranque desde terminal (con argumentos vía CLI) o desde icono de escritorio.
- Auto-arranque opcional.
- Ventanas superpuestas sobre el resto de apps.
- Arrastre manual de cada animación con el ratón para reposicionarla, y borrado individual vía menú contextual
- Control de FPS y de tamaño (resize) por cada asset.
- Click-through.
- Hide on hover.

## Librerías y crates confirmadas

### Backend (Rust, dentro de `src-tauri`)

- `tauri` (v2) como framework principal.
- `windows` (bindings oficiales de Microsoft) para las llamadas Win32 a bajo nivel que Tauri no cubre bien (el workaround de `skip_taskbar`, y cualquier ajuste fino de `GWL_EXSTYLE`). Importante: fijar la misma versión mayor.menor que usa Tauri internamente (verificable con `cargo tree`), si no el `HWND` propio y el que devuelve `window.hwnd()` son tipos incompatibles para el compilador.
- `tauri-plugin-autostart` para el arranque automático con el sistema.
- `tauri-plugin-global-shortcut` para atajos de teclado globales (ya en uso: recuperación de click-through vía `Ctrl+Alt+Escape`, y a futuro mostrar/ocultar todas las animaciones a la vez).
- `serde` + `toml` para configuración; `serde` + `serde_json` para índices/plantillas con estructuras anidadas (biblioteca de media, plantilla del editor).
- `dirs` para localizar la ruta correcta de datos en Windows — usar `data_local_dir()` (`%LOCALAPPDATA%`), no `config_dir()` (`%APPDATA%`, roaming): no es apto para una carpeta de media que puede acumular cientos de MB.
- `uuid` (feature v4) para IDs de media y de instancias de ventana colocadas.
- `tauri-plugin-dialog` para el diálogo nativo "Abrir archivo" al importar media a la biblioteca.
- `clap` para el análisis de argumentos cuando se lanza desde terminal (quedó fuera del alcance de la v1 inicial).
- `muda` NO hace falta como dependencia directa — `tauri::menu::{Menu, MenuItem, PredefinedMenuItem}` ya envuelve todo lo necesario para el menú contextual del ícono de bandeja del sistema.

### Frontend

- React, renderizado dentro del WebView2 que aporta Tauri.
- Etiquetas HTML nativas (`<video>`, `<img>`) para WEBP animado y MP4, sin necesidad de librerías adicionales de reproducción. Para GIF con velocidad de reproducción ajustable no alcanza el `<img>` nativo (el navegador no expone ningún control de FPS): se decodifica con `gifuct-js` y se reproduce en `<canvas>` con `requestAnimationFrame`.

## Estructura de carpetas real

```
kawagiif/
├── index.html / overlay.html     # Una entrada de Vite por clase de ventana
├── src/                          # Frontend React
│   ├── main.tsx                  # Entrada de la ventana de control
│   ├── entries/overlay.tsx       # Entrada de las ventanas overlay
│   ├── windows/                  # ControlApp y OverlayItemApp
│   ├── components/               # Pantallas y piezas de UI
│   ├── context/LibraryProvider.tsx
│   ├── hooks/                    # useTauriEvent, useEditorSync, useMediaUrl, ...
│   ├── lib/                      # ipc.ts (invoke/listen + modo navegador), placed.ts
│   ├── i18n/en.ts                # Todos los textos visibles (inglés)
│   └── styles/                   # tokens, base, motion, components, overlay
├── src-tauri/                    # Backend Rust
│   ├── src/
│   │   ├── main.rs               # Solo llama a kawagiif_lib::run()
│   │   ├── lib.rs                # Builder, plugins, comandos, setup, salida
│   │   ├── window_manager.rs     # Ventana de control y pool de overlays
│   │   ├── template.rs           # Animaciones colocadas, slots, template.json
│   │   ├── library.rs            # Biblioteca de media y etiquetas
│   │   ├── config.rs             # config.toml, carpeta de datos, escritura atómica
│   │   ├── commands.rs           # Comandos sueltos (ajustes, ventana de control)
│   │   ├── error.rs              # AppError compartido por todos los comandos
│   │   ├── tray.rs               # Icono y menú de la bandeja
│   │   ├── system_stats.rs       # Medidor de RAM
│   │   └── native/windows.rs     # Llamadas Win32 (unsafe)
│   ├── capabilities/             # control.json, overlay.json (ventanas OV-SLOT-*)
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```
# KawaGiif code style

Reference files: `src-tauri/src/native/windows.rs`, `src-tauri/src/error.rs`, `src-tauri/src/library.rs`.
When in doubt, copy what they do.

## Rust

### File layout
1. Header: a short `/* … */` block (1–3 lines) saying what the module does.
2. Imports: external crates first, a blank line, then `crate::` imports.
3. `/* Personal Note for me: … */` right under the imports, only when the module uses external crates or concepts that aren't obvious (`windows`, `webview2_com`, `sysinfo`, `thiserror`, Tauri plugins, `OnceLock`, error enums…). One indented bullet per item.
4. Body, in this order:
   - free helper functions used across the file.
   - types, each immediately followed by its `impl` (no blank line between them).
   - shared `State` type.
   - command groups, each under a `// Group name` line comment (`//Media Commands`, `//Tag Commands`).

### Spacing
- 1 blank line between items of the same group.
- 3 blank lines between groups.

### Comments
- One line each. `/** … */` above structs, enums and free (module-level) functions. `///` above commands and
  associated functions. `//` for short notes inside or between functions.
- Keep the *why* only when it isn't obvious, cut to 1–2 lines.

### Code
- Trivial functions on one line: `fn media_dir() -> PathBuf { config::data_dir().join("media") }`.
- Short match arms combined on one line: `"gif" => Some(Self::Gif), "mp4" => Some(Self::Mp4),`.
- `let Some(x) = … else { continue; };` and `if cond { continue; }` on one line.
- Signatures on one line when they fit.
- Type annotations on `let` where they help reading (`let mut seen: HashSet<String> = …`).
- Functions that act on one type live in its `impl`. Tauri commands must stay free functions.
- Debug-only results, log under `#[cfg(debug_assertions)]`, and `let _ = x;`

### Rules that never change
- Never hold a `State` lock while calling `window_manager` (window calls fire `Moved`/`Resized` synchronously and
  re-lock → deadlock). Never hold 2 locks at once.
- Renaming a command, a command argument or an event means an update of the React side in the same change.

## React / TypeScript

- Formatting comes from `.prettierrc.json`. Don't hand-format.
- Naming: `PascalCase` components and files, `useX` hooks, `camelCase` everything else, `SCREAMING_CASE` constants.
- File order: imports (external, then local, then CSS) → types → constants → helpers → component → `export default`.
- 1 component per file unless a tiny private sub-component is only used there.
- Reuse hooks and helpers (`useTauriEvent`, `useMediaUrl`, `lib/placed.ts`) instead of repeating logic.
- Comments only where the logic isn't obvious, one line, same tone as the Rust ones.

## CSS
- Colors, spacing, radii and timing come from `src/styles/tokens.css` variables. No new hard-coded values when a
  token exists.
- 1 file per component next to it.
