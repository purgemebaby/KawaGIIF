import { t } from "../../i18n/es";

const MAX_VISIBLE = 3;

/**
 * Chips de SOLO LECTURA para la tarjeta de la rejilla.
 *
 * Antes cada tarjeta llevaba un campo de texto editable permanentemente
 * visible, lo que saturaba la biblioteca entera. Aquí solo se muestran, y
 * editar es un gesto aparte (el popover): ver y editar son cosas distintas y
 * la rejilla se usa sobre todo para ver.
 */
function TagChips({ tags, onEdit }: { tags: string[]; onEdit: () => void }) {
  const visible = tags.slice(0, MAX_VISIBLE);
  const hidden = tags.length - visible.length;

  return (
    <button
      type="button"
      className="tag-chips"
      onClick={onEdit}
      title={tags.length > 0 ? tags.join(", ") : t.tags.edit}
      aria-label={t.tags.edit}
    >
      {tags.length === 0 && <span className="tag-chips-empty">{t.tags.none}</span>}
      {visible.map((tag) => (
        <span key={tag} className="tag-chip">
          {tag}
        </span>
      ))}
      {hidden > 0 && <span className="tag-chip tag-chip-more">{t.tags.more(hidden)}</span>}
    </button>
  );
}

export default TagChips;
