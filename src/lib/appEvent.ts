/** A value one part of the control window announces and others listen to, without reloading the config. */
export function createAppEvent<T>(name: string) {
	return {
		announce(value: T) {
			window.dispatchEvent(new CustomEvent<T>(name, { detail: value }));
		},
		listen(onChange: (value: T) => void): () => void {
			const handler = (e: Event) => onChange((e as CustomEvent<T>).detail);
			window.addEventListener(name, handler);
			return () => window.removeEventListener(name, handler);
		},
	};
}
