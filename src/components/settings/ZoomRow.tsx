import { useEffect, useState } from 'react';
import { invoke } from '../../lib/ipc';
import { t } from '../../i18n/en';
import {
	ZOOM_MAX,
	ZOOM_MIN,
	announceZoom,
	nextZoom,
	onZoomAnnounced,
} from '../../lib/zoom';
import './ZoomRow.css';

interface ZoomRowProps {
	zoom: number;
	onZoomChange: (zoom: number) => void;
}

function ZoomRow({ zoom: savedZoom, onZoomChange }: ZoomRowProps) {
	const text = t.settings.zoom;

	// Follows the keyboard shortcuts too.
	const [zoom, setZoom] = useState(savedZoom);
	useEffect(
		() =>
			onZoomAnnounced((applied) => {
				setZoom(applied);
				onZoomChange(applied);
			}),
		[onZoomChange],
	);

	const apply = async (direction: 1 | -1 | 0) => {
		announceZoom(
			await invoke<number>('set_ui_zoom', {
				zoom: nextZoom(zoom, direction),
			}),
		);
	};

	return (
		<div className="settings-row">
			<span className="settings-row-text">
				<strong>{text.label}</strong>
				<small>{text.hint}</small>
			</span>

			<div className="zoom-controls">
				<button
					type="button"
					className="kg-btn kg-btn--secondary kg-btn--sm"
					onClick={() => apply(-1)}
					disabled={zoom <= ZOOM_MIN}
					aria-label={text.zoomOut}
				>
					−
				</button>
				<span className="zoom-value">{Math.round(zoom * 100)} %</span>
				<button
					type="button"
					className="kg-btn kg-btn--secondary kg-btn--sm"
					onClick={() => apply(1)}
					disabled={zoom >= ZOOM_MAX}
					aria-label={text.zoomIn}
				>
					+
				</button>
				<button
					type="button"
					className="kg-btn kg-btn--secondary kg-btn--sm zoom-reset"
					onClick={() => apply(0)}
					aria-label={text.reset}
				>
					{text.reset}
				</button>
			</div>
		</div>
	);
}

export default ZoomRow;
