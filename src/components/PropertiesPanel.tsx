import { useEffect, useState } from "react";
import { invoke, listen } from "../lib/ipc";
import { STATIC_TYPES, type MediaType } from "../context/LibraryProvider";
import { t } from "../i18n/es";
import Slider from "./ui/Slider";

interface PlacedMedia {
  instance_id: string;
  media_id: string;
  opacity: number;
  playback_rate: number | null;
}

interface MediaItem {
  id: string;
  media_type: MediaType;
}

const DEFAULT_OPACITY = 1;
const DEFAULT_RATE = 1;

function PropertiesPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedMedia | null>(null);
  const [mediaType, setMediaType] = useState<MediaType | null>(null);

  useEffect(() => {
    const unlisten = listen<string | null>("selection-changed", (e) => setSelectedId(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setPlaced(null);
      setMediaType(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const item = await invoke<PlacedMedia | null>("get_placed_media", {
        instanceId: selectedId,
      });
      if (cancelled || !item) return;
      setPlaced(item);
      const items = await invoke<MediaItem[]>("list_media");
      const media = items.find((m) => m.id === item.media_id);
      if (!cancelled && media) setMediaType(media.media_type);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  if (!selectedId || !placed) {
    return (
      <div className="properties-panel">
        <p className="empty-state">{t.properties.empty}</p>
      </div>
    );
  }

  const setOpacity = (opacity: number) => {
    setPlaced({ ...placed, opacity });
    invoke("set_item_opacity", { instanceId: selectedId, opacity });
  };

  const setPlaybackRate = (rate: number) => {
    setPlaced({ ...placed, playback_rate: rate });
    invoke("set_item_playback_rate", { instanceId: selectedId, playbackRate: rate });
  };

  /**
   * Devuelve opacidad y velocidad a sus valores por defecto. NO toca posición
   * ni tamaño a propósito: teletransportar el elemento al pulsar un botón
   * llamado "Restablecer" se sentiría como un fallo, no como una función.
   */
  const resetProperties = () => {
    setOpacity(DEFAULT_OPACITY);
    if (supportsSpeed) setPlaybackRate(DEFAULT_RATE);
  };

  const supportsSpeed = mediaType !== null && !STATIC_TYPES.includes(mediaType);

  return (
    <div className="properties-panel">
      <h3>{t.properties.title}</h3>

      <Slider
        label={t.properties.opacity}
        min={0.1}
        max={1}
        step={0.05}
        value={placed.opacity}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={setOpacity}
      />

      {supportsSpeed && (
        <Slider
          label={t.properties.speed}
          min={0.25}
          max={3}
          step={0.05}
          value={placed.playback_rate ?? DEFAULT_RATE}
          format={(v) => `${v.toFixed(2)}x`}
          onChange={setPlaybackRate}
        />
      )}

      <button
        type="button"
        className="kg-btn kg-btn--secondary kg-btn--sm"
        onClick={resetProperties}
        title={t.properties.resetHint}
      >
        {t.properties.reset}
      </button>

      <button
        type="button"
        className="kg-btn kg-btn--danger kg-btn--sm"
        onClick={() => {
          invoke("remove_placed_media", { instanceId: selectedId });
          setSelectedId(null);
        }}
      >
        {t.editor.removeItem}
      </button>
    </div>
  );
}

export default PropertiesPanel;
