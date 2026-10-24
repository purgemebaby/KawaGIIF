import { useMemo } from 'react';
import { seedOf, sketchStroke, type Point } from '../../lib/sketch';
import './SketchFrame.css';

interface SketchFrameProps {
	viewBox: string;
	seed: string;
	/** The closed outline, e.g. a speech bubble or a smoke cloud. */
	points: readonly Point[];
	/** How far the pen wanders, in viewBox units. A wider viewBox needs more to look hand-drawn. */
	roughness?: number;
	className?: string;
}

// One wobbly shape stretched over its host: the host sizes the SVG, the seed fixes the wobble.
function SketchFrame({
	viewBox,
	seed,
	points,
	roughness,
	className,
}: SketchFrameProps) {
	const [first, second] = useMemo(
		() => sketchStroke(points, { seed: seedOf(seed), closed: true, roughness }),
		[seed, points, roughness],
	);

	return (
		<svg
			className={className ? `sketch-frame ${className}` : 'sketch-frame'}
			viewBox={viewBox}
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			<path className="sketch-frame-fill" d={first} />
			<path className="sketch-frame-stroke" d={first} />
			<path
				className="sketch-frame-stroke sketch-frame-stroke--second"
				d={second}
			/>
		</svg>
	);
}

export default SketchFrame;
