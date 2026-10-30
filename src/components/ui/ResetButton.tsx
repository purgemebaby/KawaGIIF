import SketchIcon from './SketchIcon';

interface ResetButtonProps {
	/** Read by screen readers and shown on hover. */
	label: string;
	onReset: () => void;
	className?: string;
}

/** The icon-only circular arrow that puts a value back. The sketch strokes take their ink from --kg-fg. */
function ResetButton({ label, onReset, className }: ResetButtonProps) {
	return (
		<button
			type="button"
			className={
				className ? `kg-reset icon-hover ${className}` : 'kg-reset icon-hover'
			}
			aria-label={label}
			title={label}
			// never steals focus, and inside a <label> the click never reaches the wrapped input
			onMouseDown={(e) => e.preventDefault()}
			onClick={(e) => {
				e.preventDefault();
				onReset();
			}}
		>
			<SketchIcon name="reset" />
		</button>
	);
}

export default ResetButton;
