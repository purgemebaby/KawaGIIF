import { useEffect, useRef, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

/**
 * Files dragged in from Explorer onto the window. `over` is true while they hover, so the drop zone can light up;
 * `onDrop` gets the dropped paths. Tauri catches the drop natively, so the page sees no HTML drag events.
 */
export function useFileDrop(onDrop: (paths: string[]) => void): boolean {
	const [over, setOver] = useState(false);
	const onDropRef = useRef(onDrop);
	onDropRef.current = onDrop;

	useEffect(() => {
		const unlisten = getCurrentWebview().onDragDropEvent(({ payload }) => {
			setOver(payload.type === 'enter' || payload.type === 'over');
			if (payload.type === 'drop') onDropRef.current(payload.paths);
		});
		return () => {
			unlisten.then((f) => f());
		};
	}, []);

	return over;
}
