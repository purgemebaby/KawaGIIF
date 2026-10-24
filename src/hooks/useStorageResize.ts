import { useRef } from 'react';
import { startPointerDrag } from '../lib/pointerDrag';
import { clamp } from '../lib/overlayGeometry';
import { numberCodec, usePersistentState } from './usePersistentState';

/** The storage panel's resize: the persisted body height, the section it sizes and the handle drag. */
export function useStorageResize() {
	// The storage body's height in px. 0 keeps the natural single-row height.
	const [storageHeight, setStorageHeight] = usePersistentState(
		'kawagiif.editor.storage.height',
		0,
		numberCodec,
	);
	const resetStorageHeight = () => setStorageHeight(0);
	const storageSectionRef = useRef<HTMLElement | null>(null);
	// The single row's height, measured while the panel is still unsized.
	const naturalRowRef = useRef(0);

	// Dragging the handle walks the body height between the single row and half the window.
	const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		const body =
			storageSectionRef.current?.querySelector<HTMLElement>(
				'.editor-panel-body',
			);
		// Unsized, the body is the natural row. That measure stays the minimum.
		if (body && storageHeight === 0) naturalRowRef.current = body.scrollHeight;
		const min = naturalRowRef.current || 96;
		const startHeight =
			storageHeight > 0 && body ? body.clientHeight : naturalRowRef.current;
		const startY = e.clientY;
		let lastY = startY;

		// Pointer capture keeps the moves coming even outside the handle.
		startPointerDrag(e, {
			move: (ev) => {
				lastY = ev.clientY;
			},
			frame: () => {
				const next = clamp(
					startHeight + lastY - startY,
					min,
					window.innerHeight * 0.5,
				);
				setStorageHeight(Math.round(next));
			},
		});
	};

	return { storageHeight, resetStorageHeight, storageSectionRef, startResize };
}
