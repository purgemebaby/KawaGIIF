import { t } from '../i18n/en';

// Work area of a monitor in physical pixels; `index` is what the backend commands take.
export interface MonitorInfo {
	index: number;
	name: string | null;
	x: number;
	y: number;
	width: number;
	height: number;
	primary: boolean;
}

export function monitorLabel(monitor: MonitorInfo): string {
	const label = t.editor.monitor.option(
		monitor.index + 1,
		monitor.width,
		monitor.height,
	);
	return monitor.primary ? `${label} ${t.editor.monitor.primary}` : label;
}

export function primaryMonitorIndex(monitors: MonitorInfo[]): number {
	return monitors.find((m) => m.primary)?.index ?? 0;
}

// Monitor whose work area holds the point, or the primary one when it is off every screen.
export function monitorIndexAt(
	monitors: MonitorInfo[],
	x: number,
	y: number,
): number {
	const hit = monitors.find(
		(m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height,
	);
	return hit?.index ?? primaryMonitorIndex(monitors);
}
