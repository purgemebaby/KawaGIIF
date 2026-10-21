import {
	PIXEL_ICONS,
	PIXEL_PALETTE,
	type PixelIconName,
} from '../../lib/pixelIcons';
import './PixelIcon.css';

interface Run {
	x: number;
	y: number;
	width: number;
	fill: string;
}

const runCache = new Map<string, Run[]>();

/** One rect per horizontal run of same-coloured pixels instead of one per pixel. */
function runsOf(key: string, rows: readonly string[]): Run[] {
	const cached = runCache.get(key);
	if (cached) return cached;
	const runs: Run[] = [];
	rows.forEach((row, y) => {
		let x = 0;
		while (x < row.length) {
			const letter = row[x];
			let end = x + 1;
			while (end < row.length && row[end] === letter) end++;
			if (letter !== '.')
				runs.push({ x, y, width: end - x, fill: PIXEL_PALETTE[letter] });
			x = end;
		}
	});
	runCache.set(key, runs);
	return runs;
}

interface PixelIconProps {
	name: PixelIconName;
	size?: number;
	/** Position when nested inside another SVG. */
	x?: number;
	y?: number;
	className?: string;
}

// Animations are driven from an ancestor with the `pixel-hover` class (see PixelIcon.css).
function PixelIcon({ name, size = 16, x, y, className }: PixelIconProps) {
	const layers: Record<string, readonly string[]> = PIXEL_ICONS[name];
	return (
		<svg
			className={
				className
					? `pixel-icon pixel-icon--${name} ${className}`
					: `pixel-icon pixel-icon--${name}`
			}
			width={size}
			height={size}
			x={x}
			y={y}
			viewBox="0 0 16 16"
			shapeRendering="crispEdges"
			aria-hidden="true"
		>
			<g className="pixel-icon-body">
				{Object.entries(layers).map(([layer, rows]) => (
					<g key={layer} className={`pixel-layer pixel-layer--${layer}`}>
						{runsOf(`${name}.${layer}`, rows).map((run) => (
							<rect
								key={`${run.x}.${run.y}`}
								x={run.x}
								y={run.y}
								width={run.width}
								height={1}
								fill={run.fill}
							/>
						))}
					</g>
				))}
			</g>
		</svg>
	);
}

export default PixelIcon;
