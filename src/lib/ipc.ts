/*
 * Capa fina sobre el IPC de Tauri que permite ejecutar la interfaz en un
 * navegador normal, sin Tauri.
 *
 * Por qué: cada cambio en Rust obliga a recompilar y reiniciar la app, y las
 * ventanas sin decoración son incómodas de inspeccionar. Con esto se puede
 * lanzar `npm run dev` a secas y abrir `localhost:1420/?role=control` en Edge,
 * con devtools completas y recarga instantánea, para iterar todo el trabajo
 * visual. Fuera de Tauri los comandos devuelven datos de ejemplo en vez de
 * lanzar un error.
 *
 * Efecto colateral útil: los componentes dejan de depender directamente de
 * `@tauri-apps/api`, lo que además los hace testeables.
 */
import { invoke as tauriInvoke, convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";

/** `true` cuando la página corre dentro de Tauri. */
export const IS_TAURI = "__TAURI_INTERNALS__" in window;

/* ------------------------------------------------------------------ */
/* Datos de ejemplo para el modo navegador                             */
/* ------------------------------------------------------------------ */

const MOCK_TAGS = [
  { name: "Chibi", count: 3 },
  { name: "Anime", count: 2 },
  { name: "Pixel art", count: 1 },
];

const MOCK_MEDIA = [
  { id: "m1", name: "hoyo-hsr.gif", type: "gif", tags: ["Chibi", "Anime"] },
  { id: "m2", name: "nightclub.gif", type: "gif", tags: ["Chibi"] },
  { id: "m3", name: "wannacry.mp4", type: "mp4", tags: ["Anime"] },
  { id: "m4", name: "sprite.png", type: "png", tags: ["Pixel art"] },
  { id: "m5", name: "banner.webp", type: "webp", tags: [] },
  { id: "m6", name: "foto.jpg", type: "jpeg", tags: ["Chibi"] },
].map((m, i) => ({
  id: m.id,
  stored_file_name: `${m.id}.${m.type}`,
  original_file_name: m.name,
  media_type: m.type,
  imported_at_unix: Math.floor(Date.now() / 1000) - i * 86_400,
  tags: m.tags,
}));

const MOCK_CONFIG = {
  launch_on_startup: false,
  start_minimized_to_tray: false,
  confirm_media_delete: true,
};

/**
 * Respuestas de los comandos fuera de Tauri. Un comando que no esté aquí
 * devuelve `null`, que es lo que casi todos los `set_*` esperan.
 */
const MOCK_RESPONSES: Record<string, unknown> = {
  list_media: MOCK_MEDIA,
  list_all_tags: MOCK_TAGS,
  get_config: MOCK_CONFIG,
  get_working_template: { schema_version: 2, items: [] },
  load_template: { schema_version: 2, items: [] },
  list_placed_items: [],
  has_unsaved_changes: false,
  get_placed_media: null,
  get_instance_id_for_window: null,
  get_file_size: 1024 * 1024,
};

/* ------------------------------------------------------------------ */
/* API pública                                                         */
/* ------------------------------------------------------------------ */

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (IS_TAURI) return tauriInvoke<T>(command, args);

  if (command in MOCK_RESPONSES) {
    return MOCK_RESPONSES[command] as T;
  }
  // Ruido controlado: avisa de qué comando falta por simular sin romper la
  // pantalla, para poder ir completando los datos de ejemplo según hagan falta.
  console.info(`[ipc] sin simular: ${command}`, args);
  return null as T;
}

export async function listen<T>(
  event: string,
  handler: (e: { payload: T }) => void,
): Promise<UnlistenFn> {
  if (IS_TAURI) return tauriListen<T>(event, handler);
  // Fuera de Tauri no hay backend que emita nada.
  return () => {};
}

/**
 * Escucha SOLO los eventos dirigidos a esta ventana.
 *
 * Es distinto de `listen`: un `listen` pelado se registra con target `Any`,
 * que en Tauri v2 es un *sniffer* y recibe todo aunque vaya dirigido a otra
 * ventana. Esa diferencia causó un bug feo (cada overlay se repintaba con la
 * última animación colocada), así que conviene que el nombre lo deje claro.
 *
 * Se importa de forma diferida para que el modo navegador no cargue nada de
 * Tauri.
 */
export async function listenToSelf<T>(
  event: string,
  handler: (e: { payload: T }) => void,
): Promise<UnlistenFn> {
  if (!IS_TAURI) return () => {};
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return getCurrentWebviewWindow().listen<T>(event, handler);
}

/**
 * En el navegador no existe el protocolo de assets, así que se devuelve un
 * marcador de posición para que la rejilla tenga algo que pintar.
 */
export function convertFileSrc(path: string): string {
  if (IS_TAURI) return tauriConvertFileSrc(path);
  return PLACEHOLDER_IMAGE;
}

/** Cuadro liso con el color de acento, en línea para no depender de red. */
const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
       <rect width="100" height="100" fill="#26282f"/>
       <circle cx="50" cy="50" r="26" fill="#a97bff" opacity="0.5"/>
     </svg>`,
  );
