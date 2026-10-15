import { t } from '../i18n/en';
import { HOME_TILES, NAV_ITEMS, type Screen } from './navItems';
import './SectionTabs.css';

interface SectionTabsProps {
	active: Screen;
	onNavigate: (screen: Screen) => void;
}

const shortcutOf = (id: Screen) =>
	`Ctrl+${NAV_ITEMS.findIndex((item) => item.id === id) + 1}`;

/**
 * Top strip shown inside a section. Each tab shares its `view-transition-name` with its Home tile, and the logo with
 * the Home title, so going in or out of Home morphs one into the other.
 */
function SectionTabs({ active, onNavigate }: SectionTabsProps) {
	return (
		<nav className="section-tabs" aria-label={t.nav.title}>
			<button
				type="button"
				className="section-tabs-brand"
				onClick={() => onNavigate('home')}
				title={`${t.nav.backHome} (${shortcutOf('home')})`}
			>
				{t.app.name}
			</button>

			<div className="section-tabs-list" role="tablist">
				{HOME_TILES.map((item) => {
					const selected = item.id === active;
					return (
						<button
							key={item.id}
							type="button"
							role="tab"
							aria-selected={selected}
							className={selected ? 'section-tab active' : 'section-tab'}
							style={{ viewTransitionName: `kg-section-${item.id}` }}
							onClick={() => onNavigate(item.id)}
							title={`${item.label} (${shortcutOf(item.id)})`}
						>
							<span className="section-tab-icon" aria-hidden="true">
								{item.icon}
							</span>
							<span>{item.label}</span>
							{selected && <span className="section-tab-indicator" />}
						</button>
					);
				})}
			</div>
		</nav>
	);
}

export default SectionTabs;
