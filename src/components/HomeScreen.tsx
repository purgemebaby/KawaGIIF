import { invoke } from '../lib/ipc';
import KawaTitle from './brand/KawaTitle';
import KawaiiBackdrop from './brand/KawaiiBackdrop';
import { HOME_TILES, type Screen } from './navItems';
import { t } from '../i18n/en';

interface HomeScreenProps {
	onNavigate: (screen: Screen) => void;
}

function HomeScreen({ onNavigate }: HomeScreenProps) {
	return (
		<div className="home-screen">
			<KawaiiBackdrop />

			<div className="home-header">
				{/* shares `kg-brand` with the tabs' logo, so the title shrinks into it */}
				<div className="home-brand">
					<KawaTitle size="clamp(46px, 8cqmin, 110px)" />
				</div>
				<p className="home-subtitle">{t.app.tagline}</p>
			</div>

			<div className="home-tiles">
				{HOME_TILES.map((tile) => (
					<button
						key={tile.id}
						type="button"
						className="home-tile"
						style={{ viewTransitionName: `kg-section-${tile.id}` }}
						onClick={() => onNavigate(tile.id)}
					>
						<span className="home-tile-icon" aria-hidden="true">
							{tile.icon}
						</span>
						<span className="home-tile-title">{tile.label}</span>
						<span className="home-tile-desc">
							<span>{tile.desc}</span>
						</span>
					</button>
				))}
			</div>

			<div className="home-actions">
				<button
					type="button"
					className="kg-btn kg-btn--secondary"
					onClick={() => invoke('hide_control_window')}
				>
					{t.home.minimizeToTray}
				</button>
				<button
					type="button"
					className="kg-btn kg-btn--danger"
					onClick={() => invoke('kill_all_overlays')}
					title={t.home.panic.description}
				>
					{t.home.panic.button}
				</button>
			</div>
		</div>
	);
}

export default HomeScreen;
