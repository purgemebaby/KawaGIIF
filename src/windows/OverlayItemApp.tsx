import { useEffect, useRef, useState } from "react";
import { invoke, listen, listenToSelf } from "../lib/ipc";
import GifCanvasPlayer from "../components/GifCanvasPlayer";
import { useMediaUrl } from "../hooks/useMediaUrl";
import "./OverlayItemApp.css";

/** Payload de los eventos que cambian una propiedad de un elemento. */
interface ItemValueChanged<T> {
  instance_id: string;
  value: T;
}

interface PlacedMedia {
  instance_id: string;
  media_id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  playback_rate: number | null;
}

interface MediaItem {
  id: string;
  media_type: "gif" | "mp4" | "jpeg" | "png" | "webp";
}

/**
 * Una animación colocada en el escritorio.
 *
 * Esta ventana es una de las `OVERLAY_POOL_SIZE` precreadas en `setup()`:
 * nunca se crea ni se destruye dinámicamente (ver la nota larga en
 * `window_manager::create_overlay_pool` del lado de Rust — crear ventanas
 * transparentes después de que la app arrancó las deja sin transparencia
 * real). Una misma ventana física se reutiliza para distintas animaciones a
 * lo largo de la vida de la app, así que el `instance_id` NO sale de la
 * etiqueta de la ventana: se pide explícitamente y se vuelve a pedir cada vez
 * que el backend avisa de que a esta ventana le toca mostrar otra cosa.
 */
function OverlayItemApp() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaItem["media_type"] | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [selected, setSelected] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const mediaUrl = useMediaUrl(mediaId);
  // Proporción real del medio (ancho/alto). La usa el redimensionado para
  // conservarla, de modo que nunca puedan salir bandas negras.
  const aspectRef = useRef<number | null>(null);

  useEffect(() => {
    invoke<string | null>("get_instance_id_for_window").then(setInstanceId);
    // OJO: tiene que ser el listen de ESTA ventana, no el `listen` global.
    // Un `listen()` pelado se registra con target `Any`, que en Tauri v2 es
    // un *sniffer*: recibe todos los eventos aunque vayan dirigidos a otra
    // ventana. Con el global, cada overlay recibía el `slot-assigned` de la
    // última animación colocada y se repintaba con ella — colocar algo nuevo
    // cambiaba también lo que ya estaba puesto.
    const unlisten = listenToSelf<string>("slot-assigned", (e) =>
      setInstanceId(e.payload),
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    if (!instanceId) {
      setMediaId(null);
      setMediaType(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const item = await invoke<PlacedMedia | null>("get_placed_media", { instanceId });
      if (cancelled || !item) return;
      // Del elemento colocado solo se guardan las propiedades que se pintan.
      // La geometría NO: cambia por debajo (arrastre, redimensionado,
      // `fit_overlay_to_media`) y una copia en React se quedaría obsoleta,
      // que es justo lo que rompía el redimensionado. Cuando hace falta el
      // tamaño, se lee de la ventana.
      setOpacity(item.opacity);
      setPlaybackRate(item.playback_rate ?? 1);
      setMediaId(item.media_id);

      const items = await invoke<MediaItem[]>("list_media");
      const media = items.find((m) => m.id === item.media_id);
      if (media && !cancelled) setMediaType(media.media_type);
    })();
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  /**
   * Cuando el medio termina de cargar, se le dice a Rust su proporción real.
   *
   * Las ventanas nacen cuadradas (220×220), así que un vídeo apaisado se
   * ajustaba con `object-fit: contain` y dejaba franjas negras arriba y
   * abajo. Rust decide si redimensionar: solo lo hace la primera vez, para
   * no deshacer los cambios de tamaño que haga luego el usuario a mano.
   */
  const reportNaturalSize = (width: number, height: number) => {
    if (!width || !height) return;
    aspectRef.current = width / height;
    if (!instanceId) return;
    invoke("fit_overlay_to_media", { instanceId, naturalWidth: width, naturalHeight: height });
  };

  /*
   * `instanceId` se lee desde los manejadores a través de una ref, y no como
   * dependencia del efecto, para que los listeners se registren UNA sola vez.
   *
   * Antes este efecto dependía de `[instanceId]`, así que cada vez que la
   * ventana cambiaba de animación se daban de baja y se volvían a registrar.
   * Como registrar un listener en Tauri es asíncrono, entre la baja y el alta
   * queda un hueco: cualquier evento que caiga ahí se pierde sin dejar rastro,
   * y con `edit-mode-changed` eso significaba quedarse sin tirador de
   * redimensionado hasta la siguiente vez que se entrara al editor.
   */
  const instanceIdRef = useRef<string | null>(null);
  instanceIdRef.current = instanceId;

  useEffect(() => {
    // Estos van dirigidos a esta ventana concreta (ver el comentario de
    // arriba), y además se comprueba el instance_id del payload como segunda
    // barrera: si algún día alguien vuelve a emitir mal, el peor caso es que
    // el evento se ignore, no que se corrompa el elemento de al lado.
    const unlistenOpacity = listenToSelf<ItemValueChanged<number>>(
      "item-opacity-changed",
      (e) => {
        if (e.payload.instance_id === instanceIdRef.current) setOpacity(e.payload.value);
      },
    );
    const unlistenRate = listenToSelf<ItemValueChanged<number>>(
      "item-playback-rate-changed",
      (e) => {
        if (e.payload.instance_id === instanceIdRef.current) setPlaybackRate(e.payload.value);
      },
    );
    const unlistenEditMode = listenToSelf<boolean>("edit-mode-changed", (e) =>
      setEditMode(e.payload),
    );
    // `selection-changed` sí es global a propósito: cada overlay necesita
    // enterarse de que OTRA pasó a estar seleccionada para quitarse el marco.
    const unlistenSelection = listen<string | null>("selection-changed", (e) => {
      setSelected(e.payload === instanceIdRef.current);
    });
    return () => {
      unlistenOpacity.then((f) => f());
      unlistenRate.then((f) => f());
      unlistenSelection.then((f) => f());
      unlistenEditMode.then((f) => f());
    };
  }, []);

  /*
   * Y además se PREGUNTA el estado, no solo se espera al aviso.
   *
   * Un evento perdido antes dejaba la ventana desincronizada para siempre,
   * porque nada volvía a decírselo. Consultando al arrancar y en cada cambio
   * de animación, el estado se recupera solo; los eventos quedan como lo que
   * deben ser, una forma de enterarse sin sondear.
   */
  useEffect(() => {
    let cancelled = false;
    invoke<{ edit_mode: boolean; selected: string | null }>("get_editor_status").then(
      (status) => {
        if (cancelled) return;
        setEditMode(status.edit_mode);
        setSelected(status.selected !== null && status.selected === instanceIdRef.current);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  /*
   * ⚠️ NO llamar a `RedrawWindow` al cambiar la selección.
   *
   * Aquí hubo un efecto que, al cambiar `selected`/`editMode`, invocaba un
   * comando que hacía `RedrawWindow(RDW_INVALIDATE | RDW_UPDATENOW |
   * RDW_ALLCHILDREN)` sobre la ventana. La idea era provocar la recomposición
   * que cura las bandas blancas —se había observado que moverla las quitaba—,
   * pero forzar una invalidación sobre una ventana *layered* es justo lo que
   * puede romper su composición: `RDW_INVALIDATE` marca la zona para BORRARSE
   * antes de repintar, y en una ventana transparente ese borrado deja a la
   * vista lo que hubiera debajo en el búfer.
   *
   * El síntoma encajaba con el disparador: el recuadro translúcido aparecía
   * exactamente al seleccionar, que es cuando se ejecutaba esto.
   */

  // Teclado sobre la animación seleccionada: flechas para moverla y Supr para
  // quitarla. Solo activo si ESTA ventana es la seleccionada (el evento
  // `selection-changed` es global y se filtra por instanceId).
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        // Quita la animación del escritorio; el archivo de la biblioteca no
        // se toca, y "Deshacer" en el editor lo revierte.
        if (instanceId) invoke("remove_placed_media", { instanceId });
        return;
      }

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
  }, [selected, instanceId]);

  const select = () => {
    if (instanceId) invoke("select_overlay", { instanceId });
  };

  /**
   * Redimensionado desde la esquina.
   *
   * En VÍDEO la proporción se bloquea: el elemento `<video>` rellena de negro
   * lo que le sobra, así que un tamaño libre genera bandas. Con la proporción
   * fija el redimensionado es un escalado puro y las bandas no pueden salir.
   * Las imágenes (GIF, PNG, WEBP, JPEG) se redimensionan libremente, que es
   * lo que se pidió: ahí el sobrante queda transparente, no negro.
   *
   * Usa Pointer Events con `setPointerCapture` en vez de escuchar `mousemove`
   * en `window`. Con lo anterior, en cuanto el cursor salía de la ventana
   * overlay —que es justo lo que pasa al arrastrar la esquina hacia fuera—
   * los eventos dejaban de llegar y el arrastre se congelaba a mitad. La
   * captura de puntero mantiene el flujo aunque el cursor se vaya.
   */
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();

    // Todo lo que haga falta del evento se copia AHORA. React reutiliza y
    // limpia el objeto del evento sintético cuando el manejador termina, así
    // que leer `e.algo` desde un callback posterior es pedir problemas.
    // Tipado como HTMLDivElement (y no como Element) para que
    // `addEventListener("pointermove", …)` resuelva al overload que entrega
    // un PointerEvent en vez de un Event genérico.
    const handle: HTMLDivElement = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.screenX;
    const startY = e.screenY;

    handle.setPointerCapture(pointerId);

    // El tamaño de partida se lee de la VENTANA, no del estado de React.
    // `placed` se rellena una sola vez al cargar y no se vuelve a actualizar,
    // así que si `fit_overlay_to_media` ya redimensionó la ventana, seguía
    // valiendo 220×220: al primer movimiento el elemento pegaba un salto de
    // vuelta a ese tamaño y parecía que el redimensionado no funcionaba.
    //
    // `innerWidth` está en píxeles CSS y los comandos trabajan en físicos,
    // de ahí el factor de escala.
    const scale = window.devicePixelRatio || 1;
    const startWidth = Math.round(window.innerWidth * scale);
    const startHeight = Math.round(window.innerHeight * scale);
    const lockAspect = mediaType === "mp4";
    // Si el medio todavía no ha reportado su tamaño, se conserva la
    // proporción que tenga la ventana ahora mismo.
    const aspect = aspectRef.current ?? startWidth / startHeight;

    // Se guarda SIEMPRE el último tamaño calculado y el fotograma envía ese.
    // Descartar los movimientos que llegan con un envío pendiente perdería el
    // último de todos si el usuario suelta justo entonces, y la ventana se
    // quedaría en un tamaño distinto del que marcó el cursor.
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
        // Manda el eje que más se ha movido, y el otro se deriva de la
        // proporción: así el arrastre se siente natural en diagonal.
        const driven =
          Math.abs(dx) >= Math.abs(dy) ? startWidth + dx : (startHeight + dy) * aspect;
        pendingW = Math.max(40, Math.round(driven));
        pendingH = Math.max(40, Math.round(pendingW / aspect));
      } else {
        pendingW = Math.max(40, Math.round(startWidth + dx));
        pendingH = Math.max(40, Math.round(startHeight + dy));
      }

      // Un envío por fotograma como mucho: sin esto se encolan decenas de
      // invocaciones por segundo y el redimensionado va a tirones.
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onUp = () => {
      // Si quedaba un envío pendiente se hace ya, para que el tamaño final
      // sea exactamente donde se soltó el ratón.
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
        {/* WEBP animado lo reproduce WebView2 solo en un <img>, igual que el
            GIF, pero sin control de velocidad. JPEG y PNG son estáticos. */}
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
