/** Follows one pointer until release with pointer capture: `move` on every event, `frame` at most once per
 animation frame (and once more on release if one was pending), then `end`. */
export function startPointerDrag(
	e: { currentTarget: Element; pointerId: number },
	handlers: {
		move?: (ev: PointerEvent) => void;
		frame: () => void;
		end?: () => void;
	},
): void {
	const id = e.pointerId;
	// Element's event map lacks pointer events, the global handlers carry them.
	const el = e.currentTarget as Element & GlobalEventHandlers;
	let raf = 0;

	const tick = () => {
		raf = 0;
		handlers.frame();
	};
	const onMove = (ev: PointerEvent) => {
		handlers.move?.(ev);
		if (!raf) raf = requestAnimationFrame(tick);
	};
	// Runs the pending frame now, so the drag ends on the last pointer position.
	const onEnd = () => {
		if (raf) {
			cancelAnimationFrame(raf);
			tick();
		}
		if (el.hasPointerCapture(id)) el.releasePointerCapture(id);
		el.removeEventListener('pointermove', onMove);
		el.removeEventListener('pointerup', onEnd);
		el.removeEventListener('pointercancel', onEnd);
		handlers.end?.();
	};

	el.setPointerCapture(id);
	el.addEventListener('pointermove', onMove);
	el.addEventListener('pointerup', onEnd);
	el.addEventListener('pointercancel', onEnd);
}
