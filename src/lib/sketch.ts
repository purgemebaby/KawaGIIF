// Tiny hand-drawn stroke renderer: every stroke wobbles the same way forever, so icons look
// sketched but stay stable between renders (no rough.js, no Math.random).

export type Point = readonly [number, number];

/** Seeded PRNG (mulberry32): the same seed always gives the same wobble. */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A seed from a string, so every icon stroke keeps its own fixed wobble. */
export function seedOf(text: string): number {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h = Math.imul(h ^ text.charCodeAt(i), 16777619);
	}
	return h >>> 0;
}

/** Every point drifts by up to `roughness` on both axes. */
function jitter(
	points: readonly Point[],
	rng: () => number,
	roughness: number,
): Point[] {
	return points.map(([x, y]): Point => [
		x + (rng() * 2 - 1) * roughness,
		y + (rng() * 2 - 1) * roughness,
	]);
}

/** A 2-point line bows: a midpoint pushed sideways so straight lines look hand-drawn too. */
function bow(
	pts: readonly Point[],
	rng: () => number,
	roughness: number,
): Point[] {
	const [[x0, y0], [x1, y1]] = pts;
	const len = Math.hypot(x1 - x0, y1 - y0) || 1;
	const push = (rng() * 2 - 1) * roughness;
	const mid: Point = [
		(x0 + x1) / 2 - ((y1 - y0) / len) * push,
		(y0 + y1) / 2 + ((x1 - x0) / len) * push,
	];
	return [pts[0], mid, pts[1]];
}

/** A point moved `by` further away from `away`, so open strokes overshoot their ends. */
function extended(p: Point, away: Point, by: number): Point {
	const len = Math.hypot(p[0] - away[0], p[1] - away[1]) || 1;
	return [
		p[0] + ((p[0] - away[0]) / len) * by,
		p[1] + ((p[1] - away[1]) / len) * by,
	];
}

/** Catmull-Rom through `pts`, written as cubic Béziers (endpoints borrow their neighbour). */
function curvePath(pts: readonly Point[]): string {
	const at = (i: number): Point =>
		pts[Math.max(0, Math.min(i, pts.length - 1))];
	const n = (v: number) => v.toFixed(2);
	let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
	for (let i = 0; i < pts.length - 1; i++) {
		const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
		d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)}`;
		d += ` ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)}`;
		d += ` ${n(p2[0])} ${n(p2[1])}`;
	}
	return d;
}

/** Two wobbly path strings for one stroke: a hand-drawn line is never one clean pass. */
export function sketchStroke(
	points: readonly Point[],
	options: { seed: number; closed?: boolean; roughness?: number },
): [string, string] {
	const roughness = options.roughness ?? 0.6;
	const draw = (pass: number): string => {
		const rng = seededRandom(options.seed * 2 + pass);
		let pts = jitter(points, rng, roughness);
		if (pts.length === 2) pts = bow(pts, rng, roughness);
		if (options.closed) {
			// repeat the join so the loop overlaps a little, like a real closed doodle
			pts = [...pts, pts[0], pts[1]];
		} else {
			const last = pts.length - 1;
			pts = [
				extended(pts[0], pts[1], roughness),
				...pts.slice(1, last),
				extended(pts[last], pts[last - 1], roughness),
			];
		}
		return curvePath(pts);
	};
	return [draw(0), draw(1)];
}

/** Two wobbly path strings for an ellipse: 10 points over ~1.08 turns, so the loop overlaps its start. */
export function sketchEllipse(
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	seed: number,
	roughness = 0.5,
): [string, string] {
	const draw = (pass: number): string => {
		const rng = seededRandom(seed * 2 + pass);
		const start = rng() * Math.PI * 2;
		const pts = Array.from({ length: 10 }, (_, i): Point => {
			const angle = start + (i / 9) * Math.PI * 2 * 1.08;
			const jx = rx + (rng() * 2 - 1) * (roughness / 2);
			const jy = ry + (rng() * 2 - 1) * (roughness / 2);
			return [cx + Math.cos(angle) * jx, cy + Math.sin(angle) * jy];
		});
		return curvePath(pts);
	};
	return [draw(0), draw(1)];
}
