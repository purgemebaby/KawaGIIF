import { useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../lib/media';

/** How many times new media has appeared in the library since this screen opened. */
export function useImportCount(items: MediaItem[], loading: boolean): number {
	const [count, setCount] = useState(0);
	const known = useRef<Set<string> | null>(null);

	useEffect(() => {
		if (loading) return;
		const before = known.current;
		known.current = new Set(items.map((item) => item.id));
		// the first pass only learns what is already there
		if (before && items.some((item) => !before.has(item.id)))
			setCount((n) => n + 1);
	}, [items, loading]);

	return count;
}
