import './RadialMenu.css';
import { homeTiles, type Screen } from '../navItems';
import SketchIcon from '../ui/SketchIcon';
import {
	RING_INNER,
	RING_OUTER,
	RING_SIZE,
	SECTORS,
	annularSectorPath,
	bestLabelRadius,
	directionOf,
	outerArcPath,
} from '../../lib/radial';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

interface RadialMenuProps {
	onSelect: (id: Screen) => void;
}

// where the label group sits until the first measure picks the best radius
const DEFAULT_LABEL_RADIUS = 145;
// ring units: the 24-unit icon drawn at 2x
const ICON_SIZE = 48;
// small sideways nudges so each icon sits optically centred over its label
const ICON_NUDGE: Partial<Record<Screen, number>> = {};
const CENTRE = RING_SIZE / 2;
// room left between a label and its sector edge, viewBox units
const LABEL_MARGIN = 6;
// must match the translateY of .radial-label (RadialMenu.css)
const LABEL_DROP = 0.9;

function RadialMenu({ onSelect }: RadialMenuProps) {
	// read per render, so a language switch relabels the ring without a reload
	const tiles = homeTiles();
	const svgRef = useRef<SVGSVGElement>(null);
	const labelRefs = useRef(new Map<string, SVGTextElement>());
	const labelKey = tiles.map((tile) => tile.label).join('|');
	const [labelRadius, setLabelRadius] = useState(DEFAULT_LABEL_RADIUS);

	// Measured in viewBox units, so the window size never matters; the label text, font and font scale do, so it
	// runs again when the labels change, once the font has loaded, and on resize (a font-scale change reflows it).
	useLayoutEffect(() => {
		const measure = () => {
			const texts = SECTORS.map((sector) => labelRefs.current.get(sector.id));
			for (const text of texts) if (text) text.style.fontSize = '';
			const size = texts[0]
				? parseFloat(getComputedStyle(texts[0]).fontSize) || 0
				: 0;
			// one radius and one scale for every label, so all four look the same
			const { radius, half } = bestLabelRadius(
				size * LABEL_DROP,
				ICON_SIZE / 2 + 4,
			);
			const room = Math.max(0, 2 * (half - LABEL_MARGIN));
			const longest = Math.max(
				0,
				...texts.map((text) => text?.getComputedTextLength() ?? 0),
			);
			setLabelRadius(radius);
			if (longest <= room || longest === 0) return;
			// set straight on the elements: React never sets this style, so a re-render can't undo it
			const scale = (room / longest).toFixed(3);
			for (const text of texts) {
				if (text)
					text.style.fontSize = `calc(var(--radial-label-size) * ${scale})`;
			}
		};
		measure();
		document.fonts?.ready.then(measure).catch(() => {});
		const svg = svgRef.current;
		if (!svg) return;
		const observer = new ResizeObserver(measure);
		observer.observe(svg);
		return () => observer.disconnect();
	}, [labelKey]);

	const onKeyDown = (event: KeyboardEvent, id: Screen) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		onSelect(id);
	};

	return (
		<svg
			ref={svgRef}
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
			</defs>

			{SECTORS.map((sector) => {
				const tile = tiles.find((item) => item.id === sector.id);
				if (!tile) return null;
				const dir = directionOf(sector.id);
				const x = CENTRE + dir.x * labelRadius;
				const y = CENTRE + dir.y * labelRadius;
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
						className="radial-sector icon-hover"
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
							<path className="kg-neon-halo radial-glow-halo" d={arc} />
							<path className="kg-neon-line radial-glow-line" d={arc} />
						</g>
						<g transform={`translate(${x} ${y})`} aria-hidden="true">
							{tile.icon && (
								<SketchIcon
									name={tile.icon}
									size={ICON_SIZE}
									x={-ICON_SIZE / 2 + (ICON_NUDGE[tile.id] ?? 0)}
									y={-ICON_SIZE - 4}
								/>
							)}
							<text
								className="radial-label"
								ref={(el) => {
									if (el) labelRefs.current.set(sector.id, el);
									else labelRefs.current.delete(sector.id);
								}}
							>
								{tile.label}
							</text>
						</g>
					</g>
				);
			})}
		</svg>
	);
}

export default RadialMenu;
