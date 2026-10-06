import { useEffect, useRef } from 'react';
import { listen, listenToSelf } from '../lib/ipc';

export function useTauriEvent<T>(
	event: string,
	handler: (payload: T) => void,
	scope: 'any' | 'self' = 'any',
) {
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		const subscribe = scope === 'self' ? listenToSelf<T> : listen<T>;
		const unlisten = subscribe(event, (e) => handlerRef.current(e.payload));
		return () => {
			unlisten.then((f) => f());
		};
	}, [event, scope]);
}
