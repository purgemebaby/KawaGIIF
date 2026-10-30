import { useEffect, useRef } from 'react';
import { isAudioType, isVideoType, type MediaItem } from '../lib/media';
import { useMediaUrl } from '../hooks/useMediaUrl';
import CassetteThumb from './CassetteThumb';
import StillFrame from './StillFrame';

const PREVIEW_STEPS = 8;
const PREVIEW_INTERVAL_MS = 700;

interface MediaThumbProps {
	item: MediaItem;
	/** Goes on the media element itself. The caller owns any wrapper div. */
	className?: string;
	/** Videos scrub through frames while hovered. */
	preview?: boolean;
	/** Cassettes get a play / pause button (they never play on hover). */
	playable?: boolean;
	/** GIFs show only their first frame, to keep long pickers light. */
	still?: boolean;
	/** The loading placeholder shows the media type label. */
	placeholderLabel?: boolean;
	alt?: string;
}

// Renders the media element bare so either caller can shape it: the sidebar
// styles the element through `className`, the grid keeps its own wrapper.
function MediaThumb({
	item,
	className = '',
	preview = false,
	playable = false,
	still = false,
	placeholderLabel = false,
	alt = '',
}: MediaThumbProps) {
	const url = useMediaUrl(item.id);
	const videoRef = useRef<HTMLVideoElement>(null);
	const timerRef = useRef<number | null>(null);

	const startPreview = () => {
		const video = videoRef.current;
		if (!video || !video.duration || timerRef.current) return;

		let step = 1;
		timerRef.current = window.setInterval(() => {
			const v = videoRef.current;
			if (!v || !v.duration) return;
			v.currentTime = (v.duration * step) / (PREVIEW_STEPS + 1);
			step = (step % PREVIEW_STEPS) + 1;
		}, PREVIEW_INTERVAL_MS);
	};

	const stopPreview = () => {
		if (timerRef.current) {
			window.clearInterval(timerRef.current);
			timerRef.current = null;
		}
		const video = videoRef.current;
		if (video) video.currentTime = 0;
	};

	useEffect(() => stopPreview, []);

	if (isAudioType(item.media_type)) {
		return (
			<CassetteThumb
				item={item}
				url={url}
				className={className}
				playable={playable}
			/>
		);
	}

	if (!url) {
		return (
			<div
				className={
					placeholderLabel ? `${className} ${className}-placeholder` : className
				}
			>
				{placeholderLabel ? item.media_type.toUpperCase() : null}
			</div>
		);
	}

	if (isVideoType(item.media_type)) {
		return (
			<video
				ref={videoRef}
				className={className}
				src={url}
				muted
				playsInline
				preload="metadata"
				onMouseEnter={preview ? startPreview : undefined}
				onMouseLeave={preview ? stopPreview : undefined}
			/>
		);
	}

	if (still && item.media_type === 'gif') {
		return <StillFrame url={url} className={className} alt={alt} />;
	}

	return (
		<img
			className={className}
			src={url}
			alt={alt}
			draggable={false}
			decoding="async"
			loading="lazy"
		/>
	);
}

export default MediaThumb;
