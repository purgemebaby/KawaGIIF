import { t } from '../i18n/en';

export type Screen = 'home' | 'storage' | 'editor' | 'settings';

interface NavItem {
	id: Screen;
	label: string;
	icon: string;
}

export const NAV_ITEMS: NavItem[] = [
	{ id: 'home', label: t.nav.home, icon: '⌂' },
	{ id: 'storage', label: t.nav.storage, icon: '▤' },
	{ id: 'editor', label: t.nav.editor, icon: '✎' },
	{ id: 'settings', label: t.nav.settings, icon: '⚙' },
];

export const HOME_TILES = NAV_ITEMS.filter((item) => item.id !== 'home');
