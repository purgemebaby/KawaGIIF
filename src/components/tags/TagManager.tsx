import { useMemo, useState } from "react";
import { useLibrary } from "../../context/LibraryProvider";
import { t } from "../../i18n/en";
import Modal from "../ui/Modal";

interface Props {
  activeFilters: string[];
  onToggleFilter: (tag: string) => void;
  onClose: () => void;
}

function TagManager({ activeFilters, onToggleFilter, onClose }: Props) {
  const { tags, renameTag, deleteTag } = useLibrary();
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<{ name: string; count: number } | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tags, query]);

  const isActive = (name: string) =>
    activeFilters.some((f) => f.toLowerCase() === name.toLowerCase());

  const startRename = (name: string) => {
    setRenaming(name);
    setDraft(name);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const next = draft.trim();
    if (next && next !== renaming) {
      await renameTag(renaming, next);
    }
    setRenaming(null);
  };

  return (
    <>
      <Modal title={t.tags.manage} onCancel={onClose}>
        {tags.length === 0 ? (
          <p className="empty-state">{t.tags.manageEmpty}</p>
        ) : (
          <>
            <input
              className="tag-manager-search"
              value={query}
              placeholder={t.tags.search}
              onChange={(e) => setQuery(e.target.value)}
            />

            {visible.length === 0 ? (
              <p className="empty-state">{t.tags.noMatches}</p>
            ) : (
              <ul className="tag-manager-list">
                {visible.map((tag) => (
                  <li key={tag.name} className="tag-manager-row">
                    {renaming === tag.name ? (
                      <input
                        className="tag-manager-input"
                        value={draft}
                        autoFocus
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                      />
                    ) : (
                      <>
                        <span className="tag-manager-name" title={tag.name}>
                          {tag.name}
                        </span>
                        <span className="tag-manager-count">{t.tags.usedBy(tag.count)}</span>
                        <button
                          type="button"
                          className={
                            isActive(tag.name)
                              ? "kg-btn kg-btn--primary kg-btn--sm"
                              : "kg-btn kg-btn--secondary kg-btn--sm"
                          }
                          onClick={() => onToggleFilter(tag.name)}
                        >
                          {isActive(tag.name) ? t.tags.filtering : t.tags.useAsFilter}
                        </button>
                        <button
                          type="button"
                          className="kg-btn kg-btn--ghost kg-btn--sm"
                          onClick={() => startRename(tag.name)}
                        >
                          {t.tags.rename}
                        </button>
                        <button
                          type="button"
                          className="kg-btn kg-btn--danger kg-btn--sm"
                          onClick={() => setDeleting({ name: tag.name, count: tag.count })}
                        >
                          {t.common.delete}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Modal>

      {deleting && (
        <Modal
          title={t.tags.deleteTitle(deleting.name)}
          confirmLabel={t.common.delete}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await deleteTag(deleting.name);
            setDeleting(null);
          }}
        >
          <p className="modal-body">{t.tags.deleteBody(deleting.count)}</p>
        </Modal>
      )}
    </>
  );
}

export default TagManager;
