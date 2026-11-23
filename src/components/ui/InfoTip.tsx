import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MODAL_ROOT_ID } from './Modal';
import SketchIcon from './SketchIcon';
import './InfoTip.css';

interface InfoTipProps {
	text: string;
	/** Read by screen readers as the button's name. */
	label: string;
	className?: string;
}

// px between the bubble and the button, and between the bubble and the window edge
const GAP = 6;
const EDGE = 8;

/** A small ⓘ that shows a note on hover or focus. The note is placed in the modal root and kept inside the window. */
function InfoTip({ text, label, className }: InfoTipProps) {
	const [open, setOpen] = useState(false);
	const [place, setPlace] = useState<{ left: number; top: number } | null>(
		null,
	);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const bubbleRef = useRef<HTMLSpanElement>(null);
	const tipId = useId();

	// below the button, or above when it doesn't fit; never past the window's left or right edge
	useLayoutEffect(() => {
		if (!open) {
			setPlace(null);
			return;
		}
		const measure = () => {
			const button = buttonRef.current?.getBoundingClientRect();
			const bubble = bubbleRef.current?.getBoundingClientRect();
			if (!button || !bubble) return;
			const centre = button.left + button.width / 2;
			const left = Math.min(
				Math.max(EDGE, centre - bubble.width / 2),
				window.innerWidth - bubble.width - EDGE,
			);
			const below = button.bottom + GAP;
			const top =
				below + bubble.height > window.innerHeight - EDGE
					? Math.max(EDGE, button.top - GAP - bubble.height)
					: below;
			setPlace({ left, top });
		};
		measure();
		window.addEventListener('resize', measure);
		window.addEventListener('scroll', measure, true);
		return () => {
			window.removeEventListener('resize', measure);
			window.removeEventListener('scroll', measure, true);
		};
	}, [open]);

	return (
		<span
			className={className ? `info-tip ${className}` : 'info-tip'}
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
		>
			<button
				ref={buttonRef}
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
			{open &&
				createPortal(
					<span
						ref={bubbleRef}
						id={tipId}
						role="tooltip"
						className="info-tip-bubble"
						// measured hidden first, then shown where it fits
						style={
							place
								? { left: place.left, top: place.top }
								: { left: 0, top: 0, visibility: 'hidden' }
						}
					>
						{text}
					</span>,
					document.getElementById(MODAL_ROOT_ID) ?? document.body,
				)}
		</span>
	);
}

export default InfoTip;
