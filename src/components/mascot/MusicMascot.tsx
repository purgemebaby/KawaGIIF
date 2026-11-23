import type { CSSProperties } from 'react';
import musicChibi from '../../assets/mascot/library-music.png';
import './Mascot.css';

type NoteShape = 'eighth' | 'beamed';

interface Note {
	shape: NoteShape;
	/** Which earcup it comes out of. */
	side: 'left' | 'right';
	color: string;
	delay: number;
	/** How far it drifts sideways on its way up, in note widths. */
	drift: number;
	tilt: number;
}

// Where the earcups sit on the picture (fractions of the 518x800 canvas).
const EARCUPS = {
	left: { x: 0.2, y: 0.38 },
	right: { x: 0.9, y: 0.3 },
} as const;

// Three notes per earcup, one after another, so the music never stops.
const NOTES: readonly Note[] = [
	{
		shape: 'eighth',
		side: 'left',
		color: 'var(--kg-px-pink)',
		delay: 0,
		drift: -1.6,
		tilt: -18,
	},
	{
		shape: 'beamed',
		side: 'right',
		color: 'var(--kg-px-sky)',
		delay: 0.4,
		drift: 1.4,
		tilt: 16,
	},
	{
		shape: 'beamed',
		side: 'left',
		color: 'var(--kg-px-sun)',
		delay: 0.8,
		drift: -1.1,
		tilt: -10,
	},
	{
		shape: 'eighth',
		side: 'right',
		color: 'var(--kg-px-purple)',
		delay: 1.2,
		drift: 1.8,
		tilt: 22,
	},
	{
		shape: 'eighth',
		side: 'left',
		color: 'var(--kg-px-sky)',
		delay: 1.6,
		drift: -2,
		tilt: -24,
	},
	{
		shape: 'eighth',
		side: 'right',
		color: 'var(--kg-px-pink)',
		delay: 2,
		drift: 1.1,
		tilt: 12,
	},
];

/** A note drawn like the chibi: flat colour inside a thick ink outline. */
function NoteGlyph({ shape }: { shape: NoteShape }) {
	return (
		<svg viewBox="0 0 24 24" className="music-note-glyph">
			{shape === 'eighth' ? (
				<>
					<path d="M13 4 C17 5.5 19.5 8.5 18 13 C17.5 10.5 15.5 9 13 8.6 Z" />
					<rect x="11.2" y="4" width="2" height="14.5" rx="0.8" />
					<ellipse
						cx="8"
						cy="18"
						rx="4.6"
						ry="3.4"
						transform="rotate(-20 8 18)"
					/>
				</>
			) : (
				<>
					<path d="M8.6 6 L21.4 3.5 L21.4 7.2 L8.6 9.7 Z" />
					<rect x="8.6" y="6" width="1.8" height="13" rx="0.7" />
					<rect x="19.6" y="3.5" width="1.8" height="13" rx="0.7" />
					<ellipse cx="6" cy="19" rx="4" ry="3" transform="rotate(-20 6 19)" />
					<ellipse
						cx="17"
						cy="16.5"
						rx="4"
						ry="3"
						transform="rotate(-20 17 16.5)"
					/>
				</>
			)}
		</svg>
	);
}

/** The Audio tab's chibi: rises from the bottom-right corner up to mid-torso, sways to the music and notes float out of the headphones. */
function MusicMascot() {
	return (
		<div className="music-mascot" aria-hidden="true">
			<div className="music-mascot-dancer">
				<img src={musicChibi} alt="" draggable={false} decoding="async" />
				{NOTES.map((note, i) => {
					const cup = EARCUPS[note.side];
					const style = {
						'--note-x': cup.x,
						'--note-y': cup.y,
						'--note-color': note.color,
						'--note-drift': note.drift,
						'--note-tilt': `${note.tilt}deg`,
						animationDelay: `${note.delay}s`,
					} as CSSProperties;
					return (
						<span key={i} className="music-note" style={style}>
							<NoteGlyph shape={note.shape} />
						</span>
					);
				})}
			</div>
		</div>
	);
}

export default MusicMascot;
