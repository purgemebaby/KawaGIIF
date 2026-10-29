import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import type { PathPoint } from '../../lib/memeboard';

interface PathRecorderProps {
	points: PathPoint[];
	maxMs: number;
	onRecorded: (points: PathPoint[]) => void;
}

/** Record / re-record / delete the single path track. Rust runs the countdown and samples the cursor. */
function PathRecorder({ points, onRecorded }: PathRecorderProps) {
	const [recording, setRecording] = useState(false);

	// Escape ends the recording; it must not also close the editor around this
	useEffect(() => {
		if (!recording) return;
		const swallow = (e: KeyboardEvent) => {
			if (e.key === 'Escape') e.preventDefault();
		};
		window.addEventListener('keydown', swallow, true);
		return () => window.removeEventListener('keydown', swallow, true);
	}, [recording]);

	const record = async () => {
		setRecording(true);
		try {
			const recorded = await invoke<PathPoint[]>('record_meme_path');
			// an empty answer is a cancel: keep what was there
			if (recorded.length > 1) onRecorded(recorded);
		} catch (e) {
			notifyError(e);
		} finally {
			setRecording(false);
		}
	};

	const path = t.memeboard.path;
	return (
		<div className="meme-subfield path-recorder">
			<small>
				{points.length > 1 ? path.points(points.length) : path.none}
			</small>
			<div className="path-recorder-actions">
				<button
					type="button"
					className="kg-btn kg-btn--secondary kg-btn--sm"
					disabled={recording}
					onClick={record}
				>
					{points.length > 1 ? path.rerecord : path.record}
				</button>
				{points.length > 1 && (
					<button
						type="button"
						className="kg-btn kg-btn--ghost kg-btn--sm"
						disabled={recording}
						onClick={() => onRecorded([])}
					>
						{path.clear}
					</button>
				)}
			</div>
			<small className="meme-field-note">{path.hint}</small>
		</div>
	);
}

export default PathRecorder;
