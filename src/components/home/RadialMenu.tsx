import type { KeyboardEvent } from 'react';
import { HOME_TILES, type Screen } from '../navItems';
import {
	RING_INNER,
	RING_OUTER,
	RING_SIZE,
	SECTORS,
	annularSectorPath,
	directionOf,
	outerArcPath,
} from '../../lib/radial';
import './RadialMenu.css';

interface RadialMenuProps {
	onSelect: (id: Screen) => void;
}

const CENTRE = RING_SIZE / 2;
// A little outside the ring's middle: the diagonal sectors' text blocks are wide and must clear the inner rim.
const LABEL_RADIUS = 145;

function RadialMenu({ onSelect }: RadialMenuProps) {
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
					<stop offset="0" className="radial-stop-pink" />
					<stop offset="1" className="radial-stop-purple" />
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
			</defs>

			{SECTORS.map((sector) => {
				const tile = HOME_TILES.find((item) => item.id === sector.id);
				if (!tile) return null;
				const dir = directionOf(sector.id);
				const x = CENTRE + dir.x * LABEL_RADIUS;
				const y = CENTRE + dir.y * LABEL_RADIUS;
				const arc = outerArcPath(
					CENTRE,
					CENTRE,
					RING_OUTER,
					sector.startDeg,
					sector.endDeg,
				);

				return (
					<g
						key={sector.id}
						className="radial-sector"
						role="button"
						tabIndex={0}
						aria-label={tile.label}
						onClick={() => onSelect(tile.id)}
						onKeyDown={(event) => onKeyDown(event, tile.id)}
					>
						<path
							className="radial-shape"
							d={annularSectorPath(
								CENTRE,
								CENTRE,
								RING_OUTER,
								RING_INNER,
								sector.startDeg,
								sector.endDeg,
							)}
						/>
						<g className="radial-glow" aria-hidden="true">
							<path className="radial-glow-halo" d={arc} />
							<path className="radial-glow-line" d={arc} />
						</g>
						<g transform={`translate(${x} ${y})`} aria-hidden="true">
							<text className="radial-icon">{tile.icon}</text>
							<text className="radial-label">{tile.label}</text>
						</g>
					</g>
				);
			})}
		</svg>
	);
}

export default RadialMenu;
