import { useCallback, useEffect, useRef, useState } from 'react';
import { useTauriEvent } from './useTauriEvent';
import { onError } from '../lib/notify';
import { t } from '../i18n';

/** Placements the boot could not show again. */
interface SkippedOverlays {
	missing: number;
	notPlaced: number;
	poolSize: number;
}

const TOAST_MS = 5000;

/** The control window's error toast: rejected invokes and skipped boot overlays, each shown for 5 s. */
export function useErrorToast(): {
	message: string | null;
	dismiss: () => void;
} {
	const [message, setMessage] = useState<string | null>(null);
	const timerRef = useRef<number | undefined>(undefined);

	// A newer failure replaces the visible one and restarts the countdown.
	const show = useCallback((text: string) => {
		setMessage(text);
		window.clearTimeout(timerRef.current);
		timerRef.current = window.setTimeout(() => setMessage(null), TOAST_MS);
	}, []);

	const dismiss = useCallback(() => {
		window.clearTimeout(timerRef.current);
		setMessage(null);
	}, []);

	useEffect(() => () => window.clearTimeout(timerRef.current), []);

	// Raw backend errors get the generic phrasing; the boot event arrives already worded.
	useEffect(() => onError((error) => show(t.errors.generic(error))), [show]);

	useTauriEvent<SkippedOverlays>(
		'overlays-skipped',
		({ missing, notPlaced, poolSize }) =>
			show(t.errors.overlaysSkipped(missing, notPlaced, poolSize)),
	);

	return { message, dismiss };
}
