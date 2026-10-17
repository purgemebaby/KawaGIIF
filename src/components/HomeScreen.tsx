import { invoke } from '../lib/ipc';
import KawaTitle from './brand/KawaTitle';
import KawaiiBackdrop from './brand/KawaiiBackdrop';
import RadialMenu from './home/RadialMenu';
import type { Screen } from './navItems';
import { t } from '../i18n/en';

interface HomeScreenProps {
	/** Skips the backdrop while Home is only being measured, so it costs nothing under the folding panels. */
	quiet?: boolean;
	onNavigate: (screen: Screen) => void;
}

function HomeScreen({ quiet = false, onNavigate }: HomeScreenProps) {
	return (
		<div className="home-screen">
			{!quiet && <KawaiiBackdrop />}

			<div className="home-header">
				<KawaTitle size="clamp(46px, 8cqmin, 110px)" />
				<p className="home-subtitle">{t.app.tagline}</p>
			</div>

			<RadialMenu onSelect={onNavigate} />

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
