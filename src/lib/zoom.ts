import { createAppEvent } from './appEvent';
import { invoke } from './ipc';
import { clamp } from './overlayGeometry';

// Same range as UI_ZOOM_MIN/MAX in commands.rs.
export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

const zoomEvent = createAppEvent<number>('kg-zoom-changed');

/** Tells every zoom control (shortcuts, Settings row) which zoom the backend just applied. */
export const announceZoom = zoomEvent.announce;

/** Calls `onChange` whenever any zoom control applies a new zoom. Returns the unsubscribe function. */
export const onZoomAnnounced = zoomEvent.listen;

/** 0 resets to 1. Otherwise steps `current` by `ZOOM_STEP`, rounded to 2 decimals and clamped. */
export function nextZoom(current: number, direction: 1 | -1 | 0): number {
	if (direction === 0) return 1;
	const rounded = Math.round((current + direction * ZOOM_STEP) * 100) / 100;
	return clamp(rounded, ZOOM_MIN, ZOOM_MAX);
}

/** Steps the zoom (direction 1, -1, or 0 to reset), applies it in Rust and announces the applied value. */
export async function applyZoomStep(
	current: number,
	direction: 1 | -1 | 0,
): Promise<number> {
	const applied = await invoke<number>('set_ui_zoom', {
		zoom: nextZoom(current, direction),
	});
	announceZoom(applied);
	return applied;
}
