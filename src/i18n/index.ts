import { en, type Strings } from './en';
import { es } from './es';

const DICTIONARIES: Record<string, Strings> = { en, es };

/** Languages offered in Settings, each named in itself. */
export const LANGUAGES = [
	{ code: 'en', name: 'English' },
	{ code: 'es', name: 'Español' },
] as const;

/** Every visible string, in the active language. */
export let t: Strings = en;

/** Switches `t`. Call it before the screens are imported, since some modules read `t` when they load. */
export function applyLanguage(language: string) {
	t = DICTIONARIES[language] ?? en;
	document.documentElement.lang = language in DICTIONARIES ? language : 'en';
}
