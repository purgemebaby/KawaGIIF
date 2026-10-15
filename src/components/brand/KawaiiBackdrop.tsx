import { useEffect, useMemo, useState } from 'react';
import './KawaiiBackdrop.css';

const FACES: { open: string; wink: string }[] = [
	{ open: '(◕‿◕)', wink: '(◕‿−)' },
	{ open: '(＾▽＾)', wink: '(＾▽−)' },
	{ open: '(・◡・)', wink: '(・◡−)' },
	{ open: '(◔◡◔)', wink: '(◔◡−)' },
	{ open: '(ᵔ◡ᵔ)', wink: '(ᵔ◡−)' },
	{ open: '(≧◡≦)', wink: '(≧◡−)' },
];

// Just past the view-transition duration (--kg-dur-slow, 420ms), so the faces' layers are rasterized after the morph.
const BACKDROP_DELAY_MS = 450;

const ROWS = 5; // per tile; the tile is the size of the tilted window, so this keeps the old density
const COLS = 4;

function pseudoRandom(seed: number): number {
	const x = Math.sin(seed * 127.1) * 43758.5453;
	return x - Math.floor(x);
}

function KawaiiBackdrop() {
	const [facesReady, setFacesReady] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => setFacesReady(true), BACKDROP_DELAY_MS);
		return () => clearTimeout(timer);
	}, []);

	const tile = useMemo(() => {
		const cells: {
			face: string;
			wink: string;
			delay: number;
			duration: number;
		}[] = [];
		for (let i = 0; i < ROWS * COLS; i++) {
			const pick = FACES[Math.floor(pseudoRandom(i) * FACES.length)];
			cells.push({
				face: pick.open,
				wink: pick.wink,
				delay: pseudoRandom(i + 100) * 6,
				duration: 3 + pseudoRandom(i + 200) * 3,
			});
		}
		return cells;
	}, []);

	const renderTile = (copy: number) => (
		<div className="kawaii-tile" key={copy} aria-hidden="true">
			{tile.map((cell, i) => (
				<span
					className="kawaii-face"
					key={i}
					style={{
						animationDelay: `${cell.delay}s`,
						animationDuration: `${cell.duration}s`,
					}}
				>
					<span className="kawaii-face-open">{cell.face}</span>
					<span className="kawaii-face-wink">{cell.wink}</span>
				</span>
			))}
		</div>
	);

	return (
		<div className="kawaii-backdrop" aria-hidden="true">
			{facesReady && (
				<div className="kawaii-rotor">
					<div className="kawaii-drift">
						{renderTile(0)}
						{renderTile(1)}
					</div>
				</div>
			)}
		</div>
	);
}

export default KawaiiBackdrop;
