import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../context/LibraryProvider";
import { useMediaUrl } from "../hooks/useMediaUrl";
import { t } from "../i18n/es";
import TagChips from "./tags/TagChips";
import TagPopover from "./tags/TagPopover";

interface MediaGridProps {
  items: MediaItem[];
  /** Tarjeta marcada. Es sobre la que actúa el atajo Supr. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onDelete: (item: MediaItem) => void;
}

/** Cuántos momentos del vídeo se recorren al previsualizar. */
const PREVIEW_STEPS = 8;
/** Cuánto dura cada fotograma de la previsualización. */
const PREVIEW_INTERVAL_MS = 700;

function MediaThumbnail({ item }: { item: MediaItem }) {
  const url = useMediaUrl(item.id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);

  /**
   * Previsualización al posar el ratón, como la rejilla de YouTube: va
   * saltando por momentos repartidos a lo largo del vídeo en vez de
   * reproducirlo, que con un vídeo largo solo dejaría ver el arranque.
   *
   * Se mueve `currentTime` en vez de reproducir: así no hay que esperar a
   * que se descargue todo lo intermedio y el salto es inmediato.
   */
  const startPreview = () => {
    const video = videoRef.current;
    if (!video || !video.duration || timerRef.current) return;

    let step = 1;
    timerRef.current = window.setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.duration) return;
      v.currentTime = (v.duration * step) / (PREVIEW_STEPS + 1);
      step = (step % PREVIEW_STEPS) + 1;
    }, PREVIEW_INTERVAL_MS);
  };

  const stopPreview = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.currentTime = 0;
  };

  // El intervalo tiene que morir con el componente: si la tarjeta desaparece
  // por un filtro mientras el ratón está encima, `stopPreview` no llega a
  // ejecutarse y el intervalo quedaría corriendo para siempre.
  useEffect(() => stopPreview, []);

  if (!url) {
    return <div className="media-thumb" />;
  }

  if (item.media_type === "mp4") {
    return (
      <div className="media-thumb" onMouseEnter={startPreview} onMouseLeave={stopPreview}>
        {/* `preload="metadata"` pide solo la cabecera: basta para conocer la
            duración y pintar un fotograma, sin descargar el vídeo entero. */}
        <video ref={videoRef} src={url} muted playsInline preload="metadata" />
      </div>
    );
  }

  // GIF y WEBP animados se mueven solos dentro de un <img>.
  return (
    <div className="media-thumb">
      <img src={url} alt={item.original_file_name} />
    </div>
  );
}

function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString();
}

function MediaGrid({
  items,
  selectedId,
  onSelect,
  onUpdateTags,
  onDelete,
}: MediaGridProps) {
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="empty-state">{t.storage.empty}</p>;
  }

  return (
    <div className="media-grid">
      {items.map((item) => (
        <div
          key={item.id}
          className={item.id === selectedId ? "media-card selected" : "media-card"}
          // Seleccionar con clic habilita el atajo Supr. Se usa `onPointerDown`
          // y no `onClick` para que la selección ocurra antes de que el
          // popover de etiquetas se abra o se cierre.
          onPointerDown={() => onSelect(item.id)}
        >
          <button
            type="button"
            className="media-card-delete"
            onClick={() => onDelete(item)}
            aria-label={t.common.delete}
            title={t.common.delete}
          >
            ×
          </button>

          <MediaThumbnail item={item} />

          <div className="media-card-body">
            <p className="media-name" title={item.original_file_name}>
              {item.original_file_name}
            </p>
            <p className="media-meta">
              {item.media_type.toUpperCase()} · {formatDate(item.imported_at_unix)}
            </p>

            <div className="media-card-tags">
              <TagChips
                tags={item.tags}
                onEdit={() => setEditingTagsFor(editingTagsFor === item.id ? null : item.id)}
              />
              {editingTagsFor === item.id && (
                <TagPopover
                  tags={item.tags}
                  onChange={(tags) => onUpdateTags(item.id, tags)}
                  onClose={() => setEditingTagsFor(null)}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default MediaGrid;
