import { useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import { isVideoType, type MediaItem } from '../../lib/media';
import { visualSize } from '../../lib/memeAnimation';
import { useMediaFiles } from '../../hooks/useMediaFiles';
import { useEscape } from '../../hooks/useDismiss';

interface SpotPickerProps {
	visual: MediaItem | null;
	/** The meme's size (longer side as a share of the monitor's shorter one). */
	size: number;
	/** The meme's monitor, in px. */
	screen: { width: number; height: number };
	/** Where it is now, as a share of the monitor. */
	spot: { x: number; y: number };
	onPick: (spot: { x: number; y: number }) => void;
	onClose: () => void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The preview blown up to most of the window, in the monitor's shape: a click or a drag puts the meme's centre there,
 * drawn at its real size. Done keeps it, Cancel or Escape puts the old spot back.
 */
function SpotPicker({
	visual,
	size,
	screen,
	spot,
	onPick,
	onClose,
}: SpotPickerProps) {
	const text = t.memeboard.spot;
	const [point, setPoint] = useState(spot);
	const [box, setBox] = useState<[number, number]>([0, 0]);
	const boxRef = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);
	const { url, thumb } = useMediaFiles(visual);
	// first, so the editor under it doesn't close too
	useEscape(true, onClose, true);

	useLayoutEffect(() => {
		const el = boxRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) =>
			setBox([entry.contentRect.width, entry.contentRect.height]),
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const pointAt = (e: PointerEvent) => {
		const rect = e.currentTarget.getBoundingClientRect();
		setPoint({
			x: clamp01((e.clientX - rect.left) / rect.width),
			y: clamp01((e.clientY - rect.top) / rect.height),
		});
	};

	const [w, h] = visualSize(
		size,
		visual?.width ?? null,
		visual?.height ?? null,
		box[0],
		box[1],
	);
	const px = Math.round(point.x * screen.width);
	const py = Math.round(point.y * screen.height);

	return createPortal(
		<div className="spot-picker-backdrop" onClick={onClose}>
			<div
				className="spot-picker"
				role="dialog"
				aria-modal="true"
				aria-label={text.title}
				onClick={(e) => e.stopPropagation()}
			>
				<header className="spot-picker-head">
					<h3>{text.title}</h3>
				</header>
				<div
					ref={boxRef}
					className="spot-picker-screen"
					style={{
						aspectRatio: screen.width / screen.height,
						// as wide as fits, but never taller than the window leaves room for
						width: `min(100%, calc((100vh - 220px) * ${screen.width / screen.height}))`,
					}}
					onPointerDown={(e) => {
						if (e.button !== 0) return;
						e.currentTarget.setPointerCapture(e.pointerId);
						dragging.current = true;
						pointAt(e);
					}}
					onPointerMove={(e) => dragging.current && pointAt(e)}
					onPointerUp={() => (dragging.current = false)}
					onPointerCancel={() => (dragging.current = false)}
				>
					{box[0] > 0 && (url || thumb) && (
						<div
							className="spot-picker-meme"
							style={{
								width: w,
								height: h,
								left: point.x * box[0] - w / 2,
								top: point.y * box[1] - h / 2,
							}}
						>
							{visual && isVideoType(visual.media_type) ? (
								<img src={thumb ?? ''} alt="" draggable={false} />
							) : (
								<img src={url ?? ''} alt="" draggable={false} />
							)}
						</div>
					)}
					<span
						className="spot-picker-mark"
						style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
						aria-hidden="true"
					/>
				</div>
				<footer className="modal-actions">
					<span className="spot-picker-coords">{text.coords(px, py)}</span>
					<button
						type="button"
						className="kg-btn kg-btn--secondary"
						onClick={onClose}
					>
						{t.common.cancel}
					</button>
					<button
						type="button"
						className="kg-btn kg-btn--primary"
						onClick={() => {
							onPick(point);
							onClose();
						}}
					>
						{text.done}
					</button>
				</footer>
			</div>
		</div>,
		document.body,
	);
}

export default SpotPicker;
