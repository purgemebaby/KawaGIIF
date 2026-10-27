import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../lib/ipc';
import { useTauriEvent } from './useTauriEvent';

/** Whether the working template has drifted from the last save. */
export function useUnsavedChanges(): { dirty: boolean; refresh: () => void } {
	const [dirty, setDirty] = useState(false);
	const timerRef = useRef<number | null>(null);

	// Dragging fires geometry events many times a second, so bursts collapse into one ask.
	const refresh = useCallback(() => {
		if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			// A failed ask keeps the last answer: this is a background poll, not a user action.
			invoke<boolean>('has_unsaved_changes').then(setDirty, () => {});
		}, 100);
	}, []);

	useEffect(() => {
		refresh();
		return () => {
			if (timerRef.current !== null) window.clearTimeout(timerRef.current);
		};
	}, [refresh]);

	useTauriEvent('placed-items-changed', refresh);
	useTauriEvent('overlay-geometry-changed', refresh);
	useTauriEvent('selection-changed', refresh);

	return { dirty, refresh };
}
