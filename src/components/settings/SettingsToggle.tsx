import SettingsRowText from './SettingsRowText';
import './SettingsToggle.css';

interface SettingsToggleProps {
	checked: boolean;
	text: { label: string; hint?: string };
	onChange: (checked: boolean) => void;
}

/** A settings row with a label, an optional hint and a switch. */
function SettingsToggle({ checked, text, onChange }: SettingsToggleProps) {
	return (
		<label className="settings-row settings-row-toggle">
			<SettingsRowText text={text} />
			<span className="settings-switch">
				<input
					type="checkbox"
					role="switch"
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
				/>
				<span className="settings-switch-track" aria-hidden="true" />
			</span>
		</label>
	);
}

export default SettingsToggle;
