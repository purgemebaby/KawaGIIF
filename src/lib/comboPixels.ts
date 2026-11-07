// Pixel art for the combo counter: a 3x5 font for "x" and the digits, and flame sprites by tier. Everything is cells
// on a grid, drawn as SVG rects with crisp edges.

/** One lit cell: column, row, colour. */
export type Pixel = readonly [number, number, string];

// rows of 3 cells, top to bottom; "1" is lit
const GLYPHS: Record<string, string[]> = {
	// a lowercase x, sitting on the baseline like the digits
	x: ['000', '000', '101', '010', '101'],
	'0': ['111', '101', '101', '101', '111'],
	'1': ['010', '110', '010', '010', '111'],
	'2': ['111', '001', '111', '100', '111'],
	'3': ['111', '001', '111', '001', '111'],
	'4': ['101', '101', '111', '001', '001'],
	'5': ['111', '100', '111', '001', '111'],
	'6': ['111', '100', '111', '101', '111'],
	'7': ['111', '001', '001', '001', '001'],
	'8': ['111', '101', '111', '101', '111'],
	'9': ['111', '101', '111', '001', '111'],
};
const GLYPH_W = 3;
const GLYPH_H = 5;
const GAP = 1;

/** The lit cells of `text` ("x12"), one cell of outline included around them, and the grid's size. */
export function pixelText(text: string): {
	cells: [number, number][];
	width: number;
	height: number;
} {
	const cells: [number, number][] = [];
	[...text].forEach((ch, i) => {
		const rows = GLYPHS[ch];
		if (!rows) return;
		const left = 1 + i * (GLYPH_W + GAP);
		rows.forEach((row, y) =>
			[...row].forEach((on, x) => {
				if (on === '1') cells.push([left + x, 1 + y]);
			}),
		);
	});
	return {
		cells,
		width: text.length * (GLYPH_W + GAP) - GAP + 2,
		height: GLYPH_H + 2,
	};
}

/** The flame tiers: none, faint, orange, big red, blue. */
export const FLAME_TIERS = 4;

/** The box every flame is drawn in, in cells: the same for every tier, so the counter never changes size. */
export const FLAME_BOX = { w: 15, h: 22 };

interface FlameStyle {
	/** How much of the box's width and height the flame fills: it starts small and grows into the whole box. */
	widthShare: number;
	heightShare: number;
	/** Outer, middle and core colours. */
	colors: [string, string, string];
	/** Chance of a loose spark above a column: the fire gets more lively. */
	sparks: number;
	/** Heat above which a cell takes the core colour (lower: a bigger bright core). */
	core: number;
}

const FLAMES: Record<number, FlameStyle> = {
	// a weak little flame at first, filling the box at the last tier
	1: {
		widthShare: 0.5,
		heightShare: 0.42,
		colors: ['#ff9f43', '#ffc76b', '#fff1c1'],
		sparks: 0,
		core: 0.6,
	},
	2: {
		widthShare: 0.68,
		heightShare: 0.64,
		colors: ['#ff6a00', '#ff9a1f', '#ffe08a'],
		sparks: 0.08,
		core: 0.55,
	},
	3: {
		widthShare: 0.86,
		heightShare: 0.84,
		colors: ['#c81414', '#ff3b2f', '#ffb347'],
		sparks: 0.14,
		core: 0.5,
	},
	4: {
		widthShare: 1,
		heightShare: 1,
		colors: ['#1d4ed8', '#3fa9ff', '#d6f6ff'],
		sparks: 0.2,
		core: 0.42,
	},
};

function flameStyle(tier: number): FlameStyle {
	return FLAMES[Math.min(FLAME_TIERS, Math.max(1, tier))];
}

/** A tiny seeded generator, so the sprites are the same on every render. */
function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/**
 * One frame of a flame sprite for `tier`: tongues rising from the bottom, tallest in the middle, flickering from frame
 * to frame. Cells near the base and the centre take the core colour, the edges the outer one.
 */
export function flameFrame(tier: number, frame: number): Pixel[] {
	const { widthShare, heightShare, colors, sparks, core } = flameStyle(tier);
	// an odd width, so the flame has a middle column, centred in the box; it stands on the box's bottom edge
	const w = Math.max(3, 2 * Math.round((FLAME_BOX.w * widthShare - 1) / 2) + 1);
	const h = Math.max(3, Math.round(FLAME_BOX.h * heightShare));
	const left = (FLAME_BOX.w - w) / 2;
	const random = rng(tier * 97 + frame * 31 + 7);
	const centre = (w - 1) / 2;
	const pixels: Pixel[] = [];
	for (let x = 0; x < w; x++) {
		const fromCentre = Math.abs(x - centre) / (centre + 0.5);
		// a column's height: a rounded peak in the middle, plus a flicker that differs per frame
		const top = Math.round(
			h * (1 - fromCentre ** 1.6) * (0.72 + random() * 0.28),
		);
		for (let y = 0; y < top; y++) {
			const heat = (1 - y / h) * (1 - fromCentre);
			const color =
				heat > core ? colors[2] : heat > 0.25 ? colors[1] : colors[0];
			pixels.push([left + x, FLAME_BOX.h - 1 - y, color]);
		}
		// a loose spark above some columns, if the box has room for it
		if (top > 2 && h - top - 2 >= 0 && random() < sparks) {
			pixels.push([left + x, FLAME_BOX.h - 1 - (top + 2), colors[0]]);
		}
	}
	return pixels;
}

/** The counter's colour by tier: it heats up with the flames. */
export const COUNTER_COLORS = [
	'#ffffff',
	'#fff1c1',
	'#ffe08a',
	'#ffd2c2',
	'#d6f6ff',
];
