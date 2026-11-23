/** The one sound preview playing in this window: starting another pauses it, so cassettes never talk over each other. */
let current: { audio: HTMLAudioElement; stop: () => void } | null = null;

/** Registers `audio` as the playing preview and pauses the previous one. `stop` resets its owner's UI. */
export function claimPreview(audio: HTMLAudioElement, stop: () => void) {
	if (current && current.audio !== audio) {
		current.audio.pause();
		current.stop();
	}
	current = { audio, stop };
}

/** Forgets `audio` if it is the playing preview. */
export function releasePreview(audio: HTMLAudioElement) {
	if (current?.audio === audio) current = null;
}
