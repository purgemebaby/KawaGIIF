import { useEffect, useState } from 'react';
import { invoke } from '../lib/ipc';
import type { MonitorInfo } from '../lib/monitors';

// Monitors connected when the screen opens (indices are only valid for this run of the app).
export function useMonitors(): MonitorInfo[] {
	const [monitors, setMonitors] = useState<MonitorInfo[]>([]);

	useEffect(() => {
		invoke<MonitorInfo[]>('list_monitors')
			.then((list) => setMonitors(list ?? []))
			.catch(() => setMonitors([]));
	}, []);

	return monitors;
}
