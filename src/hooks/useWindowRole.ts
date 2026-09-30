import { getCurrentWindow } from "@tauri-apps/api/window";
import { IS_TAURI } from "../lib/ipc";

export type WindowRole = "control" | "overlay";

const OVERLAY_PREFIX = "overlay-";

/**
 * Qué papel juega esta ventana.
 *
 * Dentro de Tauri se deduce de la etiqueta de la ventana. Fuera (modo
 * navegador, para iterar la interfaz sin recompilar) se lee de la query:
 * `localhost:1420/?role=control`, `?role=overlay`.
 */
export function useWindowRole(): WindowRole {
  if (!IS_TAURI) {
    const param = new URLSearchParams(location.search).get("role");
    if (param === "overlay") return param;
    return "control";
  }

  const label = getCurrentWindow().label;
  if (label.startsWith(OVERLAY_PREFIX)) return "overlay";
  return "control";
}
