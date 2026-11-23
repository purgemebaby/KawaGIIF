import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import type { MediaItem } from '../../lib/media';
import { MIN_TRIM_MS, type Trim } from '../../lib/memeboard';
import { useMediaFiles } from '../../hooks/useMediaFiles';
import { useEscape } from '../../hooks/useDismiss';
import ResetButton from '../ui/ResetButton';
import SketchIcon from '../ui/SketchIcon';

interface VideoTrimmerProps {
	video: MediaItem;
	trim: Trim | null;
	/** null when the whole video is chosen again. */
	onChange: (trim: Trim | null) => void;
}

type Grip = 'start' | 'end' | 'window';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
// the end handle shows the last frame of the part, a hair before its end
const LAST_FRAME_MS = 30;

/**
 * Draws frames of `url` side by side on `canvas`, one seek at a time on a video of its own that is let go once done.
 * Returns the cancel.
 */
function drawFilmstrip(
	url: string,
	canvas: HTMLCanvasElement,
	onDuration: (ms: number) => void,
): () => void {
	const ctx = canvas.getContext('2d');
	const video = document.createElement('video');
	let cancelled = false;
	const release = () => {
		video.removeAttribute('src');
		video.load();
	};
	if (!ctx) return () => {};
	video.muted = true;
	video.preload = 'auto';
	video.src = url;
	video.addEventListener(
		'loadedmetadata',
		async () => {
			const duration = video.duration;
			if (!Number.isFinite(duration) || duration <= 0) return release();
			onDuration(Math.round(duration * 1000));
			const slotH = canvas.height;
			// frames about as wide as they are tall make a strip that reads at a glance
			const count = Math.max(4, Math.round(canvas.width / (slotH * 1.3)));
			const slotW = canvas.width / count;
			for (let i = 0; i < count && !cancelled; i++) {
				video.currentTime = ((i + 0.5) / count) * duration;
				await new Promise((done) =>
					video.addEventListener('seeked', done, { once: true }),
				);
				if (cancelled) break;
				// cover: crop the frame to the slot's shape
				const scale = Math.max(
					slotW / video.videoWidth,
					slotH / video.videoHeight,
				);
				const w = video.videoWidth * scale;
				const h = video.videoHeight * scale;
				ctx.save();
				ctx.beginPath();
				ctx.rect(i * slotW, 0, slotW, slotH);
				ctx.clip();
				ctx.drawImage(
					video,
					i * slotW + (slotW - w) / 2,
					(slotH - h) / 2,
					w,
					h,
				);
				ctx.restore();
			}
			release();
		},
		{ once: true },
	);
	return () => {
		cancelled = true;
		release();
	};
}

/**
 * A video editor's cut: a viewer that shows the frame under the end being dragged and plays the chosen part with its
 * sound, over a strip of the video's frames with a window whose two ends choose the part. It can open bigger.
 */
function VideoTrimmer({ video, trim, onChange }: VideoTrimmerProps) {
	const text = t.memeboard.trim;
	const { url } = useMediaFiles(video);
	const trackRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const viewerRef = useRef<HTMLVideoElement>(null);
	const [width, setWidth] = useState(0);
	const [durationMs, setDurationMs] = useState(video.duration_ms ?? 0);
	const [playhead, setPlayhead] = useState(trim?.start_ms ?? 0);
	const [playing, setPlaying] = useState(false);
	const [big, setBig] = useState(false);
	const drag = useRef<{ grip: Grip; fromMs: number; trim: Trim } | null>(null);
	// first, so Escape shrinks the big view and leaves the editor open
	useEscape(big, () => setBig(false), true);

	const start = trim?.start_ms ?? 0;
	const end = Math.min(trim?.end_ms ?? durationMs, durationMs || Infinity);

	// the track is a new element when the view grows or shrinks: measure that one
	useLayoutEffect(() => {
		const el = trackRef.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) =>
			// in steps, so a resize redraws the frames once instead of on every pixel
			setWidth(Math.round(entry.contentRect.width / 40) * 40),
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [big]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const track = trackRef.current;
		if (!canvas || !track || !url || width === 0) return;
		const ratio = window.devicePixelRatio || 1;
		canvas.width = Math.round(track.clientWidth * ratio);
		canvas.height = Math.round(track.clientHeight * ratio);
		return drawFilmstrip(url, canvas, setDurationMs);
	}, [url, width, big]);

	// while it plays, the playhead follows each frame and the part's end stops it
	useEffect(() => {
		const el = viewerRef.current;
		if (!el || !playing) return;
		let handle = 0;
		const follow = (_now: number, frame: VideoFrameCallbackMetadata) => {
			const ms = frame.mediaTime * 1000;
			if (ms >= end) {
				el.pause();
				setPlayhead(end);
				return;
			}
			setPlayhead(ms);
			handle = el.requestVideoFrameCallback(follow);
		};
		handle = el.requestVideoFrameCallback(follow);
		return () => el.cancelVideoFrameCallback(handle);
	}, [playing, end, big]);

	const seek = (ms: number) => {
		const el = viewerRef.current;
		el?.pause();
		setPlayhead(ms);
		if (el) el.currentTime = ms / 1000;
	};

	const togglePlay = () => {
		const el = viewerRef.current;
		if (!el) return;
		if (!el.paused) return el.pause();
		// from where the playhead is inside the part, from its start otherwise
		const from = playhead >= start && playhead < end - 50 ? playhead : start;
		el.currentTime = from / 1000;
		setPlayhead(from);
		void el.play();
	};

	const share = (ms: number) =>
		durationMs > 0 ? `${(ms / durationMs) * 100}%` : '0%';

	// whole video again: no cut is stored
	const commit = (next: Trim) =>
		onChange(next.start_ms <= 0 && next.end_ms >= durationMs ? null : next);

	const msAt = (clientX: number) => {
		const rect = trackRef.current!.getBoundingClientRect();
		const at = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		return Math.round(at * durationMs);
	};

	const moved = (grip: Grip, from: Trim, deltaMs: number): Trim => {
		if (grip === 'start') {
			return {
				...from,
				start_ms: Math.min(
					Math.max(0, from.start_ms + deltaMs),
					from.end_ms - MIN_TRIM_MS,
				),
			};
		}
		if (grip === 'end') {
			return {
				...from,
				end_ms: Math.max(
					Math.min(durationMs, from.end_ms + deltaMs),
					from.start_ms + MIN_TRIM_MS,
				),
			};
		}
		// the whole window slides, keeping its length
		const length = from.end_ms - from.start_ms;
		const startMs = Math.min(
			Math.max(0, from.start_ms + deltaMs),
			durationMs - length,
		);
		return { start_ms: startMs, end_ms: startMs + length };
	};

	// the viewer shows the frame the dragged end sits on
	const show = (grip: Grip, next: Trim) =>
		seek(
			grip === 'end'
				? Math.max(next.start_ms, next.end_ms - LAST_FRAME_MS)
				: next.start_ms,
		);

	const onPointerDown = (grip: Grip) => (e: PointerEvent) => {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		const from = { start_ms: start, end_ms: end };
		drag.current = { grip, fromMs: msAt(e.clientX), trim: from };
		show(grip, from);
	};
	const onPointerMove = (e: PointerEvent) => {
		const current = drag.current;
		if (!current) return;
		const next = moved(
			current.grip,
			current.trim,
			msAt(e.clientX) - current.fromMs,
		);
		commit(next);
		show(current.grip, next);
	};
	const onPointerUp = () => {
		drag.current = null;
	};
	// the arrows nudge an end by a tenth of a second, a whole second with Shift
	const onKeyDown = (grip: 'start' | 'end') => (e: KeyboardEvent) => {
		const step = e.shiftKey ? 1000 : 100;
		const delta =
			e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
		if (!delta) return;
		e.preventDefault();
		const next = moved(grip, { start_ms: start, end_ms: end }, delta);
		commit(next);
		show(grip, next);
	};

	const handle = (grip: 'start' | 'end') => (
		<button
			type="button"
			role="slider"
			className={`trim-handle trim-handle--${grip}`}
			style={{ left: share(grip === 'start' ? start : end) }}
			aria-label={grip === 'start' ? text.start : text.end}
			aria-valuemin={0}
			aria-valuemax={durationMs}
			aria-valuenow={grip === 'start' ? start : end}
			aria-valuetext={seconds(grip === 'start' ? start : end)}
			onPointerDown={onPointerDown(grip)}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			onKeyDown={onKeyDown(grip)}
		/>
	);

	const ready = durationMs > 0;
	const body = (
		<div className={`video-trimmer${big ? ' is-big' : ''}`}>
			<div className="trim-viewer">
				{url && (
					<video
						ref={viewerRef}
						src={url}
						preload="auto"
						playsInline
						onLoadedMetadata={(e) => {
							e.currentTarget.currentTime = playhead / 1000;
						}}
						onPlay={() => setPlaying(true)}
						onPause={() => setPlaying(false)}
						onClick={togglePlay}
					/>
				)}
				<div className="trim-viewer-bar">
					<button
						type="button"
						className="trim-play"
						onClick={togglePlay}
						aria-label={playing ? text.pause : text.play}
						title={playing ? text.pause : text.play}
					>
						<SketchIcon name={playing ? 'pause' : 'play'} />
					</button>
					<span className="trim-time">{seconds(playhead)}</span>
					<button
						type="button"
						className="trim-play"
						onClick={() => setBig((b) => !b)}
						aria-label={big ? text.smaller : text.bigger}
						title={big ? text.smaller : text.bigger}
					>
						<SketchIcon name="expand" />
					</button>
				</div>
			</div>
			<div
				ref={trackRef}
				className="trim-track"
				// a click on the strip outside the part shows that moment in the viewer
				onPointerDown={(e) => ready && e.button === 0 && seek(msAt(e.clientX))}
			>
				<canvas ref={canvasRef} className="trim-frames" aria-hidden="true" />
				{ready && (
					<>
						<span
							className="trim-dim"
							style={{ left: 0, width: share(start) }}
							aria-hidden="true"
						/>
						<span
							className="trim-dim"
							style={{ left: share(end), right: 0 }}
							aria-hidden="true"
						/>
						<span
							className="trim-window"
							style={{ left: share(start), width: share(end - start) }}
							onPointerDown={onPointerDown('window')}
							onPointerMove={onPointerMove}
							onPointerUp={onPointerUp}
							onPointerCancel={onPointerUp}
							aria-hidden="true"
						/>
						<span
							className="trim-playhead"
							style={{ left: share(playhead) }}
							aria-hidden="true"
						/>
						{handle('start')}
						{handle('end')}
					</>
				)}
			</div>
			{ready && (
				<div className="trim-info">
					<span>
						{text.range(seconds(start), seconds(end))}
						<strong>{seconds(end - start)}</strong>
					</span>
					{trim && (
						<ResetButton label={text.whole} onReset={() => onChange(null)} />
					)}
				</div>
			)}
		</div>
	);

	return big
		? createPortal(
				<div className="trim-big-backdrop" onClick={() => setBig(false)}>
					<div onClick={(e) => e.stopPropagation()}>{body}</div>
				</div>,
				document.body,
			)
		: body;
}

export default VideoTrimmer;
