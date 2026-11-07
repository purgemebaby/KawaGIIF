import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
} from 'react';
import { isVideoType, type MediaType } from '../../lib/media';
import './MemeLayers.css';

/** One media a party pop-up can show. A video also brings its poster, for the pop-ups that can't play it. */
export interface PartyMedia {
	url: string;
	mediaType: MediaType;
	poster?: string | null;
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
// How many pop-ups play their video at once: each one is a decoder of its own. Must match memeboard.rs.
const MAX_PLAYING_VIDEOS = 12;

interface Spot {
	/** What it shows: the media, or a video's poster. */
	url: string;
	video: boolean;
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
	let playing = 0;
	const spots: Spot[] = [];
	for (let i = 0; i < count; i++) {
		const picked = media[i % media.length];
		let url = picked.url;
		let video = false;
		if (isVideoType(picked.mediaType)) {
			if (playing < MAX_PLAYING_VIDEOS) {
				playing++;
				video = true;
			} else if (picked.poster) {
				url = picked.poster;
			} else {
				continue; // nothing cheap to show of it
			}
		}
		const size = short * (MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE));
		spots.push({
			url,
			video,
			x: Math.random() * Math.max(0, stageW - size),
			y: Math.random() * Math.max(0, stageH - size),
			size,
			tilt: (Math.random() * 2 - 1) * MAX_TILT_DEG,
			delay: Math.random() * ARRIVAL_SHARE * durationMs,
		});
	}
	return spots;
}

/** A pop-up that plays its video from the moment it pops in, not from when the party starts. */
function PartyVideo({
	src,
	delay,
	style,
}: {
	src: string;
	delay: number;
	style: CSSProperties;
}) {
	const ref = useRef<HTMLVideoElement>(null);
	useEffect(() => {
		const timer = window.setTimeout(() => {
			ref.current?.play().catch(() => {});
		}, delay);
		return () => window.clearTimeout(timer);
	}, [delay]);
	return (
		<video
			ref={ref}
			className="party-pop"
			src={src}
			muted
			loop
			playsInline
			preload="auto"
			style={style}
		/>
	);
}

/**
 * The Party animation: lots of tiny pop-ups of the saved memes' media all over the screen. Images are plain <img>s,
 * so every pop-up of the same GIF shares one decode in the webview however many there are. Videos play, up to
 * MAX_PLAYING_VIDEOS at once; any further ones show their poster.
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
			{spots.map((spot, i) => {
				const style = {
					left: spot.x,
					top: spot.y,
					width: spot.size,
					height: spot.size,
					'--tilt': `${spot.tilt.toFixed(1)}deg`,
					'--life': `${Math.max(1, durationMs - spot.delay)}ms`,
					animationDelay: `${spot.delay}ms`,
				} as CSSProperties;
				return spot.video ? (
					<PartyVideo key={i} src={spot.url} delay={spot.delay} style={style} />
				) : (
					<img
						key={i}
						className="party-pop"
						src={spot.url}
						alt=""
						draggable={false}
						decoding="async"
						style={style}
					/>
				);
			})}
		</div>
	);
}

export default PartyLayer;
