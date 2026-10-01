import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "../lib/ipc";
import {
  fileNameOf,
  formatBytes,
  parseReferencedError,
  useLibrary,
  type MediaItem,
  type PendingImport,
} from "../context/LibraryProvider";
import { t } from "../i18n/en";
import MediaFilterBar, { DEFAULT_FILTERS, type MediaFilters } from "./MediaFilterBar";
import MediaGrid from "./MediaGrid";
import TagManager from "./tags/TagManager";
import Modal from "./ui/Modal";
import WaveText from "./brand/WaveText";
import { useDeleteShortcut } from "../hooks/useDeleteShortcut";
import "./StorageScreen.css";

interface DeleteState {
  item: MediaItem;
  placedCount: number | null;
}

function StorageScreen() {
  const { items, loading, importFiles, confirmImport, updateTags, deleteMedia } = useLibrary();
  const [filters, setFilters] = useState<MediaFilters>(DEFAULT_FILTERS);
  const [managingTags, setManagingTags] = useState(false);
  const [deleting, setDeleting] = useState<DeleteState | null>(null);
  const [confirmBeforeDelete, setConfirmBeforeDelete] = useState(true);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    invoke<{ confirm_media_delete: boolean }>("get_config").then((cfg) =>
      setConfirmBeforeDelete(cfg.confirm_media_delete),
    );
  }, []);

  const filteredItems = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const selectedTags = filters.tags.map((tag) => tag.toLowerCase());

    const result = items.filter((item) => {
      if (filters.type !== "all" && item.media_type !== filters.type) return false;

      if (selectedTags.length > 0) {
        const own = item.tags.map((tag) => tag.toLowerCase());
        if (!selectedTags.every((tag) => own.includes(tag))) return false;
      }

      if (!query) return true;
      const haystack = [item.original_file_name, ...item.tags].join(" ").toLowerCase();
      return haystack.includes(query);
    });

    return [...result].sort((a, b) => {
      switch (filters.sort) {
        case "name-asc":
          return a.original_file_name.localeCompare(b.original_file_name, "es");
        case "name-desc":
          return b.original_file_name.localeCompare(a.original_file_name, "es");
        case "date-old":
          return a.imported_at_unix - b.imported_at_unix;
        case "date-new":
        default:
          return b.imported_at_unix - a.imported_at_unix;
      }
    });
  }, [items, filters]);

  const attemptDelete = async (item: MediaItem, force: boolean) => {
    try {
      await deleteMedia(item.id, force);
      setDeleting(null);
    } catch (error) {
      const placedCount = parseReferencedError(error);
      if (placedCount !== null) {
        setDeleting({ item, placedCount });
      } else {
        setDeleting(null);
        throw error;
      }
    }
  };

  const requestDelete = useCallback(
    (item: MediaItem) => {
      if (confirmBeforeDelete) {
        setDeleting({ item, placedCount: null });
      } else {
        attemptDelete(item, false);
      }
    },
    [confirmBeforeDelete],
  );

  const deleteSelected = useCallback(() => {
    const item = items.find((m) => m.id === selectedId);
    if (item) requestDelete(item);
  }, [items, selectedId, requestDelete]);

  useDeleteShortcut(selectedId !== null && deleting === null, deleteSelected);

  return (
    <div className="storage-screen">
      <div className="storage-header">
        <h1>{t.storage.title}</h1>
        <button
          type="button"
          className="kg-btn kg-btn--primary"
          onClick={async () => setPendingImport(await importFiles())}
        >
          {t.storage.import}
        </button>
      </div>

      <MediaFilterBar
        filters={filters}
        onChange={setFilters}
        onOpenTags={() => setManagingTags(true)}
      />

      {loading ? (
        <p className="empty-state">{t.common.loading}</p>
      ) : items.length === 0 ? (
        <div className="storage-empty">
          <WaveText as="p" className="storage-empty-title">
            {t.storage.emptyLibrary}
          </WaveText>
          <p className="storage-empty-hint">{t.storage.emptyHint}</p>
        </div>
      ) : (
        <MediaGrid
          items={filteredItems}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUpdateTags={updateTags}
          onDelete={requestDelete}
        />
      )}

      {managingTags && (
        <TagManager
          activeFilters={filters.tags}
          onToggleFilter={(tag) =>
            setFilters((prev) => ({
              ...prev,
              tags: prev.tags.some((x) => x.toLowerCase() === tag.toLowerCase())
                ? prev.tags.filter((x) => x.toLowerCase() !== tag.toLowerCase())
                : [...prev.tags, tag],
            }))
          }
          onClose={() => setManagingTags(false)}
        />
      )}

      {pendingImport && (
        <Modal
          title={t.storage.largeImport.title}
          confirmLabel={t.storage.largeImport.confirm}
          onCancel={() => setPendingImport(null)}
          onConfirm={async () => {
            const paths = pendingImport.paths;
            setPendingImport(null);
            await confirmImport(paths);
          }}
        >
          <p className="modal-body">
            {t.storage.largeImport.body(
              pendingImport.large
                .map((f) => t.storage.largeImport.fileEntry(fileNameOf(f.path), formatBytes(f.bytes)))
                .join(", "),
              formatBytes(pendingImport.large.reduce((sum, f) => sum + f.bytes, 0)),
            )}
          </p>
        </Modal>
      )}

      {deleting && (
        <Modal
          title={t.storage.deleteConfirm.title}
          confirmLabel={
            deleting.placedCount === null
              ? t.common.delete
              : t.storage.deleteConfirm.confirm
          }
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={() => attemptDelete(deleting.item, deleting.placedCount !== null)}
        >
          <p className="modal-body">
            {deleting.placedCount === null
              ? t.storage.deleteConfirm.body(deleting.item.original_file_name)
              : t.storage.deleteConfirm.placedBody(
                  deleting.item.original_file_name,
                  deleting.placedCount,
                )}
          </p>
        </Modal>
      )}
    </div>
  );
}

export default StorageScreen;
