import { invoke } from '../lib/ipc';
import { useMascotShown } from '../hooks/useMascotShown';
import KawaTitle from './brand/KawaTitle';
import KawaiiBackdrop from './brand/KawaiiBackdrop';
import RadialMenu from './home/RadialMenu';
import HomeMascot from './mascot/HomeMascot';
import SketchIcon from './ui/SketchIcon';
import type { Screen } from './navItems';
import { t } from '../i18n';

interface HomeScreenProps {
	/** Skips the backdrop while Home is only being measured, so it costs nothing under the folding panels. */
	quiet?: boolean;
	/** The loading screen still covers Home, so the mascot waits to greet. */
	booting?: boolean;
	onNavigate: (screen: Screen) => void;
}

function HomeScreen({
	quiet = false,
	booting = false,
	onNavigate,
}: HomeScreenProps) {
	const showMascot = useMascotShown();

	return (
		<div className="home-screen">
			{!quiet && <KawaiiBackdrop />}

			<div className="home-header">
				<KawaTitle size="clamp(46px, 8cqmin, 110px)" />
			</div>

			<RadialMenu onSelect={onNavigate} />

			{showMascot && !quiet && !booting && <HomeMascot />}

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
					className="kg-btn kg-btn--danger icon-hover"
					onClick={() => invoke('kill_all_overlays')}
					title={t.home.panic.description}
				>
					<SketchIcon name="skull" />
					{t.home.panic.button}
				</button>
			</div>
		</div>
	);
}

export default HomeScreen;
