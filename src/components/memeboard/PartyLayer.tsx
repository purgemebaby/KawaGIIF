import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from 'react';
import type { MediaType } from '../../lib/media';
import './MemeLayers.css';

/** One media a party pop-up can show. */
export interface PartyMedia {
	url: string;
	mediaType: MediaType;
}

interface PartyLayerProps {
	/** What the pop-ups show, one per pop-up; repeats are fine. The preview gives fewer and they are cycled. */
	media: PartyMedia[];
	count: number;
	durationMs: number;
	stageW: number;
	stageH: number;
	/** Starts over with new spots instead of calling `onDone` (the editor preview). */
	loop?: boolean;
	onDone?: () => void;
}

// a pop-up's side, as a share of the stage's shorter side
const MIN_SIZE = 0.06;
const MAX_SIZE = 0.1;
const MAX_TILT_DEG = 20;
// the pop-ups come in over this share of the time, then all stay until the end
const ARRIVAL_SHARE = 0.6;

interface Spot {
	media: PartyMedia;
	x: number;
	y: number;
	size: number;
	tilt: number;
	delay: number;
}

/** `count` spots scattered over the stage, each fully on screen, coming in at random times. */
function scatter(
	media: PartyMedia[],
	count: number,
	durationMs: number,
	stageW: number,
	stageH: number,
): Spot[] {
	const short = Math.min(stageW, stageH);
	return Array.from({ length: count }, (_, i) => {
		const size = short * (MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE));
		return {
			media: media[i % media.length],
			x: Math.random() * Math.max(0, stageW - size),
			y: Math.random() * Math.max(0, stageH - size),
			size,
			tilt: (Math.random() * 2 - 1) * MAX_TILT_DEG,
			delay: Math.random() * ARRIVAL_SHARE * durationMs,
		};
	});
}

/**
 * The Party animation: lots of tiny pop-ups of the saved memes' media all over the screen. They are plain <img>s, so
 * every pop-up of the same GIF shares one decode in the webview however many there are; videos come as their poster.
 */
function PartyLayer({
	media,
	count,
	durationMs,
	stageW,
	stageH,
	loop = false,
	onDone,
}: PartyLayerProps) {
	const [round, setRound] = useState(0);
	const onDoneRef = useRef(onDone);
	onDoneRef.current = onDone;

	const spots = useMemo(
		() =>
			media.length > 0 ? scatter(media, count, durationMs, stageW, stageH) : [],
		// a new round scatters them again
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[media, count, durationMs, stageW, stageH, round],
	);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			if (loop) setRound((r) => r + 1);
			else onDoneRef.current?.();
		}, durationMs);
		return () => window.clearTimeout(timer);
	}, [durationMs, loop, round]);

	return (
		<div className="party-layer" key={round}>
			{spots.map((spot, i) => (
				<img
					key={i}
					className="party-pop"
					src={spot.media.url}
					alt=""
					draggable={false}
					decoding="async"
					style={
						{
							left: spot.x,
							top: spot.y,
							width: spot.size,
							height: spot.size,
							'--tilt': `${spot.tilt.toFixed(1)}deg`,
							'--life': `${Math.max(1, durationMs - spot.delay)}ms`,
							animationDelay: `${spot.delay}ms`,
						} as CSSProperties
					}
				/>
			))}
		</div>
	);
}

export default PartyLayer;
