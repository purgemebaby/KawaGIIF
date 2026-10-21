import { invoke } from './ipc';
import type { MediaItem, MediaType } from './media';

export interface PlacedMedia {
	instance_id: string;
	media_id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	opacity: number;
	playback_rate: number | null;
	rotation: number;
	auto_sized: boolean;
}

export interface Template {
	items: PlacedMedia[];
}

export interface PlacedWithType {
	item: PlacedMedia;
	mediaType: MediaType | null;
}

export async function loadPlacedMedia(
	instanceId: string,
): Promise<PlacedWithType | null> {
	const item = await invoke<PlacedMedia | null>('get_placed_media', {
		instanceId,
	});
	if (!item) return null;
	const media = await invoke<MediaItem[]>('list_media');
	return {
		item,
		mediaType: media.find((m) => m.id === item.media_id)?.media_type ?? null,
	};
}
