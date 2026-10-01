import { useEffect, type ReactNode } from "react";
import { t } from "../../i18n/en";

interface Props {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
  extraActions?: ReactNode;
}

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
