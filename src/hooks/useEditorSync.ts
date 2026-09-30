import { useCallback, useEffect, useState } from "react";
import { listen } from "../lib/ipc";

/// Sincroniza el estado de React de `control` con lo que va cambiando del
/// lado de Rust durante una sesión de edición: qué ítem está seleccionado
/// (para el panel de propiedades) y cuáles se movieron/redimensionaron
/// (para el resumen de la confirmación de guardado).
export function useEditorSync() {
  const [movedInstanceIds, setMovedInstanceIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const unlistenGeometry = listen<string>("overlay-geometry-changed", (e) => {
      setMovedInstanceIds((prev) => {
        const next = new Set(prev);
        next.add(e.payload);
        return next;
      });
    });
    const unlistenSelection = listen<string | null>("selection-changed", (e) => setSelectedId(e.payload));
    return () => {
      unlistenGeometry.then((f) => f());
      unlistenSelection.then((f) => f());
    };
  }, []);

  const resetMoved = useCallback(() => setMovedInstanceIds(new Set()), []);

  return { movedInstanceIds, selectedId, resetMoved };
}
