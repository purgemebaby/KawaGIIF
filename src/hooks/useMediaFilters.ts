import { useMemo, useState } from 'react';
import {
	DEFAULT_FILTERS,
	filterMedia,
	toggleTagFilter,
	type MediaFilters,
} from '../lib/mediaFilter';
import type { MediaItem } from '../lib/media';

/** Filter state for a list of media: the filters, the filtered items and the tag manager's open state. */
export function useMediaFilters(items: MediaItem[]) {
	const [filters, setFilters] = useState<MediaFilters>(DEFAULT_FILTERS);
	const [managingTags, setManagingTags] = useState(false);
	const filtered = useMemo(() => filterMedia(items, filters), [items, filters]);
	const openTags = () => setManagingTags(true);
	const closeTags = () => setManagingTags(false);
	const toggleTag = (tag: string) =>
		setFilters((prev) => toggleTagFilter(prev, tag));
	return {
		filters,
		setFilters,
		filtered,
		managingTags,
		openTags,
		closeTags,
		toggleTag,
	};
}
