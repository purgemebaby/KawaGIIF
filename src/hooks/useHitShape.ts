import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { invoke } from '../lib/ipc';

interface Size {
	w: number;
	h: number;
}

interface HitShapeOptions {
	/** The editor is open, so the overlay takes clicks at all. */
	editMode: boolean;
	/** This overlay is the selected one and shows its handles. */
	editing: boolean;
	frame: Size;
	media: Size;
	rotation: number;
	/** The rotate sphere sits in the bottom margin instead of the top one. */
	flipped: boolean;
	/** Set while the overlay hangs from the cursor: its swing must not be clipped. */
	carrying: MutableRefObject<boolean>;
}

// Room around the media box, in CSS px: the corner handles (16 px squares on the corners, plus their glow) when
// selected, one pixel otherwise. The sphere is 18 px at 7 px from the edge (OverlayItemApp.css), glow included.
const HANDLE_PAD = 10;
const PLAIN_PAD = 1;
const SPHERE_CENTRE = 7 + 9;
const SPHERE_RADIUS = 15;
const CARRY_RECHECK_MS = 200; // `carrying` is a ref: nothing re-renders when the swing ends

/**
 * Clips the overlay window to the media it shows while the editor is open, so the transparent margin kept for the
 * handles doesn't swallow clicks meant for whatever sits under it. Outside the editor the window is click-through
 * anyway, and gets its whole area back.
 */
export function useHitShape({
	editMode,
	editing,
	frame,
	media,
	rotation,
	flipped,
	carrying,
}: HitShapeOptions) {
	const sent = useRef('');
	const [, setRecheck] = useState(0);

	useEffect(() => {
		const carried = carrying.current;
		const dpr = window.devicePixelRatio || 1;
		let shape: {
			polygon: [number, number][];
			circle: [number, number, number] | null;
		} | null = null;

		if (editMode && !carried) {
			const pad = editing ? HANDLE_PAD : PLAIN_PAD;
			const th = (rotation * Math.PI) / 180;
			const cx = frame.w / 2;
			const cy = frame.h / 2;
			const hw = media.w / 2 + pad;
			const hh = media.h / 2 + pad;
			const corners: [number, number][] = [
				[-hw, -hh],
				[hw, -hh],
				[hw, hh],
				[-hw, hh],
			];
			shape = {
				polygon: corners.map(([x, y]) => [
					Math.round((cx + x * Math.cos(th) - y * Math.sin(th)) * dpr),
					Math.round((cy + x * Math.sin(th) + y * Math.cos(th)) * dpr),
				]),
				circle: editing
					? [
							Math.round(cx * dpr),
							Math.round(
								(flipped ? frame.h - SPHERE_CENTRE : SPHERE_CENTRE) * dpr,
							),
							Math.round(SPHERE_RADIUS * dpr),
						]
					: null,
			};
		}

		// the same shape arrives on every render of a drag: send only changes
		const key = JSON.stringify(shape);
		if (key !== sent.current) {
			sent.current = key;
			invoke('set_overlay_shape', { shape });
		}

		if (!carried) return;
		const timer = window.setTimeout(
			() => setRecheck((n) => n + 1),
			CARRY_RECHECK_MS,
		);
		return () => window.clearTimeout(timer);
	});
}
