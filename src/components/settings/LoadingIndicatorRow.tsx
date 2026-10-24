import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '../../lib/ipc';
import { useLoadingIndicator } from '../../hooks/useLoadingIndicator';
import { t } from '../../i18n';
import loadingIcon from '../../assets/mascot/loading-icon.png';
import './LoadingIndicatorRow.css';

const INDICATOR_EXTENSIONS = ['gif', 'png', 'jpg', 'jpeg'];
const INDICATOR_MAX_PX = 512;

function LoadingIndicatorRow() {
	const { url, refresh } = useLoadingIndicator();
	const [oversized, setOversized] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Every new image gets a new URL, so a broken file falls back to the mascot without a manual reset.
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const text = t.settings.loadingIndicator;
	const showImage = url !== null && url !== failedUrl;

	const choose = async () => {
		const path = await open({
			filters: [{ name: text.filter, extensions: INDICATOR_EXTENSIONS }],
		});
		if (typeof path !== 'string') return;
		try {
			await invoke('set_loading_indicator', { path });
			setError(null);
			await refresh();
		} catch (e) {
			setError(String(e));
		}
	};

	const reset = async () => {
		try {
			await invoke('reset_loading_indicator');
			setError(null);
			await refresh();
		} catch (e) {
			setError(String(e));
		}
	};

	return (
		<div className="settings-row settings-row-indicator">
			{showImage ? (
				<img
					className="settings-indicator-preview"
					src={url}
					alt=""
					draggable={false}
					onLoad={(e) => {
						const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
						setOversized(w !== h || Math.max(w, h) > INDICATOR_MAX_PX);
					}}
					onError={() => setFailedUrl(url)}
				/>
			) : (
				<img
					className="settings-indicator-preview"
					src={loadingIcon}
					alt=""
					draggable={false}
				/>
			)}
			<span className="settings-row-text">
				<strong>{text.label}</strong>
				<small>{text.hint}</small>
				{error && <small className="settings-error">{error}</small>}
				{showImage && oversized && <small>{text.warning}</small>}
				<span className="settings-indicator-actions">
					<button
						className="kg-btn kg-btn--secondary kg-btn--sm"
						onClick={choose}
					>
						{text.choose}
					</button>
					{url && (
						<button className="kg-btn kg-btn--ghost kg-btn--sm" onClick={reset}>
							{text.reset}
						</button>
					)}
				</span>
			</span>
		</div>
	);
}

export default LoadingIndicatorRow;
