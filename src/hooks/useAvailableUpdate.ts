import { useEffect, useReducer, useState } from 'react';
import { invoke } from '../lib/ipc';
import { useTauriEvent } from './useTauriEvent';

// Dismissing lasts for the rest of the session, even when Home unmounts and remounts.
let dismissed = false;

/** The newer release the backend found, or null once dismissed (nothing is persisted). */
export function useAvailableUpdate(): {
	version: string | null;
	dismiss: () => void;
} {
	const [version, setVersion] = useState<string | null>(null);
	// re-renders after a dismiss flips the module flag
	const [, rerender] = useReducer((n: number) => n + 1, 0);

	useEffect(() => {
		// A failed check just means no card.
		invoke<string | null>('get_available_update')
			.then(setVersion)
			.catch(() => {});
	}, []);

	useTauriEvent<string>('update-available', setVersion);

	return {
		version: dismissed ? null : version,
		dismiss: () => {
			dismissed = true;
			rerender();
		},
	};
}
