import {
	RING_INNER,
	RING_OUTER,
	RING_SIZE,
	sectorPolygon,
	type SectorId,
} from './radial';

type Point = [number, number];

interface Rect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** The ring in client px: what Home leaves behind for the Editor panels. */
interface RingHandoff {
	cx: number;
	cy: number;
	rOuter: number;
	rInner: number;
}

const SPIN_DEG = 720;
const SPIN_MS = 900;
const FLY_MS = 600;
const FLY_EASING = 'cubic-bezier(0.34, 1.2, 0.64, 1)';
const HOME_FADE_MS = 500;

const SECTOR_POINTS = 48;
// The finished polygon reaches past the panel so its shadow is not clipped at the end.
const END_BLEED_PX = 16;

const HOME_FADED = '.home-header, .home-actions, .kawaii-backdrop';
const EDITOR_FADED = '.brand-bar, .editor-canvas-hint';

let handoff: RingHandoff | null = null;

/** Remembers where the ring is on screen; call it before the ring turns. */
export function captureRing(svg: SVGSVGElement) {
	const rect = svg.getBoundingClientRect();
	const scale = rect.width / RING_SIZE;
	handoff = {
		cx: rect.left + rect.width / 2,
		cy: rect.top + rect.height / 2,
		rOuter: RING_OUTER * scale,
		rInner: RING_INNER * scale,
	};
}

function direction(reverse: boolean): PlaybackDirection {
	return reverse ? 'reverse' : 'normal';
}

/** Two full turns about the ring centre; `reverse` turns back from the spun position. */
export function spinRing(ring: Element, reverse: boolean): Animation {
	return ring.animate(
		[{ transform: 'rotate(0deg)' }, { transform: `rotate(${SPIN_DEG}deg)` }],
		{
			duration: SPIN_MS,
			easing: 'ease-in-out',
			direction: direction(reverse),
			fill: 'both',
		},
	);
}

function fade(
	root: Element,
	selector: string,
	appearing: boolean,
	duration: number,
): Animation[] {
	return [...root.querySelectorAll(selector)].map((el) =>
		el.animate([{ opacity: 0 }, { opacity: 1 }], {
			duration,
			easing: 'ease-out',
			direction: direction(!appearing),
			fill: 'both',
		}),
	);
}

/** Fades the title, buttons and backdrop away, or back in when `reverse`. */
export function fadeHome(home: Element, reverse: boolean): Animation[] {
	return fade(home, HOME_FADED, reverse, HOME_FADE_MS);
}

/** Resolves when every animation ends; rejects if one is cancelled. */
export function allFinished(animations: Animation[]): Promise<void> {
	return Promise.all(animations.map((a) => a.finished)).then(() => undefined);
}

function boundsOf(points: Point[]): Rect {
	const xs = points.map(([x]) => x);
	const ys = points.map(([, y]) => y);
	const left = Math.min(...xs);
	const top = Math.min(...ys);
	return {
		left,
		top,
		width: Math.max(...xs) - left,
		height: Math.max(...ys) - top,
	};
}

function lerp([ax, ay]: Point, [bx, by]: Point, t: number): Point {
	return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

/** `count` points clockwise round the corners, indexed like sectorPolygon: long side, bare edge, long side, bare edge. */
function ringAround(corners: Point[], count: number): Point[] {
	const outer = Math.floor(count / 2);
	const starts = [0, outer - 1, outer, count - 1, count];
	return corners.flatMap((corner, side) => {
		const length = starts[side + 1] - starts[side];
		return Array.from({ length }, (_, i) =>
			lerp(corner, corners[(side + 1) % 4], i / length),
		);
	});
}

function distanceSum(a: Point[], b: Point[]): number {
	return a.reduce(
		(sum, [x, y], i) => sum + (x - b[i][0]) ** 2 + (y - b[i][1]) ** 2,
		0,
	);
}

/** The rectangle's ring, in the panel's own frame, whose corner rotation lies nearest to the start points. */
function rectangleFor(start: Point[], width: number, height: number): Point[] {
	const corners: Point[] = [
		[-END_BLEED_PX, -END_BLEED_PX],
		[width + END_BLEED_PX, -END_BLEED_PX],
		[width + END_BLEED_PX, height + END_BLEED_PX],
		[-END_BLEED_PX, height + END_BLEED_PX],
	];
	const candidates = corners.map((_, k) =>
		ringAround([...corners.slice(k), ...corners.slice(0, k)], start.length),
	);
	return candidates.reduce((best, next) =>
		distanceSum(start, next) < distanceSum(start, best) ? next : best,
	);
}

function polygonCss(points: Point[]): string {
	return `polygon(${points.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
}

/** Releases will-change once the panel's animation ends or is cancelled. */
function releaseWillChange(panel: HTMLElement, animation: Animation) {
	const release = () => panel.style.removeProperty('will-change');
	animation.addEventListener('finish', release);
	animation.addEventListener('cancel', release);
}

/** One panel from its sector's outline to its own box: a FLIP transform plus a polygon that morphs into the rectangle. */
function flyPanel(
	panel: HTMLElement,
	box: DOMRect,
	ring: RingHandoff,
	reverse: boolean,
): Animation[] {
	if (!box.width || !box.height) return [];
	const sector = sectorPolygon(
		panel.dataset.burst as SectorId,
		SECTOR_POINTS,
		ring.cx,
		ring.cy,
		ring.rOuter,
		ring.rInner,
	);
	const from = boundsOf(sector);
	const fromLocal = ([x, y]: Point): Point => [
		((x - from.left) / from.width) * box.width,
		((y - from.top) / from.height) * box.height,
	];

	// everything below happens in the panel's own frame, which is where the polygon is interpolated
	const start = sector.map(fromLocal);
	panel.style.willChange = 'transform, clip-path';
	const shape = panel.animate(
		[
			{
				transform: `translate(${from.left - box.left}px, ${from.top - box.top}px) scale(${from.width / box.width}, ${from.height / box.height})`,
				clipPath: polygonCss(start),
				transformOrigin: '0 0',
			},
			{
				transform: 'translate(0px, 0px) scale(1, 1)',
				clipPath: polygonCss(rectangleFor(start, box.width, box.height)),
				transformOrigin: '0 0',
			},
		],
		{
			duration: FLY_MS,
			easing: FLY_EASING,
			direction: direction(reverse),
			fill: 'both',
		},
	);
	releaseWillChange(panel, shape);

	// the squashed content stays hidden until the panel has nearly reached its box
	const content = [...panel.children].map((child) =>
		child.animate(
			[{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }],
			{ duration: FLY_MS, direction: direction(reverse), fill: 'both' },
		),
	);
	return [shape, ...content];
}

/** Each `[data-burst]` panel flies from its sector's outline to its box, or back when `reverse`. */
export function burstPanels(container: Element, reverse: boolean): Animation[] {
	const ring = handoff;
	if (!ring) return [];
	const panels = [...container.querySelectorAll<HTMLElement>('[data-burst]')];
	// measure every box before the first animation starts
	const boxes = panels.map((panel) => panel.getBoundingClientRect());
	return [
		...panels.flatMap((panel, i) => flyPanel(panel, boxes[i], ring, reverse)),
		...fade(container, EDITOR_FADED, !reverse, FLY_MS),
	];
}
