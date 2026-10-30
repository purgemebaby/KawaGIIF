import './RadialMenu.css';
import { homeTiles, type Screen } from '../navItems';
import SketchIcon from '../ui/SketchIcon';
import {
	RING_INNER,
	RING_OUTER,
	RING_SIZE,
	SECTORS,
	annularSectorPath,
	directionOf,
	labelArcPath,
	outerArcPath,
} from '../../lib/radial';
import type { KeyboardEvent } from 'react';

interface RadialMenuProps {
	onSelect: (id: Screen) => void;
}

// ring units: the 24-unit icon drawn at 2x
const ICON_SIZE = 48;
const CENTRE = RING_SIZE / 2;
// the icon sits a little inside the middle of the ring, leaving the outer band to the label
const ICON_RADIUS = 125;
// the label runs along the inside of the neon line, where the glow lights it up
const LABEL_RADIUS = RING_OUTER - 20;

// The ring and its arcs never change, so they are worked out once.
const SHAPES = SECTORS.map((sector) => {
	const dir = directionOf(sector.id);
	return {
		id: sector.id,
		shape: annularSectorPath(
			CENTRE,
			CENTRE,
			RING_OUTER,
			RING_INNER,
			sector.startDeg,
			sector.endDeg,
		),
		arc: outerArcPath(
			CENTRE,
			CENTRE,
			RING_OUTER,
			sector.startDeg,
			sector.endDeg,
		),
		labelArc: labelArcPath(sector.id, CENTRE, CENTRE, LABEL_RADIUS),
		iconX: CENTRE + dir.x * ICON_RADIUS - ICON_SIZE / 2,
		iconY: CENTRE + dir.y * ICON_RADIUS - ICON_SIZE / 2,
	};
});

/** Home's ring: one icon per sector. Hovering a sector lights its neon edge, and the light reveals its name. */
function RadialMenu({ onSelect }: RadialMenuProps) {
	// read per render, so a language switch relabels the ring without a reload
	const tiles = homeTiles();

	const onKeyDown = (event: KeyboardEvent, id: Screen) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onSelect(id);
	};

	return (
		<svg
			className="radial-menu"
			viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
			role="group"
		>
			<defs>
				<linearGradient id="radial-glow-gradient" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" className="kg-neon-stop-pink" />
					<stop offset="1" className="kg-neon-stop-purple" />
				</linearGradient>
				<filter
					id="radial-glow-blur"
					x="-0.3"
					y="-0.3"
					width="1.6"
					height="1.6"
				>
					<feGaussianBlur stdDeviation="6" />
				</filter>
				{SHAPES.map((s) => (
					<path key={s.id} id={`radial-label-arc-${s.id}`} d={s.labelArc} />
				))}
			</defs>

			{SHAPES.map((s) => {
				const tile = tiles.find((item) => item.id === s.id);
				if (!tile) return null;
				return (
					<g
						key={s.id}
						className="radial-sector icon-hover"
						role="button"
						tabIndex={0}
						aria-label={tile.label}
						onClick={() => onSelect(tile.id)}
						onKeyDown={(event) => onKeyDown(event, tile.id)}
					>
						<path className="radial-shape" d={s.shape} />
						<g className="radial-glow" aria-hidden="true">
							<path className="kg-neon-halo radial-glow-halo" d={s.arc} />
							<path className="kg-neon-line radial-glow-line" d={s.arc} />
						</g>
						{tile.icon && (
							<SketchIcon
								name={tile.icon}
								size={ICON_SIZE}
								x={s.iconX}
								y={s.iconY}
							/>
						)}
						<text className="radial-label" aria-hidden="true">
							<textPath href={`#radial-label-arc-${s.id}`} startOffset="50%">
								{tile.label}
							</textPath>
						</text>
					</g>
				);
			})}
		</svg>
	);
}

export default RadialMenu;
