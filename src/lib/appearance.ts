import type { AppConfig } from './config';

type Appearance = Pick<AppConfig, 'ui_font' | 'font_scale'>;

const FALLBACK_STACK = "system-ui, 'Segoe UI', sans-serif";

// Quotes and backslashes are stripped so a font name can't break out of the CSS string.
export function fontStack(family: string | null): string {
	const clean = family?.replace(/["\\]/g, '').trim();
	return clean ? `"${clean}", ${FALLBACK_STACK}` : FALLBACK_STACK;
}

// Control window only: the overlay bundle must not import this (it has no UI text).
export function applyAppearance({ ui_font, font_scale }: Appearance) {
	const root = document.documentElement.style;
	root.setProperty('--kg-font-ui', fontStack(ui_font));
	root.setProperty('--kg-font-scale', String(font_scale));
}
