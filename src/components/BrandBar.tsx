import { t } from '../i18n/en';
import type { Screen } from './navItems';
import KawaTitle from './brand/KawaTitle';
import './BrandBar.css';

interface BrandBarProps {
	onNavigate: (screen: Screen) => void;
}

/** Top bar inside a section: the static logo, which goes back to Home. */
function BrandBar({ onNavigate }: BrandBarProps) {
	return (
		<nav className="brand-bar" aria-label={t.nav.title}>
			<button
				type="button"
				className="brand-bar-logo"
				onClick={() => onNavigate('home')}
				title={`${t.nav.backHome} (Ctrl+1)`}
				aria-label={t.nav.backHome}
			>
				<KawaTitle size="var(--kg-text-xl)" animated={false} />
			</button>
		</nav>
	);
}

export default BrandBar;
