import { useState } from 'react';
import updateChibi from '../../assets/mascot/update.webp';
import { useAvailableUpdate } from '../../hooks/useAvailableUpdate';
import { useMascotShown } from '../../hooks/useMascotShown';
import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import type { Point } from '../../lib/sketch';
import { t } from '../../i18n';
import SketchFrame from '../ui/SketchFrame';
import './UpdateNotice.css';

// The card outline, drawn like the editor's speech bubble.
const CARD: readonly Point[] = [
	[2, 10],
	[4, 4],
	[10, 2],
	[50, 2],
	[90, 2],
	[96, 4],
	[98, 10],
	[98, 46],
	[96, 54],
	[90, 56],
	[50, 56],
	[10, 56],
	[4, 54],
	[2, 46],
];

// Home's optional card while the backend found a newer release.
function UpdateNotice() {
	const { version, dismiss } = useAvailableUpdate();
	const showMascot = useMascotShown();
	const [installing, setInstalling] = useState(false);

	if (!version) return null;

	// Success never resolves: the app restarts into the new version.
	const install = () => {
		setInstalling(true);
		invoke('install_update').catch((error: unknown) => {
			notifyError(error);
			setInstalling(false);
		});
	};

	return (
		<aside className="update-notice" aria-live="polite">
			<SketchFrame
				className="update-notice-frame"
				viewBox="0 0 100 56"
				seed="update-notice"
				points={CARD}
				roughness={1.6}
			/>
			{showMascot && (
				<img
					className="update-notice-chibi"
					src={updateChibi}
					alt=""
					draggable={false}
					decoding="async"
				/>
			)}
			<p className="update-notice-title">{t.update.title(version)}</p>
			<div className="update-notice-row">
				<button
					type="button"
					className="kg-btn kg-btn--primary"
					disabled={installing}
					onClick={install}
				>
					{installing ? t.update.installing : t.update.install}
				</button>
				<button
					type="button"
					className="update-notice-dismiss"
					aria-label={t.update.dismiss}
					title={t.update.dismiss}
					onClick={dismiss}
				>
					✕
				</button>
			</div>
		</aside>
	);
}

export default UpdateNotice;
