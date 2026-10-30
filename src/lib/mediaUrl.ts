import { convertFileSrc, invoke } from './ipc';
import type { MediaItem } from './media';

/** The library folders, as `get_media_dirs` reports them. */
export interface MediaDirs {
	media: string;
	thumbs: string;
}

let pending: Promise<MediaDirs> | null = null;
let known: MediaDirs | null = null;

/** The folders, asked once per window: every tile then builds its URLs without a call of its own. */
export function loadMediaDirs(): Promise<MediaDirs> {
	pending ??= invoke<MediaDirs>('get_media_dirs').then((dirs) => {
		known = dirs;
		return dirs;
	});
	return pending;
}

/** The folders once loaded, so a tile mounted later renders its URL on the first pass. */
export function knownMediaDirs(): MediaDirs | null {
	return known;
}

/** The original file of an item. */
export function mediaFileUrl(dirs: MediaDirs, item: MediaItem): string {
	return convertFileSrc(`${dirs.media}/${item.stored_file_name}`);
}

/** Its small still WEBP (media_thumbs.rs names it after the stored file, so a re-import gets a fresh URL). */
export function thumbFileUrl(dirs: MediaDirs, item: MediaItem): string {
	const stem = item.stored_file_name.replace(/\.[^.]+$/, '');
	return convertFileSrc(`${dirs.thumbs}/${stem}.webp`);
}
