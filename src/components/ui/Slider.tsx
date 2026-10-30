import {
	useEffect,
	useId,
	useState,
	type CSSProperties,
	type ReactNode,
} from 'react';
import ResetButton from './ResetButton';

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
	/** Shown right after the label, such as an InfoTip. */
	info?: ReactNode;
}

// A hand-drawn bar that fills with the buttons' hatch up to the value. The native range input stays on top, invisible,
// so keyboard and screen readers work as before.
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
	info,
}: SliderProps) {
	const ratio = max === min ? 0 : (value - min) / (max - min);
	const [dragging, setDragging] = useState(false);
	const inputId = useId();
	// --ratio sizes the fill and places the bubble (components.css)
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
		// a div, not a <label>: a label hands its hover and clicks to the first control inside, which would be the reset
		<div className="kg-slider" data-dragging={dragging || undefined}>
			<div className="kg-slider-label">
				<label htmlFor={inputId}>{label}</label>
				{info}
				{onReset && (
					<ResetButton
						label={resetLabel ?? label}
						onReset={onReset}
						className="kg-slider-reset"
					/>
				)}
			</div>
			<span className="kg-slider-track-wrap" style={ratioStyle}>
				<span className="kg-slider-track" aria-hidden="true">
					<span className="kg-slider-fill" />
				</span>
				<input
					id={inputId}
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
		</div>
	);
}

export default Slider;
