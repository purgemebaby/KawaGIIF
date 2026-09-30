import { useEffect } from "react";

/** Etiquetas donde se escribe: ahí `Supr` borra texto, no elementos. */
const EDITABLE = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * ¿El evento viene de un campo donde el usuario está escribiendo?
 *
 * Es la comprobación más importante de todo el atajo: sin ella, pulsar `Supr`
 * para borrar un carácter en el buscador o al renombrar una etiqueta borraría
 * un archivo del disco.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE.has(target.tagName) || target.isContentEditable;
}

/**
 * Ejecuta `onDelete` al pulsar Supr o Retroceso, salvo que se esté
 * escribiendo en un campo.
 *
 * `enabled` permite montar el atajo siempre y activarlo solo cuando hay algo
 * seleccionado, que es más simple que montar y desmontar el listener.
 */
export function useDeleteShortcut(enabled: boolean, onDelete: () => void) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      onDelete();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, onDelete]);
}
