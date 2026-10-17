const NAV_ANIMATIONS_EVENT = 'kg-nav-animations';

/** Tells the running app whether navigation animations are now on, so it needn't reload the config. */
export function announceNavAnimations(enabled: boolean) {
	window.dispatchEvent(
		new CustomEvent<boolean>(NAV_ANIMATIONS_EVENT, { detail: enabled }),
	);
}

/** Calls `onChange` whenever the setting changes; returns the unsubscribe function. */
export function onNavAnimationsChanged(onChange: (enabled: boolean) => void) {
	const handler = (e: Event) => onChange((e as CustomEvent<boolean>).detail);
	window.addEventListener(NAV_ANIMATIONS_EVENT, handler);
	return () => window.removeEventListener(NAV_ANIMATIONS_EVENT, handler);
}
