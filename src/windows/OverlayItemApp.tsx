import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../lib/ipc";
import { loadPlacedMedia } from "../lib/placed";
import type { MediaType } from "../context/LibraryProvider";
import GifCanvasPlayer from "../components/GifCanvasPlayer";
import { useMediaUrl } from "../hooks/useMediaUrl";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { useDeleteShortcut } from "../hooks/useDeleteShortcut";
import "./OverlayItemApp.css";

interface ItemValueChanged<T> {
  instance_id: string;
  value: T;
}

function OverlayItemApp() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selected, setSelected] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const mediaUrl = useMediaUrl(mediaId);
  const aspectRef = useRef<number | null>(null);

  useEffect(() => {
    invoke<string | null>("get_instance_id_for_window").then(setInstanceId);
  }, []);

  useTauriEvent<string>("slot-assigned", setInstanceId, "self");

  useEffect(() => {
    if (!instanceId) {
      setMediaId(null);
      setMediaType(null);
      return;
    }
    let cancelled = false;
    loadPlacedMedia(instanceId).then((placed) => {
      if (cancelled || !placed) return;
      setOpacity(placed.item.opacity);
      setPlaybackRate(placed.item.playback_rate ?? 1);
      setMediaId(placed.item.media_id);
      setMediaType(placed.mediaType);
    });
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  const reportNaturalSize = (width: number, height: number) => {
    if (!width || !height) return;
    aspectRef.current = width / height;
    if (!instanceId) return;
    invoke("fit_overlay_to_media", { instanceId, naturalWidth: width, naturalHeight: height });
  };

  useTauriEvent<ItemValueChanged<number>>(
    "item-opacity-changed",
    (payload) => {
      if (payload.instance_id === instanceId) setOpacity(payload.value);
    },
    "self",
  );
  useTauriEvent<ItemValueChanged<number>>(
    "item-playback-rate-changed",
    (payload) => {
      if (payload.instance_id === instanceId) setPlaybackRate(payload.value);
    },
    "self",
  );
  useTauriEvent<boolean>("edit-mode-changed", setEditMode, "self");
  useTauriEvent<string | null>("selection-changed", (payload) => {
    setSelected(payload !== null && payload === instanceId);
  });

  useEffect(() => {
    let cancelled = false;
    invoke<{ edit_mode: boolean; selected: string | null }>("get_editor_status").then(
      (status) => {
        if (cancelled) return;
        setEditMode(status.edit_mode);
        setSelected(status.selected !== null && status.selected === instanceId);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  const removeSelf = useCallback(() => {
    if (instanceId) invoke("remove_placed_media", { instanceId });
  }, [instanceId]);

  useDeleteShortcut(selected, removeSelf);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;
      e.preventDefault();
      invoke("nudge_overlay", { dx, dy });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  const select = () => {
    if (instanceId) invoke("select_overlay", { instanceId });
  };

  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const handle: HTMLDivElement = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.screenX;
    const startY = e.screenY;

    handle.setPointerCapture(pointerId);

    const scale = window.devicePixelRatio || 1;
    const startWidth = Math.round(window.innerWidth * scale);
    const startHeight = Math.round(window.innerHeight * scale);
    const lockAspect = mediaType === "mp4";
    const aspect = aspectRef.current ?? startWidth / startHeight;

    let pendingW = startWidth;
    let pendingH = startHeight;
    let frame = 0;

    const flush = () => {
      frame = 0;
      invoke("resize_overlay", { width: pendingW, height: pendingH });
    };

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.screenX - startX;
      const dy = moveEvent.screenY - startY;

      if (lockAspect) {
        const driven =
          Math.abs(dx) >= Math.abs(dy) ? startWidth + dx : (startHeight + dy) * aspect;
        pendingW = Math.max(40, Math.round(driven));
        pendingH = Math.max(40, Math.round(pendingW / aspect));
      } else {
        pendingW = Math.max(40, Math.round(startWidth + dx));
        pendingH = Math.max(40, Math.round(startHeight + dy));
      }

      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onUp = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        flush();
      }
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      className={selected ? "overlay-shell selected" : "overlay-shell"}
      data-tauri-drag-region
      onMouseDown={select}
    >
      <div className="overlay-media-wrap" style={{ opacity }}>
        {mediaUrl && mediaType === "mp4" && (
          <video
            src={mediaUrl}
            autoPlay
            loop
            muted
            playsInline
            onLoadedMetadata={(e) =>
              reportNaturalSize(e.currentTarget.videoWidth, e.currentTarget.videoHeight)
            }
            ref={(el) => {
              if (el) el.playbackRate = playbackRate;
            }}
          />
        )}
        {mediaUrl && mediaType === "gif" && (
          <GifCanvasPlayer
            src={mediaUrl}
            speedMultiplier={playbackRate}
            className="overlay-media"
            onNaturalSize={reportNaturalSize}
          />
        )}
        {mediaUrl && (mediaType === "jpeg" || mediaType === "png" || mediaType === "webp") && (
          <img
            src={mediaUrl}
            alt=""
            draggable={false}
            onLoad={(e) =>
              reportNaturalSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
            }
          />
        )}
      </div>
      {editMode && selected && (
        <div className="resize-handle" onPointerDown={onResizeStart} />
      )}
    </div>
  );
}

export default OverlayItemApp;
