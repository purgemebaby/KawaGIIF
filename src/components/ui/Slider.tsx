import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { seedOf, sketchEllipse, sketchStroke } from '../../lib/sketch';
import SketchIcon from './SketchIcon';

interface SliderProps {
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	format: (value: number) => string;
	onChange: (value: number) => void;
	onReset?: () => void;
	resetLabel?: string;
}

// viewBox of the track line; the SVG stretches to the slider's width
const TRACK_W = 200;
const TRACK_H = 14;

/** The wobbly track line and thumb of one slider, drawn once per label so each keeps its own hand. */
function useSketch(label: string) {
	return useMemo(() => {
		const seed = seedOf(`slider.${label}`);
		const line = sketchStroke(
			[
				[3, TRACK_H / 2],
				[TRACK_W / 2, TRACK_H / 2 + 0.4],
				[TRACK_W - 3, TRACK_H / 2],
			],
			{ seed, roughness: 0.9 },
		);
		const thumb = sketchEllipse(10, 10, 6.5, 6.5, seed + 1, 1.1);
		return { line, thumb };
	}, [label]);
}

// A hand-drawn slider: the native range input stays on top, invisible, so keyboard and screen readers work as before.
function Slider({
	label,
	min,
	max,
	step,
	value,
	format,
	onChange,
	onReset,
	resetLabel,
}: SliderProps) {
	const ratio = max === min ? 0 : (value - min) / (max - min);
	const { line, thumb } = useSketch(label);
	const [dragging, setDragging] = useState(false);
	// --ratio places the fill, the thumb and the bubble (components.css)
	const ratioStyle = { '--ratio': ratio } as CSSProperties;

	// the press can end anywhere, outside the slider too
	useEffect(() => {
		if (!dragging) return;
		const stop = () => setDragging(false);
		window.addEventListener('pointerup', stop);
		window.addEventListener('pointercancel', stop);
		return () => {
			window.removeEventListener('pointerup', stop);
			window.removeEventListener('pointercancel', stop);
		};
	}, [dragging]);

	return (
		<label className="kg-slider" data-dragging={dragging || undefined}>
			<span className="kg-slider-label">
				{label}
				{onReset && (
					<button
						type="button"
						className="kg-slider-reset icon-hover"
						aria-label={resetLabel}
						title={resetLabel}
						// never steals focus, and the click never reaches the wrapped input
						onMouseDown={(e) => e.preventDefault()}
						onClick={(e) => {
							e.preventDefault();
							onReset();
						}}
					>
						<SketchIcon name="reset" />
					</button>
				)}
			</span>
			<span className="kg-slider-track-wrap" style={ratioStyle}>
				<svg
					className="kg-slider-line"
					viewBox={`0 0 ${TRACK_W} ${TRACK_H}`}
					preserveAspectRatio="none"
					aria-hidden="true"
				>
					<path className="kg-slider-stroke" d={line[0]} />
					<path
						className="kg-slider-stroke kg-slider-stroke--second"
						d={line[1]}
					/>
				</svg>
				<span className="kg-slider-fill" aria-hidden="true" />
				<svg className="kg-slider-thumb" viewBox="0 0 20 20" aria-hidden="true">
					<path className="kg-slider-thumb-fill" d={thumb[0]} />
					<path className="kg-slider-stroke" d={thumb[0]} />
					<path
						className="kg-slider-stroke kg-slider-stroke--second"
						d={thumb[1]}
					/>
				</svg>
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					onPointerDown={() => setDragging(true)}
					onChange={(e) => onChange(Number(e.target.value))}
				/>
				<output className="kg-slider-bubble" aria-hidden="true">
					{format(value)}
				</output>
			</span>
		</label>
	);
}

export default Slider;
