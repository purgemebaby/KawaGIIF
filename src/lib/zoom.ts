// Same range as UI_ZOOM_MIN/MAX in commands.rs.
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.5;
export const ZOOM_STEP = 0.1;

const ZOOM_EVENT = 'kg-zoom-changed';

/** Tells every zoom control (shortcuts, Settings row) which zoom the backend just applied. */
export function announceZoom(zoom: number) {
	window.dispatchEvent(new CustomEvent<number>(ZOOM_EVENT, { detail: zoom }));
}

/** Calls `onChange` whenever any zoom control applies a new zoom; returns the unsubscribe function. */
export function onZoomAnnounced(onChange: (zoom: number) => void) {
	const handler = (e: Event) => onChange((e as CustomEvent<number>).detail);
	window.addEventListener(ZOOM_EVENT, handler);
	return () => window.removeEventListener(ZOOM_EVENT, handler);
}

/** 0 resets to 1; otherwise steps `current` by `ZOOM_STEP`, rounded to 2 decimals and clamped. */
export function nextZoom(current: number, direction: 1 | -1 | 0): number {
	if (direction === 0) return 1;
	const rounded = Math.round((current + direction * ZOOM_STEP) * 100) / 100;
	return Math.min(Math.max(rounded, ZOOM_MIN), ZOOM_MAX);
}
