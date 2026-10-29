import { useEffect, useRef, useState } from 'react';
import { formatDuration, type MediaItem } from '../lib/media';
import './CassetteThumb.css';

const PREVIEW_VOLUME = 0.5;

interface CassetteThumbProps {
	item: MediaItem;
	url: string | null;
	className?: string;
	/** Plays the sound while hovered, spinning the reels. */
	preview?: boolean;
}

/** One reel: hub, six teeth and the tape wound round it. */
function Reel({ cx }: { cx: number }) {
	return (
		<g className="cassette-reel" style={{ transformOrigin: `${cx}px 46px` }}>
			<circle className="cassette-tape" cx={cx} cy={46} r={11} />
			<circle className="cassette-hub" cx={cx} cy={46} r={6} />
			{[0, 60, 120, 180, 240, 300].map((deg) => (
				<line
					key={deg}
					className="cassette-tooth"
					x1={cx}
					y1={41}
					x2={cx}
					y2={43}
					transform={`rotate(${deg} ${cx} 46)`}
				/>
			))}
		</g>
	);
}

// Audio items have no picture: they show as a cassette with their name on the label.
function CassetteThumb({
	item,
	url,
	className = '',
	preview = false,
}: CassetteThumbProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const [playing, setPlaying] = useState(false);

	const start = () => {
		const audio = audioRef.current;
		if (!audio) return;
		audio.volume = PREVIEW_VOLUME;
		audio.currentTime = 0;
		audio
			.play()
			.then(() => setPlaying(true))
			.catch(() => setPlaying(false));
	};

	const stop = () => {
		audioRef.current?.pause();
		setPlaying(false);
	};

	useEffect(() => stop, []);

	return (
		<div
			className={`cassette${playing ? ' is-playing' : ''} ${className}`}
			onMouseEnter={preview && url ? start : undefined}
			onMouseLeave={preview && url ? stop : undefined}
		>
			<svg viewBox="0 0 120 80" className="cassette-svg" aria-hidden="true">
				<rect
					className="cassette-shell"
					x={4}
					y={6}
					width={112}
					height={68}
					rx={6}
				/>
				<rect
					className="cassette-label"
					x={12}
					y={12}
					width={96}
					height={18}
					rx={2}
				/>
				<foreignObject x={16} y={13} width={88} height={16}>
					<span className="cassette-name">{item.original_file_name}</span>
				</foreignObject>
				<rect
					className="cassette-window"
					x={30}
					y={36}
					width={60}
					height={20}
					rx={9}
				/>
				<Reel cx={42} />
				<Reel cx={78} />
				<path className="cassette-foot" d="M24 74 L32 62 H88 L96 74" />
			</svg>
			{item.duration_ms !== undefined && (
				<span className="cassette-duration">
					{formatDuration(item.duration_ms)}
				</span>
			)}
			{url && <audio ref={audioRef} src={url} preload="none" onEnded={stop} />}
		</div>
	);
}

export default CassetteThumb;
