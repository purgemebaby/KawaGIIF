import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
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

const GAP = 4; // px between the button and the list
const EDGE = 8; // px the list keeps from the window edges

/** Fixed position for the list: under the button, right-aligned with it, above it when there is no room below. */
function placeList(button: DOMRect, list: DOMRect): CSSProperties {
	const left = Math.max(
		EDGE,
		Math.min(button.right - list.width, window.innerWidth - list.width - EDGE),
	);
	const below = button.bottom + GAP;
	const fitsBelow = below + list.height <= window.innerHeight - EDGE;
	const top = fitsBelow
		? below
		: Math.max(EDGE, button.top - GAP - list.height);
	return { left, top };
}

function SortMenu<T extends string>({
	value,
	options,
	label,
	onChange,
}: SortMenuProps<T>) {
	const [open, setOpen] = useState(false);
	const [place, setPlace] = useState<CSSProperties>({ visibility: 'hidden' });
	const rootRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// the list lives in <body>, so it is passed too: a click on it is not outside the menu
	const close = () => setOpen(false);
	useDismiss([rootRef, listRef], open, close);

	// Measured before paint, then kept in place while the window resizes or anything scrolls.
	useLayoutEffect(() => {
		if (!open) {
			setPlace({ visibility: 'hidden' });
			return;
		}
		const update = () => {
			const button = rootRef.current?.getBoundingClientRect();
			const list = listRef.current?.getBoundingClientRect();
			if (button && list) setPlace(placeList(button, list));
		};
		update();
		window.addEventListener('resize', update);
		window.addEventListener('scroll', update, true);
		return () => {
			window.removeEventListener('resize', update);
			window.removeEventListener('scroll', update, true);
		};
	}, [open]);

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

			{open &&
				createPortal(
					<div
						ref={listRef}
						className="sort-menu-list"
						role="listbox"
						style={place}
					>
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
									close();
								}}
							>
								{opt.label}
							</button>
						))}
					</div>,
					document.body,
				)}
		</div>
	);
}

export default SortMenu;
