import { useCallback, useEffect, useState } from 'react';
import { convertFileSrc, invoke } from '../lib/ipc';

export function useLoadingIndicator() {
	const [url, setUrl] = useState<string | null>(null);
	const [ready, setReady] = useState(false);

	const refresh = useCallback(async () => {
		const path = await invoke<string | null>('get_loading_indicator').catch(
			() => null,
		);
		setUrl(path ? convertFileSrc(path) : null);
		setReady(true);
	}, []);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { url, ready, refresh };
}
