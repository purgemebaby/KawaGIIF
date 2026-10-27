// Hand-drawn (Excalidraw-like) icons: wobbly shapes on a 24x24 grid with a ~2-unit margin, filled with `--kg-px-*` tokens.

import { type Point } from './sketch';

export type SketchShape =
	| { points: readonly Point[]; closed?: boolean; fill?: string }
	| { ellipse: readonly [number, number, number, number]; fill?: string };

/** Points round a circle alternating two radii: a gear's teeth or a sparkle's rays. */
function starPoints(
	cx: number,
	cy: number,
	outer: number,
	inner: number,
	count: number,
	turn: number,
): readonly Point[] {
	return Array.from({ length: count * 2 }, (_, i): Point => {
		const angle = (i * Math.PI) / count + turn;
		const r = i % 2 === 0 ? outer : inner;
		return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
	});
}

/** One short leg growing out of the chip's square (d is a unit axis). */
function pin(x: number, y: number, dx: number, dy: number): readonly Point[] {
	return [
		[x, y],
		[x + dx * 1.8, y + dy * 1.8],
	];
}

export const SKETCH_ICONS = {
	folder: {
		closed: [
			{
				points: [
					[3, 19],
					[3, 5],
					[7, 5],
					[9, 7],
					[21, 7],
					[21, 19],
				],
				closed: true,
				fill: 'var(--kg-px-sun)',
			},
			{
				points: [
					[5.5, 10],
					[18.5, 10],
					[18.5, 17],
					[5.5, 17],
				],
				closed: true,
				fill: 'var(--kg-px-pink)',
			},
		],
		open: [
			{
				points: [
					[3, 19],
					[3, 5],
					[7, 5],
					[9, 7],
					[21, 7],
					[21, 19],
				],
				closed: true,
				fill: 'var(--kg-px-sun)',
			},
			{
				// the front flap, swung forward and up
				points: [
					[5, 15.5],
					[8.5, 5],
					[20.5, 8.5],
					[17, 18.5],
				],
				closed: true,
				fill: 'var(--kg-px-pink)',
			},
		],
	},
	pencil: {
		base: [
			{
				points: [
					[15.8, 3.8],
					[18.2, 6.2],
					[9.2, 15.2],
					[6.8, 12.8],
				],
				closed: true,
				fill: 'var(--kg-px-sun)',
			},
			{
				points: [
					[6.8, 12.8],
					[9.2, 15.2],
					[5, 17],
				],
				closed: true,
				fill: 'var(--kg-px-light)',
			},
			{
				points: [
					[15.8, 3.8],
					[18.2, 6.2],
					[19.8, 4.6],
					[17.4, 2.2],
				],
				closed: true,
				fill: 'var(--kg-px-pink)',
			},
		],
	},
	gear: {
		base: [
			{
				points: starPoints(12, 12, 9.5, 6.4, 8, Math.PI / 16),
				closed: true,
				fill: 'var(--kg-px-purple)',
			},
			{ ellipse: [12, 12, 2.8, 2.8], fill: 'var(--kg-px-deep)' },
		],
	},
	trash: {
		can: [
			{
				points: [
					[7.5, 7.5],
					[16.5, 7.5],
					[15.5, 19.5],
					[8.5, 19.5],
				],
				closed: true,
				fill: 'var(--kg-px-sky)',
			},
			{
				points: [
					[10.7, 10],
					[10.5, 17],
				],
			},
			{
				points: [
					[13.3, 10],
					[13.5, 17],
				],
			},
		],
		lid: [
			{
				points: [
					[5, 5],
					[19, 5],
					[19, 7],
					[5, 7],
				],
				closed: true,
				fill: 'var(--kg-px-purple)',
			},
			{
				// the little handle over the bar
				points: [
					[9.5, 5],
					[9.5, 3],
					[14.5, 3],
					[14.5, 5],
				],
			},
		],
	},
	power: {
		base: [
			{
				// a ~300 degree arc, the gap sits at the top
				points: [
					[15.5, 6.9],
					[18.5, 10.3],
					[18.8, 14.8],
					[16.3, 18.6],
					[12, 20],
					[7.7, 18.6],
					[5.2, 14.8],
					[5.5, 10.3],
					[8.5, 6.9],
				],
			},
			{
				points: [
					[12, 4.5],
					[12, 11],
				],
			},
		],
	},
	palette: {
		base: [
			{
				points: [
					[12, 4],
					[18, 6],
					[20.5, 12],
					[18, 18],
					[11, 20],
					[5.5, 16],
					[4, 9.5],
					[7, 5.5],
				],
				closed: true,
				fill: 'var(--kg-px-light)',
			},
			{ ellipse: [9, 9.5, 1.8, 1.8], fill: 'var(--kg-px-pink)' },
			{ ellipse: [14.5, 8.5, 1.6, 1.6], fill: 'var(--kg-px-sky)' },
			{ ellipse: [11, 13.5, 1.5, 1.5], fill: 'var(--kg-px-sun)' },
			// the thumb hole, left as an outline
			{ ellipse: [16.5, 15.5, 2.2, 2.2] },
		],
	},
	sparkles: {
		base: [
			{
				points: starPoints(11, 12, 7.5, 2.2, 4, -Math.PI / 2),
				closed: true,
				fill: 'var(--kg-px-sun)',
			},
			{
				points: starPoints(19, 5.5, 2.6, 0.9, 4, -Math.PI / 2),
				closed: true,
				fill: 'var(--kg-px-sun)',
			},
			{
				points: starPoints(18.5, 18.5, 2.4, 0.8, 4, -Math.PI / 2),
				closed: true,
				fill: 'var(--kg-px-sun)',
			},
		],
	},
	chip: {
		base: [
			{
				points: [
					[8, 4.5],
					[16, 4.5],
					[19.5, 8],
					[19.5, 16],
					[16, 19.5],
					[8, 19.5],
					[4.5, 16],
					[4.5, 8],
				],
				closed: true,
				fill: 'var(--kg-px-purple)',
			},
			{
				points: [
					[9.5, 9.5],
					[14.5, 9.5],
					[14.5, 14.5],
					[9.5, 14.5],
				],
				closed: true,
				fill: 'var(--kg-px-deep)',
			},
			// three short legs per side, grown out of the square
			...[-3.5, 0, 3.5].flatMap((o): SketchShape[] => [
				{ points: pin(12 + o, 4.5, 0, -1) },
				{ points: pin(12 + o, 19.5, 0, 1) },
				{ points: pin(4.5, 12 + o, -1, 0) },
				{ points: pin(19.5, 12 + o, 1, 0) },
			]),
		],
	},
	skull: {
		base: [
			{
				points: [
					[12, 3.5],
					[17.5, 5.5],
					[19.5, 10.5],
					[18, 15],
					[14, 17.5],
					[10, 17.5],
					[6, 15],
					[4.5, 10.5],
				],
				closed: true,
				fill: 'var(--kg-px-white)',
			},
			{
				points: [
					[9, 15.5],
					[9, 17.5],
				],
			},
			{
				points: [
					[12, 16],
					[12, 18.2],
				],
			},
			{
				points: [
					[15, 15.5],
					[15, 17.5],
				],
			},
		],
		eyes: [
			{ ellipse: [8.7, 11, 2, 2.4], fill: 'var(--kg-px-pink)' },
			{ ellipse: [15.3, 11, 2, 2.4], fill: 'var(--kg-px-pink)' },
		],
	},
	reset: {
		base: [
			{
				// three quarters round, the gap sits at the top left
				points: [
					[13.9, 4.8],
					[18.4, 8.4],
					[19.1, 13.9],
					[15.9, 18.4],
					[10.1, 19.1],
					[5.4, 15.6],
					[4.9, 10.1],
					[6.7, 6.7],
				],
			},
			{
				// the head, chasing the arc round clockwise
				points: [
					[7.9, 7.9],
					[9, 4.4],
					[5.5, 5.5],
				],
				closed: true,
				fill: 'var(--kg-px-pink)',
			},
		],
	},
} satisfies Record<string, Record<string, readonly SketchShape[]>>;

export type SketchIconName = keyof typeof SKETCH_ICONS;
