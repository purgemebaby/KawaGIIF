interface ChoiceChipsProps<T extends string> {
	options: readonly T[];
	value: T;
	label: (option: T) => string;
	onChange: (option: T) => void;
	/** Names the group for screen readers. */
	ariaLabel?: string;
}

/** A row of pressable chips (the `filter-type` look) where exactly one is chosen. */
function ChoiceChips<T extends string>({
	options,
	value,
	label,
	onChange,
	ariaLabel,
}: ChoiceChipsProps<T>) {
	return (
		<div className="filter-types" role="group" aria-label={ariaLabel}>
			{options.map((option) => (
				<button
					key={option}
					type="button"
					className={option === value ? 'filter-type active' : 'filter-type'}
					aria-pressed={option === value}
					onClick={() => option !== value && onChange(option)}
				>
					{label(option)}
				</button>
			))}
		</div>
	);
}

export default ChoiceChips;
