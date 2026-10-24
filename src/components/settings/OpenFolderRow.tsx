import { invoke } from '../../lib/ipc';
import { t } from '../../i18n';
import SettingsRowText from './SettingsRowText';

function OpenFolderRow() {
	const text = t.settings.openFolder;

	return (
		<div className="settings-row">
			<SettingsRowText text={text} />

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
