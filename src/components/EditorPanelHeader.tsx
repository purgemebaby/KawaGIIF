import { t } from '../i18n/en';

interface PanelHeaderProps {
	title: string;
	collapsed: boolean;
	onToggle: () => void;
}

// The chevron is drawn pointing right; CSS turns it towards where the panel will move.
function PanelHeader({ title, collapsed, onToggle }: PanelHeaderProps) {
	return (
		<header className="editor-panel-header">
			<h2>{title}</h2>
			<button
				type="button"
				className="editor-panel-tab"
				aria-expanded={!collapsed}
				aria-label={
					collapsed
						? t.editor.panels.expand(title)
						: t.editor.panels.collapse(title)
				}
				onClick={onToggle}
			>
				<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
					<path
						d="M4 2l4 4-4 4"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.6"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			</button>
		</header>
	);
}

export default PanelHeader;
