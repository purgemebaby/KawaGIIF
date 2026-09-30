import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "../lib/ipc";

/**
 * URL cargable de un medio de la biblioteca.
 *
 * Pide la ruta a Rust y la convierte con `convertFileSrc`, que devuelve una
 * URL del protocolo de assets. WebView2 la transmite en **streaming**, así
 * que un vídeo grande cuesta unos pocos MB en vez de materializarse entero
 * en memoria — que es lo que hacía el antiguo `get_media_data_url` con
 * base64, y por lo que la app petaba con vídeos largos.
 *
 * Devuelve `null` mientras resuelve o si la media ya no existe.
 */
export function useMediaUrl(mediaId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    invoke<string>("get_media_path", { id: mediaId })
      .then((path) => {
        if (!cancelled) setUrl(convertFileSrc(path));
      })
      .catch(() => {
        // La media pudo borrarse entre medias; dejarlo en null y que el
        // componente muestre su estado vacío en vez de reventar.
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  return url;
}
