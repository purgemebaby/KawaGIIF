import { useId, useState } from 'react';
import SketchIcon from './SketchIcon';
import './InfoTip.css';

interface InfoTipProps {
	text: string;
	/** Read by screen readers as the button's name. */
	label: string;
	className?: string;
}

/** A small ⓘ that shows a note on hover or focus, for explanations that would clutter the panel. */
function InfoTip({ text, label, className }: InfoTipProps) {
	const [open, setOpen] = useState(false);
	const tipId = useId();

	return (
		<span
			className={className ? `info-tip ${className}` : 'info-tip'}
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
		>
			<button
				type="button"
				className="info-tip-button"
				aria-label={label}
				aria-describedby={open ? tipId : undefined}
				onFocus={() => setOpen(true)}
				onBlur={() => setOpen(false)}
				onClick={() => setOpen((o) => !o)}
			>
				<SketchIcon name="info" size={20} />
			</button>
			{open && (
				<span id={tipId} role="tooltip" className="info-tip-bubble">
					{text}
				</span>
			)}
		</span>
	);
}

export default InfoTip;
