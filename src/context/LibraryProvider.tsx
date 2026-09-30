import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { invoke, listen } from "../lib/ipc";
import { open } from "@tauri-apps/plugin-dialog";

export type MediaType = "gif" | "mp4" | "jpeg" | "png" | "webp";

/** Los tipos que son imágenes fijas: no tiene sentido darles velocidad. */
export const STATIC_TYPES: MediaType[] = ["jpeg", "png"];

export interface MediaItem {
  id: string;
  stored_file_name: string;
  original_file_name: string;
  media_type: MediaType;
  imported_at_unix: number;
  tags: string[];
}

export interface TagCount {
  name: string;
  count: number;
}

/** El backend señaliza "esta media está colocada en N sitios" así. */
export const REFERENCED_PREFIX = "REFERENCED:";

/**
 * A partir de aquí se avisa antes de importar. No es un techo duro: desde que
 * los archivos se cargan en streaming, uno grande ya no tumba la app, solo
 * ocupa disco. El aviso existe para que no importes 2 GB sin darte cuenta.
 */
export const LARGE_FILE_BYTES = 150 * 1024 * 1024;

export interface PendingImport {
  paths: string[];
  /** Los que superan el umbral, con su tamaño, para poder avisar. */
  large: { path: string; bytes: number }[];
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function parseReferencedError(error: unknown): number | null {
  const message = typeof error === "string" ? error : String(error);
  if (!message.includes(REFERENCED_PREFIX)) return null;
  const count = Number(message.split(REFERENCED_PREFIX)[1]);
  return Number.isFinite(count) ? count : null;
}

interface LibraryContextValue {
  items: MediaItem[];
  tags: TagCount[];
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Abre el diálogo de archivos. Si todos son de tamaño normal los importa y
   * devuelve `null`; si alguno es grande NO importa nada y devuelve la lista
   * para que la UI pueda avisar y confirmar con `confirmImport`.
   */
  importFiles: () => Promise<PendingImport | null>;
  confirmImport: (paths: string[]) => Promise<void>;
  updateTags: (id: string, tags: string[]) => Promise<void>;
  renameTag: (from: string, to: string) => Promise<void>;
  deleteTag: (name: string) => Promise<void>;
  /**
   * Borra una media. Si está colocada en el escritorio y `force` es falso,
   * lanza un error que `parseReferencedError` sabe traducir a un número, para
   * que la UI pueda repreguntar en vez de borrar a ciegas.
   */
  deleteMedia: (id: string, force?: boolean) => Promise<void>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

/**
 * Estado único de la biblioteca para toda la ventana.
 *
 * Antes cada componente llamaba a `useLibrary()` por su cuenta y se quedaba
 * con una copia independiente, así que importar desde la Biblioteca no
 * refrescaba la barra lateral del Editor. Ahora hay un solo `useState` y
 * además se escucha el evento `library-changed` que emite Rust, de modo que
 * cualquier cambio (importar, borrar, tocar etiquetas) se propaga solo.
 */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [media, tagCounts] = await Promise.all([
        invoke<MediaItem[]>("list_media"),
        invoke<TagCount[]>("list_all_tags"),
      ]);
      setItems(media);
      setTags(tagCounts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unlisten = listen("library-changed", () => {
      refresh();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [refresh]);

  const confirmImport = useCallback(
    async (sourcePaths: string[]) => {
      await invoke("import_media", { sourcePaths });
      // Rust emite `library-changed`, pero refrescamos también aquí para que
      // el usuario no vea un parpadeo mientras llega el evento.
      await refresh();
    },
    [refresh],
  );

  const importFiles = useCallback(async (): Promise<PendingImport | null> => {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "Media",
          extensions: ["gif", "mp4", "jpg", "jpeg", "png", "webp"],
        },
      ],
    });
    if (!selected) return null;
    const paths = Array.isArray(selected) ? selected : [selected];

    const sizes = await Promise.all(
      paths.map(async (path) => {
        try {
          return { path, bytes: await invoke<number>("get_file_size", { path }) };
        } catch {
          return { path, bytes: 0 };
        }
      }),
    );
    const large = sizes.filter((f) => f.bytes >= LARGE_FILE_BYTES);

    if (large.length === 0) {
      await confirmImport(paths);
      return null;
    }
    return { paths, large };
  }, [confirmImport]);

  const updateTags = useCallback(async (id: string, next: string[]) => {
    await invoke("update_media_tags", { id, tags: next });
  }, []);

  const renameTag = useCallback(async (from: string, to: string) => {
    await invoke("rename_tag", { from, to });
  }, []);

  const deleteTag = useCallback(async (name: string) => {
    await invoke("delete_tag", { name });
  }, []);

  const deleteMedia = useCallback(async (id: string, force = false) => {
    await invoke("delete_media", { id, force });
  }, []);

  return (
    <LibraryContext.Provider
      value={{
        items,
        tags,
        loading,
        refresh,
        importFiles,
        confirmImport,
        updateTags,
        renameTag,
        deleteTag,
        deleteMedia,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) {
    throw new Error("useLibrary debe usarse dentro de un <LibraryProvider>");
  }
  return ctx;
}
