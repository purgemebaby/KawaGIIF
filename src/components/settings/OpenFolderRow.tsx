import { invoke } from '../../lib/ipc';
import { t } from '../../i18n';

function OpenFolderRow() {
	const text = t.settings.openFolder;

	return (
		<div className="settings-row">
			<span className="settings-row-text">
				<strong>{text.label}</strong>
				<small>{text.hint}</small>
			</span>

			<button
				type="button"
				className="kg-btn kg-btn--secondary"
				onClick={() => invoke('open_data_folder')}
			>
				{text.button}
			</button>
		</div>
	);
}

export default OpenFolderRow;
