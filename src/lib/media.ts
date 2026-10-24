export type MediaType = 'gif' | 'mp4' | 'jpeg' | 'png' | 'webp' | 'svg';

export interface MediaItem {
	id: string;
	stored_file_name: string;
	original_file_name: string;
	media_type: MediaType;
	imported_at_unix: number;
	tags: string[];
	/** Set by the backend when the file was deleted from the media folder. */
	missing?: boolean;
}

export interface TagCount {
	name: string;
	count: number;
}

export const STATIC_TYPES: MediaType[] = ['jpeg', 'png', 'svg'];

export const isVideoType = (type: MediaType | null): boolean => type === 'mp4';

export function isImageType(type: MediaType | null): boolean {
	return type === 'jpeg' || type === 'png' || type === 'webp' || type === 'svg';
}

export function formatBytes(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function fileNameOf(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}

const SHORT_NAME_MAX = 32;
const SHORT_NAME_TAIL = 8;

/** Cuts a long file name in the middle, keeping its end so the extension stays visible. */
export function shortFileName(name: string, max = SHORT_NAME_MAX): string {
	if (name.length <= max) return name;
	return `${name.slice(0, max - SHORT_NAME_TAIL - 1)}…${name.slice(-SHORT_NAME_TAIL)}`;
}
