import { useEffect, useRef, useState } from 'react';
import type { MediaType } from '../../lib/media';
import { isImageType, isVideoType } from '../../lib/media';
import {
	resolveAnimation,
	type Anchor,
	type Animation,
	type Trim,
} from '../../lib/memeboard';
import {
	anchorPoint,
	comboCounterShift,
	poseAt,
	poseStyle,
	visualSize,
} from '../../lib/memeAnimation';
import GifCanvasPlayer from '../GifCanvasPlayer';
import ComboCounter from './ComboCounter';
import PartyLayer, { type PartyMedia } from './PartyLayer';

interface MemeLayerProps {
	url: string;
	mediaType: MediaType;
	naturalW: number | null;
	naturalH: number | null;
	animation: Animation;
	anchor: Anchor;
	size: number;
	durationMs: number;
	/** Where the cursor was when it fired, as a fraction of the stage. */
	cursor: [number, number];
	stageW: number;
	stageH: number;
	/** Starts over at the end instead of calling `onDone` (the editor preview). */
	loop?: boolean;
	/** Playback speed of the GIF or video (1 = as recorded), matching the sound. */
	speed?: number;
	/** The part of a video it plays, looping within it (the sound loops the same part). */
	trim?: Trim | null;
	/** How fast the movement runs, see `PoseContext.motionSpeed`. */
	motionSpeed?: number;
	/** Copies of this meme already on screen: this one is placed a little aside. */
	stack?: number;
	/** Party: what the pop-ups show. */
	party?: PartyMedia[];
	/** Combo: this press's count. */
	combo?: number;
	onDone?: () => void;
}

/**
 * A muted looping video; with a `trim`, it starts at the part's start and jumps back there at its end. Each frame is
 * checked (requestVideoFrameCallback), so it never shows more than a frame past the end.
 */
export function TrimmedVideo({
	url,
	speed,
	trim,
	onNatural,
}: {
	url: string;
	speed: number;
	trim: Trim | null;
	onNatural: (w: number, h: number) => void;
}) {
	const ref = useRef<HTMLVideoElement>(null);
	const start = (trim?.start_ms ?? 0) / 1000;
	const end = trim ? trim.end_ms / 1000 : null;

	useEffect(() => {
		const el = ref.current;
		if (!el || end === null) return;
		let handle = 0;
		const check = (_now: number, frame: VideoFrameCallbackMetadata) => {
			if (frame.mediaTime >= end) el.currentTime = start;
			handle = el.requestVideoFrameCallback(check);
		};
		handle = el.requestVideoFrameCallback(check);
		return () => el.cancelVideoFrameCallback(handle);
	}, [start, end]);

	return (
		<video
			ref={ref}
			src={url}
			autoPlay
			// a cut video loops by hand: a part that runs to the file's end still has to go back to its start
			loop={end === null}
			muted
			playsInline
			onLoadedMetadata={(e) => {
				const el = e.currentTarget;
				el.playbackRate = speed;
				if (start > 0) el.currentTime = start;
				onNatural(el.videoWidth, el.videoHeight);
			}}
			onEnded={(e) => {
				e.currentTarget.currentTime = start;
				void e.currentTarget.play();
			}}
		/>
	);
}

/** One meme's visual, moved every frame by `poseAt`. Videos are muted: their sound comes from the audio thread. */
function MemeLayer({
	url,
	mediaType,
	naturalW,
	naturalH,
	animation,
	anchor,
	size,
	durationMs,
	cursor,
	stageW,
	stageH,
	loop = false,
	speed = 1,
	trim = null,
	motionSpeed = 1,
	stack = 0,
	party = [],
	combo = 0,
	onDone,
}: MemeLayerProps) {
	const ref = useRef<HTMLDivElement>(null);
	// items imported before their size was read report it once loaded
	const [natural, setNatural] = useState<[number | null, number | null]>([
		naturalW,
		naturalH,
	]);
	const [seed] = useState(Math.random);
	const onDoneRef = useRef(onDone);
	onDoneRef.current = onDone;

	const [w, h] = visualSize(size, natural[0], natural[1], stageW, stageH);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const [cx, cy] = anchorPoint(anchor, cursor, stageW, stageH, seed, stack);
		const ctx = {
			stageW,
			stageH,
			w,
			h,
			cx,
			cy,
			duration: durationMs,
			motionSpeed,
			combo,
		};
		let start = performance.now();
		let frame = 0;
		// a random side or position is picked for each loop
		let current = resolveAnimation(animation);
		const tick = (now: number) => {
			let t = now - start;
			if (t >= durationMs) {
				if (!loop) {
					onDoneRef.current?.();
					return;
				}
				start = now;
				t = 0;
				current = resolveAnimation(animation);
			}
			const style = poseStyle(poseAt(current, t, ctx));
			el.style.transform = style.transform;
			el.style.opacity = style.opacity;
			el.style.filter = style.filter;
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [
		animation,
		anchor,
		cursor,
		durationMs,
		h,
		loop,
		motionSpeed,
		seed,
		stack,
		// a new count restarts the meme's clock: the press plays again
		combo,
		stageH,
		stageW,
		w,
	]);

	const onNatural = (nw: number, nh: number) => {
		if (natural[0] === null || natural[1] === null) setNatural([nw, nh]);
	};

	if (animation.kind === 'party') {
		return (
			<PartyLayer
				media={party}
				count={animation.count}
				durationMs={durationMs}
				stageW={stageW}
				stageH={stageH}
				loop={loop}
				onDone={onDone}
			/>
		);
	}

	// one pixel-art cell: about a twentieth of the meme, never too fine or too coarse
	const cell = Math.round(Math.min(10, Math.max(3, Math.min(w, h) / 20)));

	return (
		<div
			ref={ref}
			className="meme-layer"
			style={{ width: w, height: h, opacity: 0 }}
		>
			{animation.kind === 'combo' && (
				<ComboCounter
					// a new count restarts its punch and lets the flames die down from full again
					key={combo}
					combo={combo}
					step={animation.step}
					windowMs={animation.window_ms}
					side={animation.corner.endsWith('right') ? 'left' : 'right'}
					unit={cell}
					shift={comboCounterShift(animation, w, h, stageW, stageH, cell)}
				/>
			)}
			{isVideoType(mediaType) && (
				<TrimmedVideo
					url={url}
					speed={speed}
					trim={trim}
					onNatural={onNatural}
				/>
			)}
			{mediaType === 'gif' && (
				<GifCanvasPlayer
					src={url}
					speedMultiplier={speed}
					className="meme-layer-media"
					onNaturalSize={onNatural}
				/>
			)}
			{isImageType(mediaType) && (
				<img
					src={url}
					alt=""
					draggable={false}
					onLoad={(e) =>
						onNatural(
							e.currentTarget.naturalWidth,
							e.currentTarget.naturalHeight,
						)
					}
				/>
			)}
		</div>
	);
}

export default MemeLayer;
