const MIN_SIDE = 40;
const HANDLE_MARGIN = 32; // logical px, same as HANDLE_MARGIN in window_manager.rs
export const SNAP_DEG = 15;
const MAX_UPSCALE = 1.5; // more blurs the media and costs GPU
const SPAWN_SIDE = 220; // logical px, same as SPAWN_BOX in template.rs

/** Bounding box of a `deg`-rotated `w`×`h` rectangle. */
function rotatedBox(w: number, h: number, deg: number) {
	const rad = (deg * Math.PI) / 180;
	const c = Math.abs(Math.cos(rad));
	const s = Math.abs(Math.sin(rad));
	return { w: w * c + h * s, h: w * s + h * c };
}

/** Largest media box of this aspect whose `deg` rotation fits the frame minus the handle margin. */
export function fitMedia(
	frameW: number,
	frameH: number,
	aspect: number,
	deg: number,
) {
	const rad = (deg * Math.PI) / 180;
	const c = Math.abs(Math.cos(rad));
	const s = Math.abs(Math.sin(rad));
	const w = Math.max(
		0,
		Math.min(
			(frameW - 2 * HANDLE_MARGIN) / (c + s / aspect),
			(frameH - 2 * HANDLE_MARGIN) / (s + c / aspect),
		),
	);
	return { w, h: w / aspect };
}

/** Physical size of the window that frames the rotated media plus the handle margin. */
export function windowFor(media: { w: number; h: number }, deg: number) {
	const box = rotatedBox(media.w, media.h, deg);
	const scale = window.devicePixelRatio || 1;
	return {
		width: Math.round((box.w + 2 * HANDLE_MARGIN) * scale),
		height: Math.round((box.h + 2 * HANDLE_MARGIN) * scale),
	};
}

/** Wraps an angle in degrees into (-180, 180]. */
export function normalizeDeg(deg: number) {
	const wrapped = (((deg % 360) + 540) % 360) - 180;
	return wrapped === -180 ? 180 : wrapped;
}

/** Screen position of the media centre: the margin around it is symmetric, so it is the window centre. */
export function screenCentre(e: {
	screenX: number;
	clientX: number;
	screenY: number;
	clientY: number;
}) {
	return {
		x: e.screenX - e.clientX + window.innerWidth / 2,
		y: e.screenY - e.clientY + window.innerHeight / 2,
	};
}

/** Clamps `v` into [lo, hi]. */
export function clamp(v: number, lo: number, hi: number) {
	return Math.max(lo, Math.min(hi, v));
}

/** Scale factors an anchored resize may reach: floor at MIN_SIDE, ceiling at the upscale cap and the screen. */
export function sizeLimits(
	media: { w: number; h: number },
	deg: number,
	natural: { w: number; h: number } | null,
) {
	const dpr = window.devicePixelRatio || 1;
	const kMin = MIN_SIDE / dpr / Math.min(media.w, media.h);
	// the ceiling never drops below the spawn size, so a small file can still fill its spawn box
	const maxLong = Math.max(
		((natural ? Math.max(natural.w, natural.h) : 0) * MAX_UPSCALE) / dpr,
		SPAWN_SIDE,
	);
	const box = rotatedBox(media.w, media.h, deg);
	const kScreen = Math.min(screen.width / box.w, screen.height / box.h);
	const kMax = Math.max(
		kMin,
		Math.min(maxLong / Math.max(media.w, media.h), kScreen),
	);
	return { kMin, kMax };
}
