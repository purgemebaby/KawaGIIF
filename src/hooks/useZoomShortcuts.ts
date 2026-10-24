import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig } from '../lib/config';
import { applyZoomStep, onZoomAnnounced } from '../lib/zoom';

/** Obsidian-style UI zoom: Ctrl +/-/0 and Ctrl+wheel. Returns the zoom to flash in the badge, or null. */
export function useZoomShortcuts(configPromise: Promise<AppConfig>) {
	// the backend applies the zoom to the webview. We track the value here
	const uiZoomRef = useRef(1);
	const [zoomToast, setZoomToast] = useState<number | null>(null);
	const zoomTimerRef = useRef<number | undefined>(undefined);

	// Applies a zoom step (1 in / -1 out / 0 reset) and flashes the percentage badge for ~1s.
	const applyZoom = useCallback(async (direction: 1 | -1 | 0) => {
		const applied = await applyZoomStep(uiZoomRef.current, direction);
		setZoomToast(applied);
		window.clearTimeout(zoomTimerRef.current);
		zoomTimerRef.current = window.setTimeout(() => setZoomToast(null), 1000);
	}, []);

	// The backend re-applies the saved zoom at startup. Sync the tracked zoom once on mount.
	useEffect(() => {
		const track = (zoom: number) => {
			uiZoomRef.current = zoom;
		};
		configPromise.then((c) => track(c.ui_zoom ?? 1));
		return onZoomAnnounced(track);
	}, [configPromise]);

	// Ctrl+= / Ctrl++ zoom in, Ctrl+- out, Ctrl+0 reset.
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (!e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return;
			if (e.key === '=' || e.key === '+') {
				e.preventDefault();
				applyZoom(1);
			} else if (e.key === '-') {
				e.preventDefault();
				applyZoom(-1);
			} else if (e.key === '0') {
				e.preventDefault();
				applyZoom(0);
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [applyZoom]);

	// Ctrl + mouse wheel zooms. Throttled to one step per 80ms so a single spin doesn't jump several levels.
	useEffect(() => {
		let lastApplied = 0;
		const onWheel = (e: WheelEvent) => {
			if (!e.ctrlKey) return;
			e.preventDefault();
			if (Date.now() - lastApplied < 80) return;
			lastApplied = Date.now();
			applyZoom(e.deltaY < 0 ? 1 : -1);
		};
		window.addEventListener('wheel', onWheel, { passive: false });
		return () => window.removeEventListener('wheel', onWheel);
	}, [applyZoom]);

	return zoomToast;
}
