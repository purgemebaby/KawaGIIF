export type MediaType = 'gif' | 'mp4' | 'jpeg' | 'png' | 'webp' | 'svg';

export interface MediaItem {
	id: string;
	stored_file_name: string;
	original_file_name: string;
	media_type: MediaType;
	imported_at_unix: number;
	tags: string[];
}

export interface TagCount {
	name: string;
	count: number;
}

export const STATIC_TYPES: MediaType[] = ['jpeg', 'png', 'svg'];

export const isVideoType = (type: MediaType | null): boolean => type === 'mp4';

export function formatBytes(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function fileNameOf(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}
