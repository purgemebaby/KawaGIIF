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

// Must match the `AppError::MediaReferenced` message on the Rust side.
const REFERENCED_PREFIX = 'REFERENCED:';

export const isVideoType = (type: MediaType | null): boolean => type === 'mp4';

export function formatBytes(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

export function fileNameOf(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}

export function parseReferencedError(error: unknown): number | null {
	const message = typeof error === 'string' ? error : String(error);
	if (!message.includes(REFERENCED_PREFIX)) return null;
	const count = Number(message.split(REFERENCED_PREFIX)[1]);
	return Number.isFinite(count) ? count : null;
}
