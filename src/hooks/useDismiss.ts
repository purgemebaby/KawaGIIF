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

/** Closes on a pointer-down outside every ref (a portalled popover passes its own too) or an Escape keydown while enabled. */
export function useDismiss(
	rootRefs: RefObject<HTMLElement | null> | RefObject<HTMLElement | null>[],
	enabled: boolean,
	onDismiss: () => void,
) {
	useEscape(enabled, onDismiss, true);

	const onDismissRef = useRef(onDismiss);
	onDismissRef.current = onDismiss;

	useEffect(() => {
		if (!enabled) return;
		const refs = Array.isArray(rootRefs) ? rootRefs : [rootRefs];
		const onPointerDown = (e: PointerEvent) => {
			const inside = refs.some((ref) =>
				ref.current?.contains(e.target as Node),
			);
			if (!inside && refs[0].current) onDismissRef.current();
		};
		window.addEventListener('pointerdown', onPointerDown, true);
		return () => window.removeEventListener('pointerdown', onPointerDown, true);
		// not keyed on `rootRefs`: an inline array is new every render, while the refs inside never change
	}, [enabled]);
}
