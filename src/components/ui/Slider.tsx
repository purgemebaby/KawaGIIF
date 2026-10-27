import type { CSSProperties } from 'react';
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
	// --fill sizes the gradient-filled part of the track (components.css).
	const fillStyle = { '--fill': `${ratio * 100}%` } as CSSProperties;

	return (
		<label className="kg-slider">
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
			<span className="kg-slider-track-wrap">
				<input
					type="range"
					min={min}
					max={max}
					step={step}
					value={value}
					style={fillStyle}
					onChange={(e) => onChange(Number(e.target.value))}
				/>
				<output
					className="kg-slider-bubble"
					style={{ left: `${ratio * 100}%` }}
					aria-hidden="true"
				>
					{format(value)}
				</output>
			</span>
		</label>
	);
}

export default Slider;
