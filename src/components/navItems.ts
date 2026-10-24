import { t } from '../i18n';
import type { SketchIconName } from '../lib/sketchIcons';

// Menus
export type Screen = 'home' | 'storage' | 'editor' | 'settings';

interface NavItem {
	id: Screen;
	label: string;
	/** Shown on the home ring. Home itself is not on it. */
	icon?: SketchIconName;
}

export const NAV_ITEMS: NavItem[] = [
	{ id: 'home', label: t.nav.home },
	{ id: 'storage', label: t.nav.storage, icon: 'folder' },
	{ id: 'editor', label: t.nav.editor, icon: 'pencil' },
	{ id: 'settings', label: t.nav.settings, icon: 'gear' },
];

export const HOME_TILES = NAV_ITEMS.filter((item) => item.id !== 'home');
