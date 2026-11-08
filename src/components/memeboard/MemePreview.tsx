import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent,
} from 'react';
import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import { isVideoType, type MediaItem } from '../../lib/media';
import { mediaFileUrl, thumbFileUrl } from '../../lib/mediaUrl';
import type { Anchor, Animation, PathPoint } from '../../lib/memeboard';
import { seedOf, sketchStroke } from '../../lib/sketch';
import { useMediaDirs, useMediaFiles } from '../../hooks/useMediaFiles';
import MemeLayer from './MemeLayer';
import type { PartyMedia } from './PartyLayer';

interface MemePreviewProps {
	visual: MediaItem | null;
	animation: Animation;
	anchor: Anchor;
	size: number;
	durationMs: number;
	maxMs: number;
	motionSpeed: number;
	playbackSpeed: number;
	/** Width / height of the meme's monitor, so the preview has its shape. */
	aspect: number;
	/** Set while "Recorded path" is chosen: dragging on the preview draws a new path. */
	onPathDrawn?: (points: PathPoint[]) => void;
	/** Party: the saved memes' visuals its pop-ups show. */
	partyItems?: MediaItem[];
}

// the preview presses a combo meme this often, going up to the blue flames and starting over
const COMBO_PRESS_MS = 650;

// The cursor of the preview: a little left of centre, so Cursor and Centre look different.
const PREVIEW_CURSOR: [number, number] = [0.35, 0.4];

/** A small screen that loops the meme with the same animation code as the stage, and takes a drawn path. */
function MemePreview({
	visual,
	animation,
	anchor,
	size,
	durationMs,
	maxMs,
	motionSpeed,
	playbackSpeed,
	aspect,
	onPathDrawn,
	partyItems = [],
}: MemePreviewProps) {
	const boxRef = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState<[number, number]>([0, 0]);
	const [stroke, setStroke] = useState<PathPoint[] | null>(null);
	const startRef = useRef(0);
	const { url } = useMediaFiles(visual);
	const dirs = useMediaDirs();

	// what the stage gets for a party: the originals, and for videos their poster too
	const partyMedia = useMemo<PartyMedia[]>(
		() =>
			dirs
				? partyItems.map((item) => ({
						url: mediaFileUrl(dirs, item),
						mediaType: item.media_type,
						poster: isVideoType(item.media_type)
							? thumbFileUrl(dirs, item)
							: null,
					}))
				: [],
		[dirs, partyItems],
	);

	// a combo shows its counter by pressing on its own: up one each time, past the last flame tier, then over again
	const comboTop = animation.kind === 'combo' ? 4 * animation.step + 1 : 0;
	const [combo, setCombo] = useState(1);
	useEffect(() => {
		if (!comboTop) return;
		setCombo(1);
		const timer = window.setInterval(
			() => setCombo((c) => (c >= comboTop ? 1 : c + 1)),
			COMBO_PRESS_MS,
		);
		return () => window.clearInterval(timer);
	}, [comboTop]);

	useLayoutEffect(() => {
		const el = boxRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) =>
			setBox([entry.contentRect.width, entry.contentRect.height]),
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const pointOf = (e: PointerEvent): PathPoint => {
		const rect = e.currentTarget.getBoundingClientRect();
		return {
			t: Math.min(maxMs, Math.round(performance.now() - startRef.current)),
			x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
			y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
		};
	};

	const drawing = onPathDrawn !== undefined;
	const onPointerDown = (e: PointerEvent) => {
		if (!drawing || e.button !== 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		startRef.current = performance.now();
		setStroke([pointOf(e)]);
	};
	const onPointerMove = (e: PointerEvent) => {
		if (!stroke) return;
		const point = pointOf(e);
		// past the most a meme lasts the stroke just stops growing
		if (point.t >= maxMs) return;
		setStroke((s) => s && [...s, point]);
	};
	const onPointerUp = () => {
		const drawn = stroke;
		setStroke(null);
		if (!drawn || drawn.length < 2 || !onPathDrawn) return;
		invoke<PathPoint[]>('simplify_meme_path', {
			points: drawn,
			width: box[0],
			height: box[1],
		})
			.then(onPathDrawn)
			.catch(notifyError);
	};

	// the saved path, faint and hand-drawn, under the meme that follows it
	const saved = animation.kind === 'path' ? animation.points : [];
	const savedPaths = useMemo(() => {
		if (saved.length < 2 || box[0] === 0) return null;
		const points = saved.map((p) => [p.x * box[0], p.y * box[1]] as const);
		return sketchStroke(points, { seed: seedOf('meme-path'), roughness: 1.2 });
	}, [saved, box]);
	const live = stroke
		?.map((p) => `${(p.x * box[0]).toFixed(1)},${(p.y * box[1]).toFixed(1)}`)
		.join(' ');

	return (
		<div
			ref={boxRef}
			className={`meme-preview${drawing ? ' is-drawing' : ''}`}
			style={{ aspectRatio: aspect }}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={() => setStroke(null)}
		>
			{(savedPaths || live) && (
				<svg className="meme-preview-trail" aria-hidden="true">
					{savedPaths && !live && (
						<>
							<path className="meme-trail-saved" d={savedPaths[0]} />
							<path
								className="meme-trail-saved meme-trail-saved--second"
								d={savedPaths[1]}
							/>
						</>
					)}
					{live && <polyline className="meme-trail-live" points={live} />}
				</svg>
			)}
			{visual && url && box[0] > 0 && !stroke && (
				<MemeLayer
					// a new visual or length restarts the loop from the beginning
					key={`${visual.id}-${durationMs}`}
					url={url}
					mediaType={visual.media_type}
					naturalW={visual.width ?? null}
					naturalH={visual.height ?? null}
					animation={animation}
					anchor={anchor}
					size={size}
					durationMs={durationMs}
					cursor={PREVIEW_CURSOR}
					stageW={box[0]}
					stageH={box[1]}
					speed={playbackSpeed}
					motionSpeed={motionSpeed}
					party={partyMedia}
					combo={comboTop ? combo : 0}
					loop
				/>
			)}
		</div>
	);
}

export default MemePreview;
