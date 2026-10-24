import { t } from '../../i18n';
import { ZOOM_MAX, ZOOM_MIN, applyZoomStep } from '../../lib/zoom';
import SettingsRowText from './SettingsRowText';
import './ZoomRow.css';

interface ZoomRowProps {
	zoom: number;
}

function ZoomRow({ zoom }: ZoomRowProps) {
	const text = t.settings.zoom;

	return (
		<div className="settings-row">
			<SettingsRowText text={text} />

			<div className="zoom-controls">
				<button
					type="button"
					className="kg-btn kg-btn--secondary kg-btn--sm"
					onClick={() => applyZoomStep(zoom, -1)}
					disabled={zoom <= ZOOM_MIN}
					aria-label={text.zoomOut}
				>
					−
				</button>
				<span className="zoom-value">{Math.round(zoom * 100)} %</span>
				<button
					type="button"
					className="kg-btn kg-btn--secondary kg-btn--sm"
					onClick={() => applyZoomStep(zoom, 1)}
					disabled={zoom >= ZOOM_MAX}
					aria-label={text.zoomIn}
				>
					+
				</button>
				<button
					type="button"
					className="kg-btn kg-btn--secondary kg-btn--sm zoom-reset"
					onClick={() => applyZoomStep(zoom, 0)}
					aria-label={text.reset}
				>
					{text.reset}
				</button>
			</div>
		</div>
	);
}

export default ZoomRow;
