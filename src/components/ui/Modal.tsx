import { useEffect, type ReactNode } from "react";
import { t } from "../../i18n/es";

interface Props {
  title: string;
  children?: ReactNode;
  /** Texto del botón que confirma. Si se omite, solo se muestra Cancelar. */
  confirmLabel?: string;
  /** Marca el botón de confirmar como destructivo (rojo). */
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
  /** Botones extra a la izquierda de Cancelar (p. ej. "Descartar"). */
  extraActions?: ReactNode;
}

/**
 * El único shell de modal de la app. Antes cada confirmación se dibujaba a
 * mano en su componente, así que ni el foco ni el Escape funcionaban igual en
 * dos sitios.
 */
function Modal({
  title,
  children,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
  extraActions,
}: Props) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="modal-title">{title}</h3>
        {children}
        <div className="modal-actions">
          {extraActions}
          <button type="button" className="kg-btn kg-btn--secondary" onClick={onCancel}>
            {t.common.cancel}
          </button>
          {confirmLabel && onConfirm && (
            <button
              type="button"
              className={destructive ? "kg-btn kg-btn--danger" : "kg-btn kg-btn--primary"}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Modal;
