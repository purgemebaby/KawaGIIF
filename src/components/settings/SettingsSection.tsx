import type { ReactNode } from 'react';

interface SettingsSectionProps {
	title: string;
	icon: ReactNode;
	children: ReactNode;
}

/** A titled card that groups related settings rows. */
function SettingsSection({ title, icon, children }: SettingsSectionProps) {
	return (
		<section className="settings-section">
			<header className="settings-section-header">
				<span className="settings-section-badge" aria-hidden="true">
					{icon}
				</span>
				<div className="settings-section-heading">
					<h2>{title}</h2>
				</div>
			</header>
			<div className="settings-section-body">{children}</div>
		</section>
	);
}

export default SettingsSection;
