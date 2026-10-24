import { useEffect, useState } from 'react';
import { mascotShown, onShowMascotChanged } from '../lib/mascot';

/** Whether the mascot is shown; re-renders when the setting changes. */
export function useMascotShown(): boolean {
	const [shown, setShown] = useState(mascotShown);

	useEffect(() => onShowMascotChanged(setShown), []);

	return shown;
}
