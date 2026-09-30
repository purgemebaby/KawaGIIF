import { useEffect, useRef, useState } from "react";

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: SortOption<T>[];
  label: string;
  onChange: (value: T) => void;
}

/**
 * Menú de ordenación: un botón con icono que despliega las opciones.
 *
 * Es un menú propio y no un `<select>` porque el nativo no se puede animar ni
 * estilar de forma consistente: en Windows lo dibuja el sistema y se sale por
 * completo de la identidad visual del resto de la app.
 */
function SortMenu<T extends string>({ value, options, label, onChange }: Props<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Mismo patrón de cierre que el popover de etiquetas: Escape y clic fuera,
  // en fase de captura para que el clic que cierra no active además lo que
  // haya debajo.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="sort-menu" ref={rootRef}>
      <button
        type="button"
        className="kg-btn kg-btn--secondary kg-btn--sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        // El nombre de la ordenación activa va en el título, no como texto:
        // así el botón no cambia de ancho al elegir una opción más larga.
        title={`${label}: ${current?.label ?? ""}`}
        aria-label={`${label}: ${current?.label ?? ""}`}
      >
        <span className="sort-menu-icon" aria-hidden="true">
          ⇅
        </span>
      </button>

      {open && (
        <div className="sort-menu-list" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={
                opt.value === value ? "sort-menu-item selected" : "sort-menu-item"
              }
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default SortMenu;
