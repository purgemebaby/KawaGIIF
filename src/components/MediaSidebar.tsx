import { invoke } from "../lib/ipc";
import { Window } from "@tauri-apps/api/window";
import { useLibrary, type MediaItem } from "../context/LibraryProvider";
import { useMediaUrl } from "../hooks/useMediaUrl";
import { t } from "../i18n/es";

function SidebarThumb({ item }: { item: MediaItem }) {
  const url = useMediaUrl(item.id);

  if (!url) {
    return (
      <div className="sidebar-thumb sidebar-thumb-placeholder">
        {item.media_type.toUpperCase()}
      </div>
    );
  }
  if (item.media_type === "mp4") {
    return <video className="sidebar-thumb" src={url} muted playsInline preload="metadata" />;
  }
  return <img className="sidebar-thumb" src={url} alt="" draggable={false} />;
}

/// Arrastrar desde acá no usa drag-and-drop HTML5 (el evento `drop` nunca
/// dispara si se suelta fuera de contenido HTML, como el escritorio real).
/// En cambio: al presionar el mouse se crea la ventana overlay ya en modo
/// interactivo, y se le pide a Windows que tome el control nativo del
/// arrastre de ESA ventana con `startDragging()` — mismo mecanismo que ya
/// prueba el prototipo para mover una overlay existente.
interface SpawnedOverlay {
  instance_id: string;
  window_label: string;
}

function MediaSidebar() {
  const { items } = useLibrary();

  const onMouseDown = async (e: React.MouseEvent, mediaId: string) => {
    // Sin esto, el navegador interpreta el arrastre que sigue como una
    // selección de texto (mientras el invoke de abajo todavía está en
    // vuelo) en vez de dejar que startDragging() tome el control nativo.
    e.preventDefault();
    const spawned = await invoke<SpawnedOverlay>("spawn_placed_media", { mediaId });
    const handle = await Window.getByLabel(spawned.window_label);
    await handle?.startDragging();
  };

  return (
    <div className="media-sidebar">
      <h2>{t.editor.sidebarTitle}</h2>
      <div className="media-sidebar-list">
        {items.length === 0 && <p className="empty-state">{t.editor.sidebarEmpty}</p>}
        {items.map((item) => (
          <div
            key={item.id}
            className="media-sidebar-item"
            onMouseDown={(e) => onMouseDown(e, item.id)}
            title={t.editor.sidebarHint}
          >
            <SidebarThumb item={item} />
            <span>{item.original_file_name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MediaSidebar;
