let navAnimations = true;

/** Whether the OS asks for less motion. */
export function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Whether screen changes are animated: the settings toggle, off for users who prefer reduced motion. */
export function navAnimationsOn(): boolean {
	return navAnimations && !prefersReducedMotion();
}

/** Switches navigation animations for the running app, so it needn't reload the config. */
export function announceNavAnimations(enabled: boolean) {
	navAnimations = enabled;
	// CSS freezes the mascots through this attribute instead of a re-render.
	document.documentElement.dataset.navAnimations = enabled ? 'on' : 'off';
}
