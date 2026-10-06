import { useRef, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';

interface SortOption<T extends string> {
	value: T;
	label: string;
}

interface SortMenuProps<T extends string> {
	value: T;
	options: SortOption<T>[];
	label: string;
	onChange: (value: T) => void;
}

function SortMenu<T extends string>({
	value,
	options,
	label,
	onChange,
}: SortMenuProps<T>) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useDismiss(rootRef, open, () => setOpen(false));

	const current = options.find((o) => o.value === value);

	return (
		<div className="sort-menu" ref={rootRef}>
			<button
				type="button"
				className="kg-btn kg-btn--secondary kg-btn--sm"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="listbox"
				aria-expanded={open}
				title={`${label}: ${current?.label ?? ''}`}
				aria-label={`${label}: ${current?.label ?? ''}`}
			>
				<span className="sort-menu-icon" aria-hidden="true">
					⇅
				</span>
			</button>

			{open && (
				<div className="sort-menu-list" role="listbox">
					{options.map((opt) => (
						<button
							key={opt.value}
							type="button"
							role="option"
							aria-selected={opt.value === value}
							className={
								opt.value === value
									? 'sort-menu-item selected'
									: 'sort-menu-item'
							}
							onClick={() => {
								onChange(opt.value);
								setOpen(false);
							}}
						>
							{opt.label}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

export default SortMenu;
