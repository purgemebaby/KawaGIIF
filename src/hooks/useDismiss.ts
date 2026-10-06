import { useEffect, useRef, type RefObject } from 'react';

export function useDismiss(
	rootRef: RefObject<HTMLElement | null>,
	enabled: boolean,
	onDismiss: () => void,
) {
	const onDismissRef = useRef(onDismiss);
	onDismissRef.current = onDismiss;

	useEffect(() => {
		if (!enabled) return;
		// Capture phase + stopPropagation: Escape closes only this, not a Modal listening on window too.
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onDismissRef.current();
			}
		};
		const onPointerDown = (e: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				onDismissRef.current();
			}
		};
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('pointerdown', onPointerDown, true);
		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('pointerdown', onPointerDown, true);
		};
	}, [rootRef, enabled]);
}
