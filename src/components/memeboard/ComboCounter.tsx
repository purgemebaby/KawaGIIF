import { useMemo, type CSSProperties } from 'react';
import {
	COUNTER_COLORS,
	FLAME_TIERS,
	FLAME_WIDTH,
	flameFrame,
	flameStyle,
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
}

// the number's cells are this much bigger than the layer's cell, so it reads at a glance
const NUMBER_SCALE = 1.7;
// frames of the flame sprite, swapped in turn (MemeLayers.css)
const FLAME_FRAMES = 3;
const INK = 'var(--kg-px-ink, #2b1748)';

/** A fighting-game combo counter, "x2" and up, in pixel art, with flames that grow every `step` presses. */
function ComboCounter({
	combo,
	step,
	windowMs,
	side,
	unit,
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
	const flame = flameStyle(tier);
	const color = COUNTER_COLORS[tier];
	const numberUnit = unit * NUMBER_SCALE;
	const numberW = text.width * numberUnit;
	// the flames' cells are sized so the sprite is the tier's share wider than the number
	const flameUnit = (numberW * FLAME_WIDTH[tier]) / flame.w;

	return (
		<div
			className={`combo-counter combo-counter--${side}`}
			style={{ '--combo-window': `${windowMs}ms` } as CSSProperties}
			aria-hidden="true"
		>
			{tier > 0 && (
				<svg
					className="combo-flames"
					viewBox={`0 0 ${flame.w} ${flame.h}`}
					width={flame.w * flameUnit}
					height={flame.h * flameUnit}
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
			)}
			<svg
				className="combo-number"
				viewBox={`0 0 ${text.width} ${text.height}`}
				width={numberW}
				height={text.height * numberUnit}
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
