# KawaGiif — Resumen del proyecto

## Objetivo del proyecto

Una aplicación open source en Rust llamada KawaGiif que replica la funcionalidad de AnimaEngine (app de pago en Steam): mostrar animaciones, GIFs, imágenes y vídeos (MP4, WEBP y similares) como elementos superpuestos, transparentes y siempre visibles sobre el escritorio de Windows. El audio queda descartado explícitamente: es un visualizador puro, no un reproductor multimedia completo. El proyecto tiene doble finalidad: sacar una herramienta funcional y usarla como vehículo de aprendizaje de Rust y programación de sistemas, partiendo de conocimiento casi nulo de Rust.

## Plataforma objetivo

Windows, en exclusiva por ahora. Se descarta de momento el soporte para Linux (X11/Wayland tienen mecanismos completamente distintos para overlays y click-through, y Wayland en particular tiene soporte fragmentado entre compositores), aunque la arquitectura elegida no cierra la puerta a añadirlo más adelante.

## Arquitectura elegida

Backend en Rust puro + frontend en React, comunicados vía Tauri (framework que usa WRY como capa de WebView y TAO como gestor de ventanas). En Windows, el WebView es WebView2 (el motor Chromium que trae integrado el propio sistema operativo a través de Edge), lo cual resuelve de fábrica la decodificación de MP4/H.264, GIF y WEBP animado sin que tengas que escribir ni un decoder.

La razón de esta elección frente a Electron: mismo patrón de "Rust/nativo + web para la UI" pero con instaladores de un dígito o bajos dos dígitos de MB y 30-60 MB de RAM en reposo, frente a los 80-200 MB de instalador y 150-300 MB de RAM de Electron. La razón frente a hacerlo todo nativo en Rust con `wgpu`/decoders propios: habría sido el camino con más aprendizaje "puro" de Rust, pero también meses extra de trabajo en shaders, sincronización de frames y bindings FFI a `ffmpeg`, antes de tener siquiera una ventana funcionando. Tauri es el punto intermedio: la lógica de sistema (ventanas, IPC, ficheros, llamadas nativas a Win32) se escribe en Rust real, mientras que el renderizado del contenido lo resuelve el motor web integrado.

## Funcionalidades a implementar (lista original)

- Archivo de configuración persistente (biblioteca de assets, posición y ajustes de cada animación).
- Arranque desde terminal (con argumentos vía CLI) o desde icono de escritorio.
- Auto-arranque opcional al encender el PC, activable/desactivable desde ajustes.
- Ventanas superpuestas sobre el resto de apps, sin aparecer como ventana normal en la barra de tareas ni en el Alt+Tab.
- Arrastre manual de cada animación con el ratón para reposicionarla, y borrado individual vía menú contextual (clic derecho).
- Control de FPS y de tamaño (resize) por cada asset.
- Click-through / pass-through: que los clics atraviesen la animación sin interrumpir, por ejemplo, una partida de un juego competitivo.
- Hide on hover: ocultar automáticamente la animación cuando el cursor se acerca a ella.

## Limitaciones técnicas ya detectadas y su plan de solución

Estas son cosas confirmadas investigando el estado actual de Tauri v2 en Windows, para que no pillen por sorpresa a mitad de desarrollo:

**Click-through de ventana completa, no por región.** El `setIgnoreCursorEvents` de Tauri es un interruptor de ventana completa, no hay hit-testing por región dentro de una misma ventana. Como cada animación va a ser su propia ventana independiente, esto en realidad encaja bien con el diseño: se activa o desactiva el pass-through por ventana entera, sin necesitar granularidad de píxel.

**Bug conocido de `skip_taskbar` en Windows (Tauri v2).** No siempre oculta el icono de la barra de tareas de forma fiable. El plan es no depender solo de la opción del framework, sino aplicar directamente el workaround a bajo nivel con la crate `windows`: quitar el estilo `WS_EX_APPWINDOW` y añadir `WS_EX_TOOLWINDOW` sobre el HWND de cada ventana tras crearla. **Confirmado en la práctica** (ver sección de estado más abajo): además, `skip_taskbar(true)` de Tauri reaplica su propio fix (poco fiable) cada vez que la ventana gana foco, pisando el workaround manual si solo se aplica una vez — hay que reforzarlo en cada evento de foco, no solo tras crear la ventana.

**`always_on_top` es global a nivel de sistema**, no relativo solo a la propia app (queda por encima de cualquier ventana con foco, no solo de las de la propia app). Para este caso de uso esto es justo el comportamiento deseado, así que no requiere workaround, solo tenerlo presente.

**Click-through y foco de teclado.** Un listener de `Escape` local a la ventana solo funciona si esa ventana tiene el foco de teclado — con click-through activo no hay forma de volver a clickearla para devolverle el foco, así que si el usuario interactúa con otra ventana mientras tanto, Escape deja de llegar. Solución: un atajo de teclado global (`tauri-plugin-global-shortcut`) que funciona sin importar qué ventana tenga el foco, como vía de recuperación robusta.

**`data-tauri-drag-region` sigue gateado por el sistema de capabilities.** Aunque es un atributo HTML declarativo, invoca internamente el comando core `start_dragging`, que necesita el permiso `core:window:allow-start-dragging` explícito en el archivo de capabilities correspondiente — no es puramente del lado del navegador como podría parecer.

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

Nota: en el scaffold real generado por Tauri v2, la lógica de arranque (`tauri::Builder`, `.setup()`, etc.) vive en `src-tauri/src/lib.rs`, no en `main.rs` — `main.rs` queda como punto de entrada mínimo que solo llama a `<crate>_lib::run()`. El ejemplo de abajo sigue el estilo original de este documento (todo en un único archivo) por simplicidad expositiva.

## Ejemplo de `main.rs` mínimo

```
use tauri::{WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
fn create_animation_window(app: tauri::AppHandle, asset_path: String) -> Result<(), String> {
    WebviewWindowBuilder::new(&app, &asset_path, WebviewUrl::App("player.html".into()))
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![create_animation_window])
        .run(tauri::generate_context!())
        .expect("error al ejecutar la aplicación");
}
```

## Punto en el que estamos

El prototipo de los 3 escollos técnicos (ventana transparente sin decoraciones, click-through con recuperación robusta vía atajo global, workaround de `skip_taskbar` reforzado en cada evento de foco, y arrastre de ventana) está **construido y verificado de punta a punta** — con capturas de pantalla y consultas directas a la API Win32 (`GetWindowLongPtr`/`GetProcess`), no solo inspección visual.

La v1 funcional completa (M1-M5) está **implementada**: ventana de control (Home/Storage/Editor/Ajustes) separada de las ventanas overlay de animación, biblioteca de media importable con tags y filtros, editor visual (el grid decorativo estilo blueprint se eliminó después por dar más problemas que valor), plantilla persistente en disco, bandeja del sistema con menú contextual, y gestión robusta de ventanas (close-to-tray, cierre en cascada al salir, botón de pánico "matar todas las animaciones" disponible tanto en Home como en el menú del tray).

**Cambio de arquitectura importante descubierto durante la implementación**: las ventanas overlay de animación NO se crean dinámicamente cuando el usuario coloca una animación — se confirmó empíricamente (comparando el `EXSTYLE` crudo vía Win32) que cualquier ventana `transparent(true)` creada DESPUÉS de que la app terminó de arrancar (sea desde un command handler o despachada a `run_on_main_thread`) nace sin `WS_EX_LAYERED`, sin transparencia real. La solución fue precrear un **pool de ventanas overlay ocultas en `setup()`** (etiquetas `OV-SLOT-N`); colocar una animación asigna un slot libre del pool y lo reposiciona/muestra, en vez de crear una ventana nueva. El tamaño del pool es un ajuste (`overlay_pool_size`, 8 por defecto, máximo `window_manager::MAX_POOL` = 20) que se aplica al reiniciar, porque cada ventana es un proceso de render de WebView2 (~40-80 MB).

El plan detallado de esta v1, dividido en milestones incrementales (fundamentos → biblioteca → navegación/ajustes → editor → bandeja/cierre en cascada), vive fuera de este documento en el sistema de planes de la sesión de desarrollo — este archivo se mantiene como el resumen de arquitectura de referencia, no como el tracker de progreso.
