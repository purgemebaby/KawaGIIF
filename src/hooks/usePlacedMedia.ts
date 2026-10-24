import { useEffect, useState } from 'react';
import { loadPlacedMedia, type PlacedMedia } from '../lib/placed';
import type { MediaType } from '../lib/media';

/** The placed item and its media type for an instance id (null while loading or when there is none). */
export function usePlacedMedia(instanceId: string | null) {
	const [item, setItem] = useState<PlacedMedia | null>(null);
	const [mediaType, setMediaType] = useState<MediaType | null>(null);

	useEffect(() => {
		if (!instanceId) {
			setItem(null);
			setMediaType(null);
			return;
		}
		let cancelled = false;
		loadPlacedMedia(instanceId).then((placed) => {
			if (cancelled || !placed) return;
			setItem(placed.item);
			setMediaType(placed.mediaType);
		});
		return () => {
			cancelled = true;
		};
	}, [instanceId]);

	return { item, setItem, mediaType };
}
