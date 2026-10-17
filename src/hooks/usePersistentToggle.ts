import { useCallback, useState } from 'react';

function readToggle(key: string, fallback: boolean): boolean {
	try {
		const stored = localStorage.getItem(key);
		return stored === null ? fallback : stored === '1';
	} catch {
		return fallback;
	}
}

function writeToggle(key: string, value: boolean) {
	try {
		localStorage.setItem(key, value ? '1' : '0');
	} catch {
		// Blocked storage only costs the remembered state.
	}
}

/** A boolean kept in localStorage for this viewer; works without storage. */
export function usePersistentToggle(key: string, fallback: boolean) {
	const [value, setValue] = useState(() => readToggle(key, fallback));

	const set = useCallback(
		(next: boolean) => {
			setValue(next);
			writeToggle(key, next);
		},
		[key],
	);

	return [value, set] as const;
}
