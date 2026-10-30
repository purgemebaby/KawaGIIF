export type SectorId = 'storage' | 'editor' | 'memeboard' | 'settings';

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

const SECTOR_SPAN_DEG = 90;
const SECTOR_GAP_DEG = 3;

// Screen degrees, clockwise from +x (y down).
const CENTRES: Record<SectorId, number> = {
	storage: 315,
	memeboard: 45,
	editor: 135,
	settings: 225,
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

/** Point on a circle of `r` at screen angle `deg` (y down). */
export function pointAt(cx: number, cy: number, r: number, deg: number): Point {
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

/** Whether a point (relative to the ring centre) lies inside a sector's slice of the ring. */
function insideSector(sector: Sector, x: number, y: number): boolean {
	const r = Math.hypot(x, y);
	if (r < RING_INNER || r > RING_OUTER) return false;
	const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
	const start = ((sector.startDeg % 360) + 360) % 360;
	const end = start + (sector.endDeg - sector.startDeg);
	return (
		(deg >= start && deg <= end) || (deg + 360 >= start && deg + 360 <= end)
	);
}

/**
 * How far a horizontal label centred at (x, y) (relative to the ring centre, viewBox units) can reach to each side
 * before leaving its sector. Walks outwards a unit at a time: cheap, and right for any sector count.
 */
export function freeHalfWidth(id: SectorId, x: number, y: number): number {
	const sector = sectorOf(id);
	let half = 0;
	while (
		half < RING_OUTER &&
		insideSector(sector, x - half - 1, y) &&
		insideSector(sector, x + half + 1, y)
	) {
		half += 1;
	}
	return half;
}

/**
 * The one label radius that gives the tightest sector the most room: a label sits `drop` below its point and its icon
 * `rise` above, so in the lower sectors the label is nearer the outer edge than in the upper ones. Scans the ring in
 * whole units and returns the radius and the half-width it leaves.
 */
export function bestLabelRadius(
	drop: number,
	rise: number,
): { radius: number; half: number } {
	let best = { radius: (RING_INNER + RING_OUTER) / 2, half: 0 };
	for (let r = RING_INNER + 10; r <= RING_OUTER - 10; r += 1) {
		let worst = Infinity;
		for (const sector of SECTORS) {
			const [x, y] = pointAt(0, 0, r, sector.centreDeg);
			// the icon must stay inside its sector too
			if (!insideSector(sector, x, y - rise)) {
				worst = 0;
				break;
			}
			worst = Math.min(worst, freeHalfWidth(sector.id, x, y + drop));
		}
		if (worst > best.half) best = { radius: r, half: worst };
	}
	return best;
}
