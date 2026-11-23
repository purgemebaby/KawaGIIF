import { useMemo, type CSSProperties } from 'react';
import {
	COUNTER_COLORS,
	FLAME_BOX,
	FLAME_TIERS,
	flameFrame,
	pixelText,
} from '../../lib/comboPixels';
import './MemeLayers.css';

interface ComboCounterProps {
	combo: number;
	/** Every this many presses the flames grow a tier. */
	step: number;
	/** How long the combo lasts without a press: the flames die down over it. */
	windowMs: number;
	/** Which side of the meme it sits on: the one facing the middle of the screen. */
	side: 'left' | 'right';
	/** Size of one pixel-art cell, in px. */
	unit: number;
	/** How far to move so the box stays on screen (comboCounterShift). */
	shift: [number, number];
}

// frames of the flame sprite, swapped in turn (MemeLayers.css)
const FLAME_FRAMES = 3;
const INK = 'var(--kg-px-ink, #2b1748)';

/**
 * A fighting-game combo counter, "x2" and up, in pixel art. Every cell, the number's and the flames', is `unit` px: the
 * flames grow every `step` presses by being drawn with more cells, never with bigger ones.
 */
function ComboCounter({
	combo,
	step,
	windowMs,
	side,
	unit,
	shift,
}: ComboCounterProps) {
	const tier = Math.min(FLAME_TIERS, Math.floor(combo / step));
	const text = useMemo(() => pixelText(`x${combo}`), [combo]);
	const frames = useMemo(
		() =>
			tier > 0
				? Array.from({ length: FLAME_FRAMES }, (_, f) => flameFrame(tier, f))
				: [],
		[tier],
	);
	if (combo < 2) return null;
	const color = COUNTER_COLORS[tier];

	return (
		<div
			className={`combo-counter combo-counter--${side}`}
			style={
				{
					'--combo-window': `${windowMs}ms`,
					'--combo-dx': `${shift[0]}px`,
					'--combo-dy': `${shift[1]}px`,
				} as CSSProperties
			}
			aria-hidden="true"
		>
			{/* the box is there at every tier, empty before the first flame: the counter never changes size */}
			<svg
				className="combo-flames"
				viewBox={`0 0 ${FLAME_BOX.w} ${FLAME_BOX.h}`}
				width={FLAME_BOX.w * unit}
				height={FLAME_BOX.h * unit}
				shapeRendering="crispEdges"
			>
				{frames.map((pixels, f) => (
					<g key={f} className="combo-flame-frame">
						{pixels.map(([x, y, fill], i) => (
							<rect key={i} x={x} y={y} width={1} height={1} fill={fill} />
						))}
					</g>
				))}
			</svg>
			<svg
				className="combo-number"
				viewBox={`0 0 ${text.width} ${text.height}`}
				width={text.width * unit}
				height={text.height * unit}
				shapeRendering="crispEdges"
			>
				{/* a one-cell dark outline under the digits, like a sprite */}
				{text.cells.map(([x, y], i) => (
					<rect
						key={`o${i}`}
						x={x - 1}
						y={y - 1}
						width={3}
						height={3}
						fill={INK}
					/>
				))}
				{text.cells.map(([x, y], i) => (
					<rect key={i} x={x} y={y} width={1} height={1} fill={color} />
				))}
			</svg>
		</div>
	);
}

export default ComboCounter;
