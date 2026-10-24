import { useEffect, useRef, type RefObject } from 'react';

/**
 * Runs `onEscape` on an Escape keydown that nothing handled yet (an input or a popover marks it with preventDefault).
 * `first` listens in the capture phase and claims the key, so a popover closes without also closing the Modal under it.
 */
export function useEscape(
	enabled: boolean,
	onEscape: () => void,
	first = false,
) {
	const onEscapeRef = useRef(onEscape);
	onEscapeRef.current = onEscape;

	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape' || e.defaultPrevented) return;
			if (first) e.preventDefault();
			onEscapeRef.current();
		};
		window.addEventListener('keydown', onKeyDown, first);
		return () => window.removeEventListener('keydown', onKeyDown, first);
	}, [enabled, first]);
}

/** Closes on an outside pointer-down or an Escape keydown while enabled. */
export function useDismiss(
	rootRef: RefObject<HTMLElement | null>,
	enabled: boolean,
	onDismiss: () => void,
) {
	useEscape(enabled, onDismiss, true);

	const onDismissRef = useRef(onDismiss);
	onDismissRef.current = onDismiss;

	useEffect(() => {
		if (!enabled) return;
		const onPointerDown = (e: PointerEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				onDismissRef.current();
			}
		};
		window.addEventListener('pointerdown', onPointerDown, true);
		return () => window.removeEventListener('pointerdown', onPointerDown, true);
	}, [rootRef, enabled]);
}
