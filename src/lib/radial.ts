export type SectorId = 'storage' | 'editor' | 'settings';

interface Sector {
	id: SectorId;
	centreDeg: number;
	startDeg: number;
	endDeg: number;
}

type Point = [number, number];

/** Ring geometry in viewBox units, shared by every radial view. */
export const RING_SIZE = 420;
export const RING_OUTER = 190;
export const RING_INNER = 80;

const SECTOR_SPAN_DEG = 120;
const SECTOR_GAP_DEG = 3;

// Screen degrees, clockwise from +x (y down).
const CENTRES: Record<SectorId, number> = {
	storage: 330,
	editor: 90,
	settings: 210,
};

function sectorOf(id: SectorId): Sector {
	const centreDeg = CENTRES[id];
	const half = (SECTOR_SPAN_DEG - SECTOR_GAP_DEG) / 2;
	return {
		id,
		centreDeg,
		startDeg: centreDeg - half,
		endDeg: centreDeg + half,
	};
}

export const SECTORS: Sector[] = (Object.keys(CENTRES) as SectorId[]).map(
	sectorOf,
);

function pointAt(cx: number, cy: number, r: number, deg: number): Point {
	const rad = (deg * Math.PI) / 180;
	return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function fmt([x, y]: Point): string {
	return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

function arcTo(r: number, large: number, sweep: number, to: Point): string {
	return `A ${r} ${r} 0 ${large} ${sweep} ${fmt(to)}`;
}

function largeArcFlag(startDeg: number, endDeg: number): number {
	return Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
}

/** Closed SVG path of the ring slice between two angles. */
export function annularSectorPath(
	cx: number,
	cy: number,
	rOuter: number,
	rInner: number,
	startDeg: number,
	endDeg: number,
): string {
	const large = largeArcFlag(startDeg, endDeg);
	return [
		`M ${fmt(pointAt(cx, cy, rOuter, startDeg))}`,
		arcTo(rOuter, large, 1, pointAt(cx, cy, rOuter, endDeg)),
		`L ${fmt(pointAt(cx, cy, rInner, endDeg))}`,
		arcTo(rInner, large, 0, pointAt(cx, cy, rInner, startDeg)),
		'Z',
	].join(' ');
}

/** Open SVG path of the outer arc only (the glow stroke). */
export function outerArcPath(
	cx: number,
	cy: number,
	r: number,
	startDeg: number,
	endDeg: number,
): string {
	const large = largeArcFlag(startDeg, endDeg);
	return `M ${fmt(pointAt(cx, cy, r, startDeg))} ${arcTo(r, large, 1, pointAt(cx, cy, r, endDeg))}`;
}

/** Unit vector from the ring centre towards the sector centre. */
export function directionOf(id: SectorId): { x: number; y: number } {
	const [x, y] = pointAt(0, 0, 1, CENTRES[id]);
	return { x, y };
}

function sampleArc(
	cx: number,
	cy: number,
	r: number,
	fromDeg: number,
	toDeg: number,
	count: number,
): Point[] {
	return Array.from({ length: count }, (_, i) => {
		const t = count > 1 ? i / (count - 1) : 0.5;
		return pointAt(cx, cy, r, fromDeg + (toDeg - fromDeg) * t);
	});
}

/** Sector outline as exactly `points` vertices: outer arc forwards, inner arc back. */
export function sectorPolygon(
	id: SectorId,
	points: number,
	cx: number,
	cy: number,
	rOuter: number,
	rInner: number,
): Point[] {
	const { startDeg, endDeg } = sectorOf(id);
	const outerCount = Math.floor(points / 2);
	return [
		...sampleArc(cx, cy, rOuter, startDeg, endDeg, outerCount),
		...sampleArc(cx, cy, rInner, endDeg, startDeg, points - outerCount),
	];
}
