import { createAppEvent } from './appEvent';

const showMascotEvent = createAppEvent<boolean>('kg-show-mascot');

let showMascot = true;
let greetingPending = true;

/** Whether the chibi mascot appears in Home, Settings, the Editor and the empty Library. */
export function mascotShown(): boolean {
	return showMascot;
}

/** Tells the running app whether the mascot is now shown, so it needn't reload the config. */
export function announceShowMascot(enabled: boolean) {
	showMascot = enabled;
	showMascotEvent.announce(enabled);
}

/** Calls `onChange` whenever the setting changes; returns the unsubscribe function. */
export const onShowMascotChanged = showMascotEvent.listen;

/** Marks the Home greeting as due, so the chibi slides in when Home next appears. */
export function requestHomeGreeting() {
	greetingPending = true;
}

/** Whether Home still owes the user a slide-in greeting. */
export function homeGreetingPending(): boolean {
	return greetingPending;
}

/** Consumes the greeting, so Home pops in until the Editor is visited again. */
export function greetHome() {
	greetingPending = false;
}
