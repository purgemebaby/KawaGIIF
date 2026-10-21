import { createAppEvent } from './appEvent';

const navAnimationsEvent = createAppEvent<boolean>('kg-nav-animations');

let navAnimations = true;

/** Whether screen changes are animated: the settings toggle, off for users who prefer reduced motion. */
export function navAnimationsOn(): boolean {
	return (
		navAnimations &&
		!window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/** Tells the running app whether navigation animations are now on, so it needn't reload the config. */
export function announceNavAnimations(enabled: boolean) {
	navAnimations = enabled;
	navAnimationsEvent.announce(enabled);
}

/** Calls `onChange` whenever the setting changes; returns the unsubscribe function. */
export const onNavAnimationsChanged = navAnimationsEvent.listen;
