import { t } from '../../i18n';
import type { PathPoint } from '../../lib/memeboard';

interface PathRecorderProps {
	points: PathPoint[];
	onClear: () => void;
}

/** What the drawn path holds and how to draw it; the drawing itself happens on the preview. */
function PathRecorder({ points, onClear }: PathRecorderProps) {
	const path = t.memeboard.path;
	const has = points.length > 1;
	return (
		<div className="meme-field path-recorder">
			<small className="meme-field-note">{path.draw}</small>
			<div className="path-recorder-actions">
				<small>{has ? path.points(points.length) : path.none}</small>
				{has && (
					<button
						type="button"
						className="kg-btn kg-btn--ghost kg-btn--sm"
						onClick={onClear}
					>
						{path.clear}
					</button>
				)}
			</div>
		</div>
	);
}

export default PathRecorder;
