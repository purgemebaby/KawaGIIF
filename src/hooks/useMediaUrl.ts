import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "../lib/ipc";

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
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  return url;
}
