import { useLayoutEffect, useRef, useState } from 'react';
import type { MediaItem } from '../../lib/media';
import type { Anchor, Animation } from '../../lib/memeboard';
import { useMediaUrl } from '../../hooks/useMediaUrl';
import MemeLayer from './MemeLayer';

interface MemePreviewProps {
	visual: MediaItem | null;
	animation: Animation;
	anchor: Anchor;
	size: number;
	durationMs: number;
}

// The cursor of the preview: a little left of centre, so Cursor and Centre look different.
const PREVIEW_CURSOR: [number, number] = [0.35, 0.4];

/** A small screen that loops the meme with the same animation code as the real stage. */
function MemePreview({
	visual,
	animation,
	anchor,
	size,
	durationMs,
}: MemePreviewProps) {
	const boxRef = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState<[number, number]>([0, 0]);
	const url = useMediaUrl(visual?.id);

	useLayoutEffect(() => {
		const el = boxRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) =>
			setBox([entry.contentRect.width, entry.contentRect.height]),
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div ref={boxRef} className="meme-preview">
			{visual && url && box[0] > 0 && (
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
					loop
				/>
			)}
		</div>
	);
}

export default MemePreview;
