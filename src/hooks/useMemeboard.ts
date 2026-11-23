import { useCallback, useEffect, useState } from 'react';
import { invoke } from '../lib/ipc';
import { notifyError } from '../lib/notify';
import type { MemeboardView } from '../lib/memeboard';
import { useTauriEvent } from './useTauriEvent';

/** The memeboard as Rust lists it, refreshed whenever it changes (saves, hotkey sync, fire counts). */
export function useMemeboard(): {
	view: MemeboardView | null;
	refresh: () => void;
} {
	const [view, setView] = useState<MemeboardView | null>(null);

	const refresh = useCallback(() => {
		invoke<MemeboardView>('list_memes').then(setView).catch(notifyError);
	}, []);

	useEffect(refresh, [refresh]);
	useTauriEvent('memeboard-changed', refresh);

	return { view, refresh };
}
