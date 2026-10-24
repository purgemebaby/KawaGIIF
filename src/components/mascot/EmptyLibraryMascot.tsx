import emptyChibi from '../../assets/mascot/empty-library.webp';
import type { Point } from '../../lib/sketch';
import SketchFrame from '../ui/SketchFrame';
import './Mascot.css';

// One seed per puff, so the three of a side each wobble their own way.
const PUFFS = [0, 1, 2] as const;

// A puffy cloud in a 24x24 box: |sin 3t| gives six round bumps with sharp dips between them.
const CLOUD: readonly Point[] = Array.from({ length: 36 }, (_, i): Point => {
	const angle = (i / 36) * Math.PI * 2;
	const radius = 8.5 + 1.8 * Math.abs(Math.sin(3 * angle));
	return [12 + Math.cos(angle) * radius, 12 + Math.sin(angle) * radius];
});

// The lying-down chibi Storage greets an empty library with.
function EmptyLibraryMascot() {
	return (
		<div className="storage-empty-chibi" aria-hidden="true">
			<img
				className="storage-empty-mascot"
				src={emptyChibi}
				alt=""
				draggable={false}
				decoding="async"
			/>
			{(['left', 'right'] as const).map((side) => (
				<span key={side} className={`storage-smoke storage-smoke--${side}`}>
					{PUFFS.map((n) => (
						<i key={n}>
							<SketchFrame
								viewBox="0 0 24 24"
								seed={`smoke-${side}-${n}`}
								points={CLOUD}
								roughness={0.5}
							/>
						</i>
					))}
				</span>
			))}
		</div>
	);
}

export default EmptyLibraryMascot;
