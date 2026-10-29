export type MediaType =
	'gif' | 'mp4' | 'jpeg' | 'png' | 'webp' | 'svg' | 'mp3' | 'wav' | 'ogg';

/** Visuals go on the desktop and in memes, audio (cassettes) only in memes. */
export type MediaKind = 'visual' | 'audio';

export interface MediaItem {
	id: string;
	stored_file_name: string;
	original_file_name: string;
	media_type: MediaType;
	imported_at_unix: number;
	tags: string[];
	/** Set by the backend when the file was deleted from the media folder. */
	missing?: boolean;
	/** What the import read from the codec. Absent on items imported before it existed. */
	duration_ms?: number;
	width?: number;
	height?: number;
	frame_count?: number;
	has_audio?: boolean;
}

export interface TagCount {
	name: string;
	count: number;
}

export const STATIC_TYPES: MediaType[] = ['jpeg', 'png', 'svg'];

/** Extensions the importer takes. The backend still checks each file's content, so this only spares a round trip. */
export const MEDIA_EXTENSIONS = [
	'gif',
	'mp4',
	'jpg',
	'jpeg',
	'png',
	'webp',
	'svg',
	'mp3',
	'wav',
	'ogg',
];

export function hasMediaExtension(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	return MEDIA_EXTENSIONS.includes(ext);
}

export const AUDIO_TYPES: MediaType[] = ['mp3', 'wav', 'ogg'];

export const isAudioType = (type: MediaType | null): boolean =>
	type !== null && AUDIO_TYPES.includes(type);

export const kindOf = (type: MediaType): MediaKind =>
	isAudioType(type) ? 'audio' : 'visual';

export const isVideoType = (type: MediaType | null): boolean => type === 'mp4';

export function isImageType(type: MediaType | null): boolean {
	return type === 'jpeg' || type === 'png' || type === 'webp' || type === 'svg';
}

export function formatBytes(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** m:ss for a duration in ms. */
export function formatDuration(ms: number): string {
	const total = Math.round(ms / 1000);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
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
