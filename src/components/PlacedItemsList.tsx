import { useCallback, useEffect, useState } from "react";
import { invoke, listen } from "../lib/ipc";
import type { MediaType } from "../context/LibraryProvider";
import { t } from "../i18n/es";

interface PlacedItemSummary {
  instance_id: string;
  media_id: string;
  original_file_name: string;
  media_type: MediaType;
  selected: boolean;
}

/**
 * Lista de las animaciones colocadas ahora mismo en el escritorio.
 *
 * Existe porque hasta ahora la única forma de deshacerse de algo que habías
 * colocado era "Deshacer", que revertía TODO. Aquí se quita una sola.
 *
 * El cruce con la biblioteca (para saber el nombre del archivo) lo hace Rust
 * en `list_placed_items`, así que esto es una llamada y no una por elemento.
 */
function PlacedItemsList() {
  const [items, setItems] = useState<PlacedItemSummary[]>([]);

  const refresh = useCallback(async () => {
    setItems(await invoke<PlacedItemSummary[]>("list_placed_items"));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unlistenPlaced = listen("placed-items-changed", refresh);
    const unlistenSelection = listen("selection-changed", refresh);
    return () => {
      unlistenPlaced.then((f) => f());
      unlistenSelection.then((f) => f());
    };
  }, [refresh]);

  if (items.length === 0) {
    return (
      <div className="placed-items">
        <h2>{t.editor.placedTitle}</h2>
        <p className="empty-state">{t.editor.placedEmpty}</p>
      </div>
    );
  }

  return (
    <div className="placed-items">
      <h2>{t.editor.placedTitle}</h2>
      <ul className="placed-items-list">
        {items.map((item) => (
          <li
            key={item.instance_id}
            className={item.selected ? "placed-item selected" : "placed-item"}
          >
            <button
              type="button"
              className="placed-item-select"
              onClick={() => invoke("select_overlay", { instanceId: item.instance_id })}
              title={item.original_file_name}
            >
              <span className="placed-item-type">{item.media_type.toUpperCase()}</span>
              <span className="placed-item-name">{item.original_file_name}</span>
            </button>
            <button
              type="button"
              className="placed-item-remove"
              onClick={() => invoke("remove_placed_media", { instanceId: item.instance_id })}
              aria-label={t.editor.removeItem}
              title={t.editor.removeItem}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PlacedItemsList;
