import type { MediaType } from "../context/LibraryProvider";
import { t } from "../i18n/es";
import SortMenu from "./ui/SortMenu";

export type SortMode = "name-asc" | "name-desc" | "date-new" | "date-old";

export interface MediaFilters {
  type: MediaType | "all";
  query: string;
  sort: SortMode;
  /** Etiquetas seleccionadas. Se combinan por intersección. */
  tags: string[];
}

export const DEFAULT_FILTERS: MediaFilters = {
  type: "all",
  query: "",
  sort: "date-new",
  tags: [],
};

interface MediaFilterBarProps {
  filters: MediaFilters;
  onChange: (filters: MediaFilters) => void;
  onOpenTags: () => void;
}

const TYPE_OPTIONS: { value: MediaFilters["type"]; label: string }[] = [
  { value: "all", label: t.storage.types.all },
  { value: "gif", label: t.storage.types.gif },
  { value: "mp4", label: t.storage.types.mp4 },
  { value: "jpeg", label: t.storage.types.jpeg },
  { value: "png", label: t.storage.types.png },
  { value: "webp", label: t.storage.types.webp },
];

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "date-new", label: t.storage.sort.dateNew },
  { value: "date-old", label: t.storage.sort.dateOld },
  { value: "name-asc", label: t.storage.sort.nameAsc },
  { value: "name-desc", label: t.storage.sort.nameDesc },
];

function MediaFilterBar({ filters, onChange, onOpenTags }: MediaFilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-row">
        <div className="filter-types">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={filters.type === opt.value ? "filter-type active" : "filter-type"}
              aria-pressed={filters.type === opt.value}
              onClick={() => onChange({ ...filters, type: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <input
          className="filter-search"
          placeholder={t.storage.search}
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
        />

        <SortMenu
          value={filters.sort}
          options={SORT_OPTIONS}
          label={t.storage.sort.label}
          onChange={(sort) => onChange({ ...filters, sort })}
        />

        <button type="button" className="kg-btn kg-btn--secondary kg-btn--sm" onClick={onOpenTags}>
          {t.tags.label}
          {filters.tags.length > 0 && (
            <span className="filter-tag-count">{filters.tags.length}</span>
          )}
        </button>
      </div>

      {/*
        Solo se listan las etiquetas ACTIVAS, no todas las que existen. Antes
        se pintaban todas aquí y con una biblioteca grande la fila se comía la
        pantalla; el catálogo completo vive ahora en el cuadro de Etiquetas.
        Estas siguen visibles para no perder de vista por qué está filtrada la
        lista, y se quitan con un clic.
      */}
      {filters.tags.length > 0 && (
        <div className="active-filters">
          {filters.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="kg-pill active"
              title={t.tags.removeFilter(tag)}
              onClick={() =>
                onChange({ ...filters, tags: filters.tags.filter((x) => x !== tag) })
              }
            >
              {tag}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          <button
            type="button"
            className="kg-btn kg-btn--ghost kg-btn--sm"
            onClick={() => onChange({ ...filters, tags: [] })}
          >
            {t.tags.clearFilters}
          </button>
        </div>
      )}
    </div>
  );
}

export default MediaFilterBar;
