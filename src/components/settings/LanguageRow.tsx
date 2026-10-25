import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import { LANGUAGES, t } from '../../i18n';
import SettingsRowText from './SettingsRowText';

interface LanguageRowProps {
	language: string;
}

function LanguageRow({ language }: LanguageRowProps) {
	const text = t.settings.language;

	// Reloads the window: some modules read `t` at load time.
	const switchTo = async (code: string) => {
		if (code === language) return;
		try {
			await invoke('set_language', { language: code });
		} catch (e) {
			notifyError(e);
			return;
		}
		window.location.reload();
	};

	return (
		<div className="settings-row">
			<SettingsRowText text={text} />

			<span className="settings-language">
				{LANGUAGES.map(({ code, name }) => (
					<button
						key={code}
						type="button"
						className={
							code === language
								? 'kg-btn kg-btn--primary'
								: 'kg-btn kg-btn--secondary'
						}
						aria-pressed={code === language}
						onClick={() => switchTo(code)}
					>
						{name}
					</button>
				))}
			</span>
		</div>
	);
}

export default LanguageRow;
