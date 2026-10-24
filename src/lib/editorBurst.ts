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

/** One panel's own frame: its box size and the ring centre, all in local px. */
interface Frame {
	rx: number;
	ry: number;
	w: number;
	h: number;
}

/** One keyframe's placement: where the centre lands, plus the drop's own spin and stretch. */
interface Pose {
	orbit: number;
	cx: number;
	cy: number;
	spin: number;
	sx: number;
	sy: number;
}

const SPIN_DEG = 360;
const SPIN_MS = 700;
// speeds up to the end, so the ring hands off to the panels without stopping
const SPIN_EASING = 'cubic-bezier(0.5, 0, 0.8, 0.65)';
// the sector melts into a drop, the drop flies, then it expands into the panel
const MORPH_MS = 200;
const TRAVEL_MS = 340;
const EXPAND_MS = 320;
// smallest gap between two sectors leaving the ring
const PEEL_GAP_MS = 200;
// the drop's diameter in flight, stretched across its path at mid-travel
const BLOB_PX = 56;
const DROP_STRETCH = 1.6;
const DROP_SQUASH = 0.7;
// the drop lands with a small overshoot, like it wobbles into place
const EXPAND_EASING = 'cubic-bezier(0.3, 1.4, 0.6, 1)';
// the ring's speed at the end of SPIN_EASING (end slope 1.75 x 360deg / 700ms), so the hand-off never slows down
const ORBIT_DEG_PER_MS = 0.9;
// the orbit angle the fling sweeps while it slows the sector from the orbit speed to rest
const FLING_DEG = (ORBIT_DEG_PER_MS * MORPH_MS) / 2;
// starts at the orbit speed and eases out: the sector is flung, not stopped
const FLING_EASING = 'cubic-bezier(0.33, 0.66, 0.66, 1)';
const HOME_FADE_MS = 500;
const MASCOT_EXIT_MS = 450;

const SECTOR_POINTS = 48;
// The finished polygon reaches past the panel so its shadow is not clipped at the end.
const END_BLEED_PX = 16;

const HOME_FADED = '.home-header, .home-actions, .kawaii-backdrop';
const BRAND_FADED = '.brand-bar';
const HINT_FADED = '.editor-canvas-hint';
const HINT_HOLD = 0.9; // the hint waits for the panels to land

let handoff: RingHandoff | null = null;

/** Remembers where the ring is on screen. Call it before the ring turns. */
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

/** One full turn about the ring centre. `reverse` turns back from the spun position. */
export function spinRing(ring: Element, reverse: boolean): Animation {
	return ring.animate(
		[{ transform: 'rotate(0deg)' }, { transform: `rotate(${SPIN_DEG}deg)` }],
		{
			duration: SPIN_MS,
			easing: SPIN_EASING,
			direction: direction(reverse),
			fill: 'both',
		},
	);
}

/** Fades the selected elements in or out. `holdUntil` holds them hidden first. */
function fade(
	root: Element,
	selector: string,
	appearing: boolean,
	duration: number,
	holdUntil = 0,
): Animation[] {
	const frames: Keyframe[] =
		holdUntil > 0
			? [
					{ offset: 0, opacity: 0 },
					{ offset: holdUntil, opacity: 0 },
					{ offset: 1, opacity: 1 },
				]
			: [{ opacity: 0 }, { opacity: 1 }];
	return [...root.querySelectorAll(selector)].map((el) =>
		el.animate(frames, {
			duration,
			easing: 'ease-out',
			direction: direction(!appearing),
			fill: 'both',
		}),
	);
}

/** The chibi slips out past the left edge, the way it slides in. Coming back, Home's own greeting brings it in. */
function hideMascot(home: Element): Animation[] {
	return [...home.querySelectorAll('.home-mascot')].map((mascot) =>
		mascot.animate(
			{ translate: '-120% 0', opacity: 0 },
			{ duration: MASCOT_EXIT_MS, easing: 'ease-in', fill: 'both' },
		),
	);
}

/** Fades the title, buttons and backdrop away, or back in when `reverse`. The chibi leaves sideways. */
export function fadeHome(home: Element, reverse: boolean): Animation[] {
	const fades = fade(home, HOME_FADED, reverse, HOME_FADE_MS);
	return reverse ? fades : [...fades, ...hideMascot(home)];
}

/** Resolves when every animation ends, or rejects if one is cancelled. */
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

/** The inscribed ellipse's ring, in the panel's own frame, whose point rotation lies nearest to the start points. */
function ellipseFor(start: Point[], width: number, height: number): Point[] {
	const n = start.length;
	const base = Array.from({ length: n }, (_, k): Point => {
		const angle = (2 * Math.PI * k) / n;
		return [
			width / 2 + (width / 2) * Math.cos(angle),
			height / 2 + (height / 2) * Math.sin(angle),
		];
	});
	// no corners to align here, only a phase: try every shift, both directions
	const shifted = (s: number, step: number) =>
		Array.from({ length: n }, (_, k) => base[(s + step * k + n) % n]);
	const candidates = base.flatMap((_, s) => [shifted(s, 1), shifted(s, -1)]);
	return candidates.reduce((best, next) =>
		distanceSum(start, next) < distanceSum(start, best) ? next : best,
	);
}

function polygonCss(points: Point[]): string {
	return `polygon(${points.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`;
}

/** The same points as an SVG path, so an outline can morph with the clip. */
function pathCss(points: Point[]): string {
	const [[x0, y0], ...rest] = points;
	const lineTo = ([x, y]: Point) => `L ${x.toFixed(1)} ${y.toFixed(1)}`;
	return `path("M ${x0.toFixed(1)} ${y0.toFixed(1)} ${rest.map(lineTo).join(' ')} Z")`;
}

/** The panel transform: the orbit about the ring, then the centre's place, spin and stretch. */
function pose(frame: Frame, { orbit, cx, cy, spin, sx, sy }: Pose): string {
	const { rx, ry, w, h } = frame;
	// the same function list in every keyframe, so each function interpolates on its own
	return [
		`translate(${rx}px, ${ry}px)`,
		`rotate(${orbit}deg)`,
		`translate(${-rx}px, ${-ry}px)`,
		`translate(${cx}px, ${cy}px)`,
		`rotate(${spin}deg)`,
		`scale(${sx}, ${sy})`,
		`translate(${-w / 2}px, ${-h / 2}px)`,
	].join(' ');
}

/** Point rotated about `centre` by `deg`, in screen degrees. */
function rotateAbout([x, y]: Point, [cx, cy]: Point, deg: number): Point {
	const rad = (deg * Math.PI) / 180;
	const dx = x - cx;
	const dy = y - cy;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

/** The point a keyframe names so it lands on `p` once the fixed orbit angle is applied. */
function unorbit(p: Point, centre: Point, thetaDeg: number): Point {
	return rotateAbout(p, centre, -thetaDeg);
}

/** The angle equal to `deg` modulo `period` that lies nearest to `near`, so a keyframe never adds a needless twirl. */
function nearestTurn(deg: number, near: number, period: number): number {
	return deg + period * Math.round((near - deg) / period);
}

/** Runs `cleanup` once the animation ends or is cancelled. */
function onSettled(animation: Animation, cleanup: () => void) {
	animation.addEventListener('finish', cleanup);
	animation.addEventListener('cancel', cleanup);
}

/** The orbit angle at which the sector, after its fling, points at its panel. */
function detachDeg(
	box: DOMRect,
	ring: RingHandoff,
	sectorId: SectorId,
): number {
	const sector = boundsOf(
		sectorPolygon(
			sectorId,
			SECTOR_POINTS,
			ring.cx,
			ring.cy,
			ring.rOuter,
			ring.rInner,
		),
	);
	// screen degrees from the ring centre, the convention the orbit turns in
	const bearing = ([x, y]: Point): number =>
		(Math.atan2(y - ring.cy, x - ring.cx) * 180) / Math.PI;
	const phi0 = bearing([
		sector.left + sector.width / 2,
		sector.top + sector.height / 2,
	]);
	const phiT = bearing([box.left + box.width / 2, box.top + box.height / 2]);
	return (((phiT - phi0 - FLING_DEG) % 360) + 360) % 360;
}

/** One panel rides the ring, melts into a drop, flies to its box and expands into place. */
function flyPanel(
	panel: HTMLElement,
	box: DOMRect,
	ring: RingHandoff,
	reverse: boolean,
	leave: number,
	detach: number,
	total: number,
): Animation[] {
	if (!box.width || !box.height) return [];
	const w = box.width;
	const h = box.height;
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
		((x - from.left) / from.width) * w,
		((y - from.top) / from.height) * h,
	];

	// everything below happens in the panel's own frame, which is where the polygon is interpolated
	const start = sector.map(fromLocal);
	const frame: Frame = { rx: ring.cx - box.left, ry: ring.cy - box.top, w, h };
	const centre: Point = [frame.rx, frame.ry];
	const offsetOf = (t: number): number => t / total;
	// the ride ends at `detach`. The fling then carries the orbit FLING_DEG further
	const thetaF = detach + FLING_DEG;
	const startCentre: Point = [
		from.left - box.left + from.width / 2,
		from.top - box.top + from.height / 2,
	];
	const target: Point = [w / 2, h / 2];
	// where the drop starts flying: the sector centre carried round by the ride and fling
	const startWorld = rotateAbout(startCentre, centre, thetaF);
	const dirDeg =
		(Math.atan2(target[1] - startWorld[1], target[0] - startWorld[0]) * 180) /
		Math.PI;
	const midCentre = unorbit(lerp(startWorld, target, 0.5), centre, thetaF);
	const placedCentre = unorbit(target, centre, thetaF);
	const sectorPose: Pose = {
		orbit: 0,
		cx: startCentre[0],
		cy: startCentre[1],
		spin: 0,
		sx: from.width / w,
		sy: from.height / h,
	};
	// the orbit adds thetaF back. An ellipse repeats every 180deg and the placed panel every 360deg, so take the nearest turns
	const dropSpin = nearestTurn(dirDeg - thetaF, 0, 180);
	const placedSpin = nearestTurn(-thetaF, dropSpin, 360);
	const ridingPose: Pose = { ...sectorPose, orbit: detach };
	const meltPose: Pose = {
		orbit: thetaF,
		cx: startCentre[0],
		cy: startCentre[1],
		spin: dropSpin,
		sx: BLOB_PX / w,
		sy: BLOB_PX / h,
	};
	const midPose: Pose = {
		orbit: thetaF,
		cx: midCentre[0],
		cy: midCentre[1],
		spin: dropSpin,
		sx: (BLOB_PX * DROP_STRETCH) / w,
		sy: (BLOB_PX * DROP_SQUASH) / h,
	};
	const arrivePose: Pose = {
		orbit: thetaF,
		cx: placedCentre[0],
		cy: placedCentre[1],
		spin: placedSpin,
		sx: BLOB_PX / w,
		sy: BLOB_PX / h,
	};
	const placedPose: Pose = { ...arrivePose, sx: 1, sy: 1 };
	// the sector melts into an ellipse, which unfolds into the panel's rectangle
	const ellipse = ellipseFor(start, w, h);
	const rectangle = rectangleFor(ellipse, w, h);
	const startClip = polygonCss(start);
	const dropClip = polygonCss(ellipse);
	const endClip = polygonCss(rectangle);
	const startD = pathCss(start);
	const dropD = pathCss(ellipse);
	const endD = pathCss(rectangle);
	const reveal = leave + MORPH_MS + TRAVEL_MS;

	panel.style.willChange = 'transform, clip-path';
	const shape = panel.animate(
		[
			{
				offset: 0,
				easing: 'linear',
				transform: pose(frame, sectorPose),
				clipPath: startClip,
				transformOrigin: '0 0',
			},
			{
				offset: offsetOf(leave),
				easing: FLING_EASING,
				// it kept turning with the ring until it pointed at its panel
				transform: pose(frame, ridingPose),
				clipPath: startClip,
				transformOrigin: '0 0',
			},
			{
				offset: offsetOf(leave + MORPH_MS),
				easing: 'ease-in',
				transform: pose(frame, meltPose),
				clipPath: dropClip,
				transformOrigin: '0 0',
			},
			{
				offset: offsetOf(leave + MORPH_MS + TRAVEL_MS / 2),
				easing: 'ease-out',
				transform: pose(frame, midPose),
				clipPath: dropClip,
				transformOrigin: '0 0',
			},
			{
				offset: offsetOf(leave + MORPH_MS + TRAVEL_MS),
				easing: EXPAND_EASING,
				transform: pose(frame, arrivePose),
				clipPath: dropClip,
				transformOrigin: '0 0',
			},
			{
				offset: offsetOf(reveal + EXPAND_MS),
				transform: pose(frame, placedPose),
				clipPath: endClip,
				transformOrigin: '0 0',
			},
			{
				offset: 1,
				transform: pose(frame, placedPose),
				clipPath: endClip,
				transformOrigin: '0 0',
			},
		],
		{ duration: total, direction: direction(reverse), fill: 'both' },
	);
	onSettled(shape, () => panel.style.removeProperty('will-change'));

	// the squashed content stays hidden until the drop starts expanding into the panel
	const content = [...panel.children].map((child) =>
		child.animate(
			[
				{ offset: 0, opacity: 0 },
				{ offset: offsetOf(reveal + EXPAND_MS / 2), opacity: 0 },
				{ offset: offsetOf(reveal + EXPAND_MS), opacity: 1 },
			],
			{ duration: total, direction: direction(reverse), fill: 'both' },
		),
	);

	// a keyline that traces the same deformation as the clip and fades out with the expand
	const outline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	outline.classList.add('kg-burst-outline');
	const outlinePath = document.createElementNS(
		'http://www.w3.org/2000/svg',
		'path',
	);
	outline.appendChild(outlinePath);
	panel.appendChild(outline);
	// the absolutely placed outline needs a positioned ancestor
	panel.style.position = 'relative';
	const trace = outlinePath.animate(
		[
			{ offset: 0, easing: 'linear', d: startD, opacity: 1 },
			{ offset: offsetOf(leave), easing: FLING_EASING, d: startD, opacity: 1 },
			{
				offset: offsetOf(leave + MORPH_MS),
				easing: 'ease-in',
				d: dropD,
				opacity: 1,
			},
			{
				offset: offsetOf(leave + MORPH_MS + TRAVEL_MS / 2),
				easing: 'ease-out',
				d: dropD,
				opacity: 1,
			},
			{
				offset: offsetOf(leave + MORPH_MS + TRAVEL_MS),
				easing: EXPAND_EASING,
				d: dropD,
				opacity: 1,
			},
			{ offset: offsetOf(reveal + EXPAND_MS), d: endD, opacity: 0 },
			{ offset: 1, d: endD, opacity: 0 },
		],
		{ duration: total, direction: direction(reverse), fill: 'both' },
	);
	onSettled(shape, () => {
		outline.remove();
		panel.style.removeProperty('position');
	});

	return [shape, ...content, trace];
}

/** Each `[data-burst]` panel peels off the ring into its box at its own angle, or back when `reverse`. */
export function burstPanels(container: Element, reverse: boolean): Animation[] {
	const ring = handoff;
	if (!ring) return [];
	const panels = [...container.querySelectorAll<HTMLElement>('[data-burst]')];
	// measure every box before the first animation starts
	const boxes = panels.map((panel) => panel.getBoundingClientRect());
	// every panel leaves once it points at its own box, but at least PEEL_GAP_MS after the previous one, so the rest of the ring keeps turning
	const leaves = panels.map(
		(panel, i) =>
			detachDeg(boxes[i], ring, panel.dataset.burst as SectorId) /
			ORBIT_DEG_PER_MS,
	);
	const order = leaves.map((_, i) => i).sort((a, b) => leaves[a] - leaves[b]);
	order.slice(1).forEach((i, k) => {
		leaves[i] = Math.max(leaves[i], leaves[order[k]] + PEEL_GAP_MS);
	});
	const detaches = leaves.map((leave) => leave * ORBIT_DEG_PER_MS);
	const total = Math.max(0, ...leaves) + MORPH_MS + TRAVEL_MS + EXPAND_MS;
	return [
		...panels.flatMap((panel, i) =>
			flyPanel(panel, boxes[i], ring, reverse, leaves[i], detaches[i], total),
		),
		...fade(container, BRAND_FADED, !reverse, total),
		...fade(container, HINT_FADED, !reverse, total, HINT_HOLD),
	];
}
