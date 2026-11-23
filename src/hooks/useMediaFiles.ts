import { useEffect, useState } from 'react';
import type { MediaItem } from '../lib/media';
import {
	knownMediaDirs,
	loadMediaDirs,
	mediaFileUrl,
	thumbFileUrl,
	type MediaDirs,
} from '../lib/mediaUrl';

/** The library folders, once loaded (null until then). */
export function useMediaDirs(): MediaDirs | null {
	const [dirs, setDirs] = useState<MediaDirs | null>(knownMediaDirs);

	useEffect(() => {
		if (dirs) return;
		let cancelled = false;
		loadMediaDirs()
			.then((loaded) => {
				if (!cancelled) setDirs(loaded);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [dirs]);
	return dirs;
}

/** The original and thumbnail URLs of a library item, built locally from the library folders. */
export function useMediaFiles(item: MediaItem | null | undefined): {
	url: string | null;
	thumb: string | null;
} {
	const dirs = useMediaDirs();
	if (!dirs || !item) return { url: null, thumb: null };
	return { url: mediaFileUrl(dirs, item), thumb: thumbFileUrl(dirs, item) };
}
