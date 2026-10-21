import type { MediaItem, MediaType } from './media';

export type SortMode = 'name-asc' | 'name-desc' | 'date-new' | 'date-old';

export interface MediaFilters {
	type: MediaType | 'all';
	query: string;
	sort: SortMode;
	tags: string[];
}

export const DEFAULT_FILTERS: MediaFilters = {
	type: 'all',
	query: '',
	sort: 'date-new',
	tags: [],
};

// The one filter pipeline shared by the Storage screen and the editor sidebar.
export function filterMedia(
	items: MediaItem[],
	filters: MediaFilters,
): MediaItem[] {
	const query = filters.query.trim().toLowerCase();
	const selectedTags = filters.tags.map((tag) => tag.toLowerCase());

	const result = items.filter((item) => {
		if (filters.type !== 'all' && item.media_type !== filters.type)
			return false;

		if (selectedTags.length > 0) {
			const own = item.tags.map((tag) => tag.toLowerCase());
			if (!selectedTags.every((tag) => own.includes(tag))) return false;
		}

		if (!query) return true;
		const haystack = [item.original_file_name, ...item.tags]
			.join(' ')
			.toLowerCase();
		return haystack.includes(query);
	});

	return [...result].sort((a, b) => {
		switch (filters.sort) {
			case 'name-asc':
				return a.original_file_name.localeCompare(b.original_file_name, 'en');
			case 'name-desc':
				return b.original_file_name.localeCompare(a.original_file_name, 'en');
			case 'date-old':
				return a.imported_at_unix - b.imported_at_unix;
			case 'date-new':
			default:
				return b.imported_at_unix - a.imported_at_unix;
		}
	});
}

// Case-insensitive like the matcher, so a renamed tag keeps its filter active.
export function toggleTagFilter(
	filters: MediaFilters,
	tag: string,
): MediaFilters {
	const active = filters.tags.some(
		(x) => x.toLowerCase() === tag.toLowerCase(),
	);
	return {
		...filters,
		tags: active
			? filters.tags.filter((x) => x.toLowerCase() !== tag.toLowerCase())
			: [...filters.tags, tag],
	};
}
