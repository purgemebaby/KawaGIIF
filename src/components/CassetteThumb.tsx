import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { claimPreview, releasePreview } from '../lib/audioPreview';
import { formatDuration, type MediaItem } from '../lib/media';
import SketchIcon from './ui/SketchIcon';
import './CassetteThumb.css';

const PREVIEW_VOLUME = 0.5;

interface CassetteThumbProps {
	item: MediaItem;
	url: string | null;
	className?: string;
	/** Shows a play / pause button. Hovering never plays. */
	playable?: boolean;
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
	playable = false,
}: CassetteThumbProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const [playing, setPlaying] = useState(false);

	const pause = () => {
		const audio = audioRef.current;
		if (audio) {
			audio.pause();
			releasePreview(audio);
		}
		setPlaying(false);
	};

	const toggle = (e: React.MouseEvent) => {
		// the cassette sits inside a selectable card or tile
		e.stopPropagation();
		e.preventDefault();
		const audio = audioRef.current;
		if (!audio) return;
		if (playing) {
			pause();
			return;
		}
		claimPreview(audio, () => setPlaying(false));
		audio.volume = PREVIEW_VOLUME;
		audio
			.play()
			.then(() => setPlaying(true))
			.catch(() => setPlaying(false));
	};

	// leaving the card (or the tile losing its selection) stops the sound
	useEffect(() => {
		if (!playable) pause();
	}, [playable]);
	useEffect(() => pause, []);

	return (
		<div className={`cassette${playing ? ' is-playing' : ''} ${className}`}>
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
			{playable && url && (
				<button
					type="button"
					className="cassette-play"
					aria-label={playing ? t.storage.pause : t.storage.play}
					title={playing ? t.storage.pause : t.storage.play}
					onClick={toggle}
				>
					{/* both drawn, so the old key pops out while the new one pops in */}
					<SketchIcon
						name="play"
						size={24}
						className={`cassette-key${playing ? '' : ' is-shown'}`}
					/>
					<SketchIcon
						name="pause"
						size={24}
						className={`cassette-key${playing ? ' is-shown' : ''}`}
					/>
				</button>
			)}
			{url && <audio ref={audioRef} src={url} preload="none" onEnded={pause} />}
		</div>
	);
}

export default CassetteThumb;
