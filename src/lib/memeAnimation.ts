import {
	POP_IN_MS,
	POP_OUT_MS,
	type Anchor,
	type Animation,
	type PathPoint,
} from './memeboard';

/** Where a meme's visual is at one instant: its top-left corner in stage px, plus scale, rotation, opacity and hue. */
export interface Pose {
	x: number;
	y: number;
	scale: number;
	rotate: number;
	opacity: number;
	hue: number;
}

/** What a pose depends on besides time: the stage and visual sizes (px), the anchor centre (px) and the length. */
export interface PoseContext {
	stageW: number;
	stageH: number;
	w: number;
	h: number;
	cx: number;
	cy: number;
	duration: number;
}

// at full intensity: px sideways, px up and down, degrees
const SHAKE_MAX: [number, number, number] = [10, 6, 4];
const DVD_SPEED = 0.28; // of the stage's shorter side per second
const DVD_HUE_STEP = 67;

const clamp = (v: number, lo: number, hi: number) =>
	Math.min(hi, Math.max(lo, v));

/** Overshoots a little before settling, like a pop. */
function easeOutBack(t: number): number {
	const c = 1.70158;
	const u = t - 1;
	return 1 + (c + 1) * u * u * u + c * u * u;
}

/** Goes 0 → len → 0 → len…, and counts how many walls it hit on the way. */
function pingPong(v: number, len: number): [number, number] {
	if (len <= 0) return [0, 0];
	const period = 2 * len;
	const m = ((v % period) + period) % period;
	return [m <= len ? m : period - m, Math.floor(v / len)];
}

/** The visual's centre on a recorded path, which repeats while the meme lasts. Points are fractions of the stage. */
function onPath(
	points: PathPoint[],
	t: number,
	ctx: PoseContext,
): [number, number] {
	if (points.length === 0) return [ctx.cx, ctx.cy];
	const last = points[points.length - 1];
	const local = last.t > 0 ? t % last.t : 0;
	let i = points.findIndex((p) => p.t >= local);
	if (i <= 0) i = i === 0 ? 0 : points.length - 1;
	const a = points[Math.max(0, i - 1)];
	const b = points[i];
	const f = b.t === a.t ? 1 : (local - a.t) / (b.t - a.t);
	return [
		(a.x + (b.x - a.x) * f) * ctx.stageW,
		(a.y + (b.y - a.y) * f) * ctx.stageH,
	];
}

/** Pose of `animation` `t` ms after the meme started. Pure, so the stage and the editor preview share it. */
export function poseAt(
	animation: Animation,
	t: number,
	ctx: PoseContext,
): Pose {
	const { stageW, stageH, w, h, duration } = ctx;
	// keep the visual on screen where the animation stays put
	const cx = clamp(ctx.cx, w / 2, Math.max(w / 2, stageW - w / 2));
	const cy = clamp(ctx.cy, h / 2, Math.max(h / 2, stageH - h / 2));
	// only Pop has its own timings; the rest fade in and out with the defaults
	const enterMs = animation.kind === 'pop' ? animation.enter_ms : POP_IN_MS;
	const exitMs = animation.kind === 'pop' ? animation.exit_ms : POP_OUT_MS;
	const enter = clamp(t / enterMs, 0, 1);
	const exit = clamp((duration - t) / exitMs, 0, 1);
	const base: Pose = {
		x: cx - w / 2,
		y: cy - h / 2,
		scale: 1,
		rotate: 0,
		opacity: Math.min(enter, exit),
		hue: 0,
	};
	const progress = duration > 0 ? clamp(t / duration, 0, 1) : 0;

	switch (animation.kind) {
		case 'static':
			return base;
		case 'pop':
			return {
				...base,
				opacity: exit,
				scale: Math.max(0, easeOutBack(enter)) * (0.6 + 0.4 * exit),
			};
		case 'dvd_bounce': {
			const speed = DVD_SPEED * Math.min(stageW, stageH);
			const travel = (speed * t) / 1000;
			const [x, hitsX] = pingPong(cx - w / 2 + travel, stageW - w);
			const [y, hitsY] = pingPong(cy - h / 2 + travel, stageH - h);
			const hue = animation.colors ? ((hitsX + hitsY) * DVD_HUE_STEP) % 360 : 0;
			return { ...base, x, y, hue };
		}
		case 'bounce': {
			const amp = 0.12 * stageH;
			const hop = Math.abs(Math.sin((Math.PI * t) / 450));
			const squash = 1 - 0.08 * (1 - hop);
			return { ...base, y: base.y - hop * amp, scale: squash };
		}
		case 'shake': {
			const [dx, dy, deg] = SHAKE_MAX.map((max) => max * animation.intensity);
			return {
				...base,
				x: base.x + Math.sin(t * 0.05) * dx,
				y: base.y + Math.cos(t * 0.065) * dy,
				rotate: Math.sin(t * 0.04) * deg,
			};
		}
		case 'cross': {
			const horizontal =
				animation.from === 'left' || animation.from === 'right';
			const span = horizontal ? stageW + w : stageH + h;
			const forward = animation.from === 'left' || animation.from === 'top';
			const along =
				(forward ? progress : 1 - progress) * span - (horizontal ? w : h);
			return horizontal
				? { ...base, x: along, opacity: 1 }
				: { ...base, y: along, opacity: 1 };
		}
		case 'fall': {
			const y = -h + (stageH + 2 * h) * progress * progress;
			return { ...base, y, rotate: progress * 40, opacity: 1 };
		}
		case 'path': {
			const [px, py] = onPath(animation.points, t, ctx);
			return { ...base, x: px - w / 2, y: py - h / 2 };
		}
	}
}

/** The anchor's centre in stage px. `seed` (0..1) places a random anchor. */
export function anchorPoint(
	anchor: Anchor,
	cursor: [number, number],
	stageW: number,
	stageH: number,
	seed: number,
): [number, number] {
	switch (anchor.kind) {
		case 'cursor':
			return [cursor[0] * stageW, cursor[1] * stageH];
		case 'center':
			return [stageW / 2, stageH / 2];
		case 'random':
			return [seed * stageW, ((seed * 7919) % 1) * stageH];
		case 'fixed':
			return [anchor.x * stageW, anchor.y * stageH];
	}
}

/** Visual size in px: its longer side is `size` of the stage's shorter side, keeping the media's aspect ratio. */
export function visualSize(
	size: number,
	naturalW: number | null,
	naturalH: number | null,
	stageW: number,
	stageH: number,
): [number, number] {
	const longSide = size * Math.min(stageW, stageH);
	const nw = naturalW ?? 1;
	const nh = naturalH ?? 1;
	return nw >= nh
		? [longSide, (longSide * nh) / nw]
		: [(longSide * nw) / nh, longSide];
}

/** The pose as a CSS transform plus filter, applied straight to the element each frame. */
export function poseStyle(pose: Pose): {
	transform: string;
	opacity: string;
	filter: string;
} {
	return {
		transform: `translate(${pose.x}px, ${pose.y}px) rotate(${pose.rotate}deg) scale(${pose.scale})`,
		opacity: String(pose.opacity),
		filter: pose.hue ? `hue-rotate(${pose.hue}deg)` : '',
	};
}
