import { Fragment } from 'react';
import { seedOf, sketchEllipse, sketchStroke } from '../../lib/sketch';
import {
	SKETCH_ICONS,
	type SketchIconName,
	type SketchShape,
} from '../../lib/sketchIcons';
import './SketchIcon.css';

interface ShapePath {
	first: string;
	second: string;
	fill?: string;
}

interface LayerPaths {
	layer: string;
	shapes: readonly ShapePath[];
}

const pathCache = new Map<string, LayerPaths[]>();

/** The wobbly strokes of every shape in every layer, computed once per icon. */
function pathsOf(name: SketchIconName): LayerPaths[] {
	const cached = pathCache.get(name);
	if (cached) return cached;
	const layers: Record<string, readonly SketchShape[]> = SKETCH_ICONS[name];
	const paths = Object.entries(layers).map(([layer, shapes]) => ({
		layer,
		shapes: shapes.map((shape, index): ShapePath => {
			const seed = seedOf(`${name}.${layer}.${index}`);
			const [first, second] =
				'points' in shape
					? sketchStroke(shape.points, { seed, closed: shape.closed })
					: sketchEllipse(...shape.ellipse, seed);
			return { first, second, fill: shape.fill };
		}),
	}));
	pathCache.set(name, paths);
	return paths;
}

interface SketchIconProps {
	name: SketchIconName;
	size?: number;
	/** Position when nested inside another SVG. */
	x?: number;
	y?: number;
	className?: string;
}

// Animations are driven from an ancestor with the `pixel-hover` class (see SketchIcon.css).
function SketchIcon({ name, size = 16, x, y, className }: SketchIconProps) {
	return (
		<svg
			className={
				className
					? `sketch-icon sketch-icon--${name} ${className}`
					: `sketch-icon sketch-icon--${name}`
			}
			width={size}
			height={size}
			x={x}
			y={y}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<g className="sketch-icon-body">
				{pathsOf(name).map(({ layer, shapes }) => (
					<g key={layer} className={`sketch-layer sketch-layer--${layer}`}>
						{shapes.map((shape, index) => (
							<Fragment key={index}>
								{shape.fill && (
									<path
										className="sketch-fill"
										d={shape.first}
										fill={shape.fill}
									/>
								)}
								<path
									className="sketch-stroke"
									d={shape.first}
									pathLength={1}
								/>
								<path
									className="sketch-stroke sketch-stroke--second"
									d={shape.second}
									pathLength={1}
								/>
							</Fragment>
						))}
					</g>
				))}
			</g>
		</svg>
	);
}

export default SketchIcon;
