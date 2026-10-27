import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '../lib/ipc';
import {
	SNAP_DEG,
	clamp,
	fitMedia,
	normalizeDeg,
	screenCentre,
	sizeLimits,
	windowFor,
} from '../lib/overlayGeometry';
import { startPointerDrag } from '../lib/pointerDrag';

interface Size {
	w: number;
	h: number;
}

interface EditHandlesOptions {
	editing: boolean;
	frame: Size;
	rotation: number;
	setRotation: (deg: number) => void;
	naturalRef: MutableRefObject<Size | null>;
}

/** Media box plus the editor handles (rotate sphere, corner resize) and the side the sphere sits on. */
export function useEditHandles({
	editing,
	frame,
	rotation,
	setRotation,
	naturalRef,
}: EditHandlesOptions) {
	const [flipped, setFlipped] = useState(false);
	// size pinned while a handle is dragged, so the window's own resize can't reflow the media
	const [heldSize, setHeldSize] = useState<Size | null>(null);

	// The rotate sphere sits in the top margin, but flips to the bottom one when that margin is off the monitor.
	useEffect(() => {
		if (!editing) return;
		const win = getCurrentWindow();
		let cancelled = false;
		const check = async () => {
			const [pos, monitor] = await Promise.all([
				win.outerPosition(),
				currentMonitor(),
			]);
			if (!cancelled) setFlipped(!!monitor && pos.y < monitor.position.y);
		};
		const unlistens = [win.onMoved(check), win.onResized(check)];
		check();
		return () => {
			cancelled = true;
			unlistens.forEach((p) => p.then((unlisten) => unlisten()));
		};
	}, [editing]);

	useEffect(() => {
		if (!editing) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const step = e.shiftKey ? 10 : 1;
			let dx = 0;
			let dy = 0;
			if (e.key === 'ArrowLeft') dx = -step;
			else if (e.key === 'ArrowRight') dx = step;
			else if (e.key === 'ArrowUp') dy = -step;
			else if (e.key === 'ArrowDown') dy = step;
			else return;
			e.preventDefault();
			invoke('nudge_overlay', { dx, dy });
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [editing]);

	const natural = naturalRef.current;
	const aspect = natural ? natural.w / natural.h : frame.w / frame.h;
	const media = heldSize ?? fitMedia(frame.w, frame.h, aspect, rotation);

	// Shared drag for the editor handles: pinned pointer, rAF-throttled IPC, one final flush on release.
	const startHandleDrag = (
		e: React.PointerEvent<HTMLDivElement>,
		onMove: (ev: PointerEvent) => void,
		flush: () => void,
	) => {
		e.stopPropagation();
		e.preventDefault();
		startPointerDrag(e, {
			move: onMove,
			frame: flush,
			end: () => setHeldSize(null),
		});
	};

	// anchored resize: the opposite corner stays put, the dragged one follows the pointer along the diagonal
	const onCornerStart = (e: React.PointerEvent<HTMLDivElement>, s: 1 | -1) => {
		const start = media;
		const centre = screenCentre(e);
		const th = (rotation * Math.PI) / 180;
		const rot = (x: number, y: number) => ({
			x: x * Math.cos(th) - y * Math.sin(th),
			y: x * Math.sin(th) + y * Math.cos(th),
		});
		const half = rot(start.w / 2, start.h / 2);
		const fixed = { x: centre.x - s * half.x, y: centre.y - s * half.y };
		const D = Math.hypot(start.w, start.h);
		const d = rot(start.w, start.h);
		const u = { x: (s * d.x) / D, y: (s * d.y) / D };
		const { kMin, kMax } = sizeLimits(start, rotation, naturalRef.current);
		const dpr = window.devicePixelRatio || 1;
		const win = getCurrentWindow();

		// physical centre of the window at the drag start. Moves before it resolves can't place the window
		let startPhys: { x: number; y: number } | null = null;
		Promise.all([win.outerPosition(), win.outerSize()]).then(([p, z]) => {
			startPhys = { x: p.x + z.width / 2, y: p.y + z.height / 2 };
		});

		let pending: {
			x: number;
			y: number;
			width: number;
			height: number;
		} | null = null;

		startHandleDrag(
			e,
			(ev) => {
				if (!startPhys) return;
				const k = clamp(
					((ev.screenX - fixed.x) * u.x + (ev.screenY - fixed.y) * u.y) / D,
					kMin,
					kMax,
				);
				const size = { w: start.w * k, h: start.h * k };
				setHeldSize(size);
				const c2 = {
					x: fixed.x + (u.x * D * k) / 2,
					y: fixed.y + (u.y * D * k) / 2,
				};
				const w = windowFor(size, rotation);
				pending = {
					x: Math.round(startPhys.x + (c2.x - centre.x) * dpr - w.width / 2),
					y: Math.round(startPhys.y + (c2.y - centre.y) * dpr - w.height / 2),
					width: w.width,
					height: w.height,
				};
			},
			() => {
				if (pending) invoke('set_overlay_rect', pending);
			},
		);
	};

	const onRotateStart = (e: React.PointerEvent<HTMLDivElement>) => {
		const centre = screenCentre(e);
		const held = media;
		setHeldSize(held);
		const a0 = Math.atan2(e.screenY - centre.y, e.screenX - centre.x);
		const deg0 = rotation;
		let pendingDeg = deg0;
		let pending = windowFor(held, deg0);

		startHandleDrag(
			e,
			(ev) => {
				const angle = Math.atan2(ev.screenY - centre.y, ev.screenX - centre.x);
				let deg = deg0 + ((angle - a0) * 180) / Math.PI;
				if (ev.shiftKey) deg = Math.round(deg / SNAP_DEG) * SNAP_DEG;
				deg = normalizeDeg(deg);
				pendingDeg = deg;
				pending = windowFor(held, deg);
				setRotation(deg);
			},
			() => invoke('rotate_overlay', { rotation: pendingDeg, ...pending }),
		);
	};

	// A slider burst arrives faster than the window can resize: pin the media for the whole burst and send the
	// latest angle once per frame, unpinning shortly after the last call so the resize can't reflow the media.
	const burstRef = useRef<{
		media: Size;
		latest: { rotation: number; width: number; height: number } | null;
		raf: number;
		release: number;
	} | null>(null);

	const rotateTo = (deg: number) => {
		if (!burstRef.current) {
			burstRef.current = { media, latest: null, raf: 0, release: 0 };
			setHeldSize(media);
		}
		const burst = burstRef.current;
		setRotation(deg);
		burst.latest = { rotation: deg, ...windowFor(burst.media, deg) };
		if (!burst.raf) {
			burst.raf = requestAnimationFrame(() => {
				burst.raf = 0;
				if (!burst.latest) return;
				invoke('rotate_overlay', burst.latest);
				burst.latest = null;
			});
		}
		clearTimeout(burst.release);
		burst.release = window.setTimeout(() => {
			// a hidden window never fires rAF: send what it never did before unpinning
			cancelAnimationFrame(burst.raf);
			if (burst.latest) invoke('rotate_overlay', burst.latest);
			burstRef.current = null;
			setHeldSize(null);
		}, 150);
	};

	return { media, flipped, onCornerStart, onRotateStart, rotateTo };
}
