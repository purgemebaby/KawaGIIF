import { useEffect, useRef, useState } from 'react';
import { isAudioType, isVideoType, type MediaItem } from '../lib/media';
import { useMediaFiles } from '../hooks/useMediaFiles';
import { onPosterReady, requestPoster } from '../lib/videoPoster';
import CassetteThumb from './CassetteThumb';

const PREVIEW_STEPS = 8;
const PREVIEW_INTERVAL_MS = 700;

/** When an animated item moves: only while the pointer is over it, or all the time. */
type ThumbMotion = 'hover' | 'always';

interface MediaThumbProps {
	item: MediaItem;
	/** Goes on the media element itself. The caller owns any wrapper div. */
	className?: string;
	motion?: ThumbMotion;
	/** Cassettes get a play / pause button (they never play on hover). */
	playable?: boolean;
	/** The loading placeholder shows the media type label. */
	placeholderLabel?: boolean;
	alt?: string;
}

// Renders the media element bare so each caller can shape it. Tiles show the small still thumbnail (media_thumbs.rs);
// the original, which may be a full-size animation, only loads while it moves.
function MediaThumb({
	item,
	className = '',
	motion = 'hover',
	playable = false,
	placeholderLabel = false,
	alt = '',
}: MediaThumbProps) {
	const { url, thumb } = useMediaFiles(item);
	const [hovered, setHovered] = useState(false);
	// the thumbnail URL that failed to load (not made yet): that tile shows the original instead
	const [brokenThumb, setBrokenThumb] = useState<string | null>(null);

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

	if (!url || !thumb) {
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
			<VideoThumb
				id={item.id}
				url={url}
				poster={thumb}
				className={className}
				alt={alt}
				motion={motion}
			/>
		);
	}

	const animated = item.media_type === 'gif' || item.media_type === 'webp';
	const moving = animated && (motion === 'always' || hovered);
	const useThumb =
		item.media_type !== 'svg' && !moving && brokenThumb !== thumb;

	return (
		<img
			className={className}
			src={useThumb ? thumb : url}
			alt={alt}
			draggable={false}
			decoding="async"
			loading="lazy"
			onMouseEnter={animated ? () => setHovered(true) : undefined}
			onMouseLeave={animated ? () => setHovered(false) : undefined}
			onError={useThumb ? () => setBrokenThumb(thumb) : undefined}
		/>
	);
}

interface VideoThumbProps {
	id: string;
	url: string;
	poster: string;
	className: string;
	alt: string;
	motion: ThumbMotion;
}

/** A video tile: its poster at rest. A <video> only exists while it plays (hover, or `always`), so a grid of videos
 holds no decoders. Without a poster yet, the video shows its first frame while one is drawn. */
function VideoThumb({
	id,
	url,
	poster,
	className,
	alt,
	motion,
}: VideoThumbProps) {
	const [hovered, setHovered] = useState(false);
	const [posterMissing, setPosterMissing] = useState(false);
	// remounts the poster <img> once it is saved, so it loads again
	const [posterVersion, setPosterVersion] = useState(0);
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(
		() =>
			onPosterReady(id, () => {
				setPosterMissing(false);
				setPosterVersion((v) => v + 1);
			}),
		[id],
	);

	const playing = motion === 'always' || hovered;

	// scrubs through a few frames while hovered: lighter than playing, and enough to tell clips apart
	useEffect(() => {
		if (!playing || motion === 'always') return;
		let step = 1;
		const timer = window.setInterval(() => {
			const video = videoRef.current;
			if (!video?.duration) return;
			video.currentTime = (video.duration * step) / (PREVIEW_STEPS + 1);
			step = (step % PREVIEW_STEPS) + 1;
		}, PREVIEW_INTERVAL_MS);
		return () => window.clearInterval(timer);
	}, [playing, motion]);

	if (playing || posterMissing) {
		return (
			<video
				ref={videoRef}
				className={className}
				src={url}
				poster={posterMissing ? undefined : poster}
				muted
				playsInline
				loop={motion === 'always'}
				autoPlay={motion === 'always'}
				preload="metadata"
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
			/>
		);
	}

	return (
		<img
			key={posterVersion}
			className={className}
			src={poster}
			alt={alt}
			draggable={false}
			decoding="async"
			loading="lazy"
			onMouseEnter={() => setHovered(true)}
			onError={() => {
				setPosterMissing(true);
				requestPoster(id, url);
			}}
		/>
	);
}

export default MediaThumb;
