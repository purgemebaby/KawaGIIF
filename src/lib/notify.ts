import { createAppEvent } from './appEvent';

const errorEvent = createAppEvent<string>('kg-error');

/** Shows `error` in the control window's error toast. Accepts whatever a rejected invoke throws (Rust sends AppError as a string). */
export function notifyError(error: unknown): void {
	errorEvent.announce(error instanceof Error ? error.message : String(error));
}

export const onError = errorEvent.listen;
