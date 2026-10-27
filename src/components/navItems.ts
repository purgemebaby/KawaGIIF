import { t } from '../i18n';
import type { SketchIconName } from '../lib/sketchIcons';

// Menus
export type Screen = 'home' | 'storage' | 'editor' | 'settings';

/** The `Screen` values in nav order. */
export const SCREENS: Screen[] = ['home', 'storage', 'editor', 'settings'];

interface NavItem {
	id: Screen;
	label: string;
	/** Shown on the home ring. Home itself is not on it. */
	icon?: SketchIconName;
}

/** The nav items, labelled on each call so a language switch relabels them without a reload. */
function navItems(): NavItem[] {
	return [
		{ id: 'home', label: t.nav.home },
		{ id: 'storage', label: t.nav.storage, icon: 'folder' },
		{ id: 'editor', label: t.nav.editor, icon: 'pencil' },
		{ id: 'settings', label: t.nav.settings, icon: 'gear' },
	];
}

/** The home ring's tiles: every screen except home itself. */
export function homeTiles(): NavItem[] {
	return navItems().filter((item) => item.id !== 'home');
}
