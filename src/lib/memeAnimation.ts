import { FLAME_BOX } from './comboPixels';
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
	/** How fast the movement runs (1 = normal); the meme's length doesn't change. */
	motionSpeed?: number;
	/** Combo: this press's count. The first press brings the meme in; the next ones only press it like a button. */
	combo?: number;
}

// a fall speeds up like a dropped thing, but gently: the last stretch is not a plunge
const FALL_EASE = 1.4;
const FALL_TURN_DEG = 40;

// the most a combo's first pop may overshoot its size (see below: never more than its margin leaves it)
const COMBO_OVERSHOOT = 0.1;
// pressing a combo meme again dips it a little and lets it spring back, like pressing a button (kg-btn:active)
const COMBO_PRESS_DIP = 0.08;
const COMBO_PRESS_MS = 200;

// a combo fades out slowly when its window runs out
const COMBO_FADE_MS = 600;

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
	const exitMs =
		animation.kind === 'pop'
			? animation.exit_ms
			: animation.kind === 'combo'
				? COMBO_FADE_MS
				: POP_OUT_MS;
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
	// movement time: a faster motion goes through its course sooner (and starts over), a slower one covers less
	const m = t * (ctx.motionSpeed ?? 1);
	const progress =
		duration > 0 ? (m / duration) % 1 || clamp(m / duration, 0, 1) : 0;

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
			const travel = (speed * m) / 1000;
			const [x, hitsX] = pingPong(cx - w / 2 + travel, stageW - w);
			const [y, hitsY] = pingPong(cy - h / 2 + travel, stageH - h);
			const hue = animation.colors ? ((hitsX + hitsY) * DVD_HUE_STEP) % 360 : 0;
			return { ...base, x, y, hue };
		}
		case 'bounce': {
			const amp = 0.12 * stageH;
			const hop = Math.abs(Math.sin((Math.PI * m) / 450));
			const squash = 1 - 0.08 * (1 - hop);
			return { ...base, y: base.y - hop * amp, scale: squash };
		}
		case 'shake': {
			const [dx, dy, deg] = SHAKE_MAX.map((max) => max * animation.intensity);
			return {
				...base,
				x: base.x + Math.sin(m * 0.05) * dx,
				y: base.y + Math.cos(m * 0.065) * dy,
				rotate: Math.sin(m * 0.04) * deg,
			};
		}
		case 'cross': {
			const horizontal =
				animation.from === 'left' || animation.from === 'right';
			const span = horizontal ? stageW + w : stageH + h;
			const forward = animation.from === 'left' || animation.from === 'top';
			const along =
				(forward ? progress : 1 - progress) * span - (horizontal ? w : h);
			// the other axis comes from `at`, kept on screen
			const across = horizontal
				? clamp(animation.at * stageH - h / 2, 0, Math.max(0, stageH - h))
				: clamp(animation.at * stageW - w / 2, 0, Math.max(0, stageW - w));
			return horizontal
				? { ...base, x: along, y: across, opacity: 1 }
				: { ...base, x: across, y: along, opacity: 1 };
		}
		case 'fall': {
			// One fall over the whole meme, from just above the screen to just below it, longer meme, slower fall.
			// Unlike the movements that repeat, it never starts over: a faster animation speed just ends it sooner, and
			// once it is out of sight it stays out of sight (no fade either: it leaves by falling).
			const pad = Math.max(w, h);
			const fallen =
				(duration > 0 ? clamp(m / duration, 0, 1) : 1) ** FALL_EASE;
			const x = clamp(
				animation.at * stageW - w / 2,
				0,
				Math.max(0, stageW - w),
			);
			return {
				...base,
				x,
				y: -pad + (stageH + 2 * pad) * fallen,
				rotate: fallen * FALL_TURN_DEG,
				opacity: enter,
			};
		}
		case 'party':
			// PartyLayer draws the pop-ups; the meme's own layer stays hidden
			return { ...base, opacity: 0 };
		case 'combo': {
			const [x, y] = comboCorner(animation, w, h, stageW, stageH);
			// A press restarts `t`. The first one brings the meme in with a pop, which may overshoot only as far as the
			// margin to the screen's edge allows; the next ones only press it, and it never gets bigger than it is.
			if ((ctx.combo ?? 1) <= 1) {
				const margin = animation.margin * Math.min(stageW, stageH);
				const room =
					1 + Math.min(COMBO_OVERSHOOT, (2 * margin) / Math.max(w, h, 1));
				return {
					...base,
					x,
					y,
					scale: clamp(easeOutBack(enter), 0, room),
					opacity: exit,
				};
			}
			const settling = 1 - clamp(t / COMBO_PRESS_MS, 0, 1);
			return {
				...base,
				x,
				y,
				scale: 1 - COMBO_PRESS_DIP * settling ** 2,
				opacity: exit,
			};
		}
		case 'path': {
			const [px, py] = onPath(animation.points, m, ctx);
			return { ...base, x: px - w / 2, y: py - h / 2 };
		}
	}
}

// a stacked copy moves this share of the stage's shorter side per copy, round a spiral (the golden angle)
const STACK_STEP = 0.06;
const GOLDEN_ANGLE = 2.39996;

type ComboAnimation = Extract<Animation, { kind: 'combo' }>;

/** Top-left of a combo meme: in its corner, `margin` in from the edges. */
function comboCorner(
	animation: ComboAnimation,
	w: number,
	h: number,
	stageW: number,
	stageH: number,
): [number, number] {
	const margin = animation.margin * Math.min(stageW, stageH);
	const right = animation.corner.endsWith('right');
	const bottom = animation.corner.startsWith('bottom');
	return [
		right ? stageW - w - margin : margin,
		bottom ? stageH - h - margin : margin,
	];
}

// the gap between a combo meme and its counter (MemeLayers.css)
const COUNTER_GAP = 12;

/**
 * How far (px) the counter's box, beside the meme on the side facing the middle of the screen and centred on it, has to
 * move so it stays entirely on screen: a top corner has no room above the meme for the flames. `unit` is the cell size.
 */
export function comboCounterShift(
	animation: ComboAnimation,
	w: number,
	h: number,
	stageW: number,
	stageH: number,
	unit: number,
): [number, number] {
	const [x, y] = comboCorner(animation, w, h, stageW, stageH);
	const boxW = FLAME_BOX.w * unit;
	const boxH = FLAME_BOX.h * unit;
	const left = animation.corner.endsWith('right')
		? x - COUNTER_GAP - boxW
		: x + w + COUNTER_GAP;
	const top = y + h / 2 - boxH / 2;
	return [
		clamp(left, 0, Math.max(0, stageW - boxW)) - left,
		clamp(top, 0, Math.max(0, stageH - boxH)) - top,
	];
}

/** The anchor's centre in stage px. `seed` (0..1) places a random anchor; `stack` copies already on screen shift it
 aside, so stacked copies of one meme never sit exactly on top of each other. */
export function anchorPoint(
	anchor: Anchor,
	cursor: [number, number],
	stageW: number,
	stageH: number,
	seed: number,
	stack = 0,
): [number, number] {
	const [x, y] = baseAnchor(anchor, cursor, stageW, stageH, seed);
	if (stack <= 0) return [x, y];
	const reach = STACK_STEP * Math.min(stageW, stageH) * Math.sqrt(stack);
	const angle = stack * GOLDEN_ANGLE;
	return [
		clamp(x + reach * Math.cos(angle), 0, stageW),
		clamp(y + reach * Math.sin(angle), 0, stageH),
	];
}

function baseAnchor(
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
