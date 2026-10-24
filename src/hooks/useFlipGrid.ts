import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from '../lib/navAnimations';

const SLIDE_MS = 280;
const SLIDE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

interface Card {
	el: HTMLElement;
	x: number;
	y: number;
}

// offsetLeft/Top ignore transforms, so a running slide or the hover lift never skews them.
function measureCards(container: HTMLElement): Map<string, Card> {
	const cards = new Map<string, Card>();
	for (const el of container.querySelectorAll<HTMLElement>('[data-flip-id]')) {
		const id = el.dataset.flipId;
		if (id) cards.set(id, { el, x: el.offsetLeft, y: el.offsetTop });
	}
	return cards;
}

// The independent `translate` property composes with the card's own rotate.
function slideFrom(el: HTMLElement, dx: number, dy: number) {
	if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
	el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], {
		duration: SLIDE_MS,
		easing: SLIDE_EASING,
	});
}

/** FLIP: after `ids` change, cards that stayed slide from their old place to the new one. */
export function useFlipGrid(
	containerRef: RefObject<HTMLElement | null>,
	ids: string[],
) {
	const cards = useRef(new Map<string, Card>());

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const before = cards.current;
		const after = measureCards(container);
		cards.current = after;
		if (prefersReducedMotion()) return;
		for (const [id, now] of after) {
			const was = before.get(id);
			if (was) slideFrom(now.el, was.x - now.x, was.y - now.y);
		}
	}, [containerRef, ids]);

	// A reflow from a resize is not a move to animate; keep the stored places current.
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const observer = new ResizeObserver(() => {
			cards.current = measureCards(container);
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, [containerRef]);
}
