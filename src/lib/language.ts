import { createAppEvent } from './appEvent';

const languageEvent = createAppEvent<string>('kg-language-changed');

/** Tells the running app the UI language just switched, so it needn't reload the window. */
export function announceLanguage(code: string) {
	languageEvent.announce(code);
}

/** Calls `onChange` with the new code whenever the language switches. Returns the unsubscribe function. */
export const onLanguageChanged = languageEvent.listen;
