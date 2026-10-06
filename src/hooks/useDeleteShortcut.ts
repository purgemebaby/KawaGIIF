import { useEffect } from 'react';

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	return EDITABLE.has(target.tagName) || target.isContentEditable;
}

export function useDeleteShortcut(enabled: boolean, onDelete: () => void) {
	useEffect(() => {
		if (!enabled) return;

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== 'Delete' && e.key !== 'Backspace') return;
			if (isTypingTarget(e.target)) return;
			e.preventDefault();
			onDelete();
		};

		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [enabled, onDelete]);
}
