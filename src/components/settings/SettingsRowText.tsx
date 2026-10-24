import type { ReactNode } from 'react';

interface SettingsRowTextProps {
	text: { label: string; hint: string };
	children?: ReactNode;
}

/** A row's label and hint. Children add extra lines (error, warning, actions). */
function SettingsRowText({ text, children }: SettingsRowTextProps) {
	return (
		<span className="settings-row-text">
			<strong>{text.label}</strong>
			<small>{text.hint}</small>
			{children}
		</span>
	);
}

export default SettingsRowText;
