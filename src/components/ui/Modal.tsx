import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n/en';
import PixelIcon from './PixelIcon';

// Screens are CSS-contained (trapping `position: fixed`), so modals render into this node, inside the control shell.
export const MODAL_ROOT_ID = 'modal-root';

interface ModalProps {
	title: string;
	children?: ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	onConfirm?: () => void;
	onCancel: () => void;
	extraActions?: ReactNode;
}

function Modal({
	title,
	children,
	confirmLabel,
	cancelLabel = t.common.cancel,
	destructive,
	onConfirm,
	onCancel,
	extraActions,
}: ModalProps) {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onCancel();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [onCancel]);

	return createPortal(
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
					<button
						type="button"
						className="kg-btn kg-btn--secondary"
						onClick={onCancel}
					>
						{cancelLabel}
					</button>
					{confirmLabel && onConfirm && (
						<button
							type="button"
							className={
								destructive
									? 'kg-btn kg-btn--danger pixel-hover'
									: 'kg-btn kg-btn--primary'
							}
							onClick={onConfirm}
						>
							{destructive && <PixelIcon name="trash" />}
							{confirmLabel}
						</button>
					)}
				</div>
			</div>
		</div>,
		document.getElementById(MODAL_ROOT_ID) ?? document.body,
	);
}

export default Modal;
