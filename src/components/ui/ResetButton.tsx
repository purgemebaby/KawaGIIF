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
			className={className ? `kg-reset ${className}` : 'kg-reset'}
			aria-label={label}
			title={label}
			// never steals focus from the field it resets
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
