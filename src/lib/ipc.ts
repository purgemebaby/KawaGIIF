import {
	invoke as tauriInvoke,
	convertFileSrc as tauriConvertFileSrc,
	type InvokeOptions,
} from '@tauri-apps/api/core';
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event';
import { ZOOM_MAX, ZOOM_MIN } from './zoom';
import { clamp } from './overlayGeometry';

const IS_TAURI = '__TAURI_INTERNALS__' in window;

const MOCK_TAGS = [
	{ name: 'Chibi', count: 3 },
	{ name: 'Anime', count: 2 },
	{ name: 'Pixel art', count: 1 },
];

const MOCK_MEDIA = [
	{ id: 'm1', name: 'hoyo-hsr.gif', type: 'gif', tags: ['Chibi', 'Anime'] },
	{ id: 'm2', name: 'nightclub.gif', type: 'gif', tags: ['Chibi'] },
	{ id: 'm3', name: 'wannacry.mp4', type: 'mp4', tags: ['Anime'] },
	{ id: 'm4', name: 'sprite.png', type: 'png', tags: ['Pixel art'] },
	{ id: 'm5', name: 'banner.webp', type: 'webp', tags: [] },
	{ id: 'm6', name: 'photo.jpg', type: 'jpeg', tags: ['Chibi'] },
].map((m, i) => ({
	id: m.id,
	stored_file_name: `${m.id}.${m.type}`,
	original_file_name: m.name,
	media_type: m.type,
	imported_at_unix: Math.floor(Date.now() / 1000) - i * 86_400,
	tags: m.tags,
}));

const MOCK_CONFIG = {
	launch_on_startup: false,
	start_minimized_to_tray: false,
	confirm_media_delete: true,
	overlay_pool_size: 4,
	ui_font: null,
	font_scale: 1,
	ui_zoom: 1,
	nav_animations: true,
	show_mascot: true,
	language: 'en',
};

/** A meme for the browser preview, shaped like memeboard.rs `MemeView`. */
function mockMeme(
	id: string,
	name: string,
	visual: string,
	hotkey: string | null,
	fireCount: number,
) {
	return {
		id,
		name,
		visual,
		audio: null,
		animation: { kind: 'pop', enter_ms: 280, exit_ms: 220 },
		anchor: { kind: 'cursor' },
		size: 0.3,
		volume: 1,
		duration_ms: null,
		motion_speed: 1,
		playback_speed: 1,
		monitor: { kind: 'cursor' },
		hotkey,
		behaviour: { cooldown_ms: 0, refire: 'restart', speed_jitter: 0 },
		fire_count: fireCount,
		hotkey_conflict: false,
	};
}

const MOCK_RESPONSES: Record<string, unknown> = {
	list_media: MOCK_MEDIA,
	list_all_tags: MOCK_TAGS,
	get_config: MOCK_CONFIG,
	get_loading_indicator: null,
	set_nav_animations: null,
	set_show_mascot: null,
	set_language: null,
	open_data_folder: null,
	list_system_fonts: ['Segoe UI', 'Arial', 'Consolas'],
	get_working_template: { items: [] },
	load_template: { items: [] },
	list_placed_items: [],
	has_unsaved_changes: false,
	get_placed_media: null,
	get_slot_info: null,
	get_file_sizes: [],
	count_placed_media: 0,
	find_reimports: [],
	import_media: { items: [], rejected: [], too_large: [] },
	rename_media: null,
	get_system_stats: {
		total_ram_mb: 16_384,
		used_ram_mb: 9_830,
		available_ram_mb: 6_554,
		app_ram_mb: 214,
	},
	get_available_update: new URLSearchParams(location.search).get('update'),
	install_update: null,
	list_memes: {
		memes: [
			mockMeme('mm1', 'Victory dance', 'm1', 'Ctrl+Alt+Digit1', 8),
			mockMeme('mm2', 'Bonk', 'm2', 'Ctrl+Alt+Digit2', 5),
			mockMeme('mm3', 'Sad violin', 'm3', null, 2),
		],
		stop_hotkey: 'Ctrl+Alt+Backspace',
		stop_conflict: false,
		presets: [],
		max_hotkeys: 10,
		max_meme_ms: 20_000,
	},
	list_monitors: [
		{ name: '\\\\.\\DISPLAY1', width: 1920, height: 1080, primary: true },
		{ name: '\\\\.\\DISPLAY2', width: 2560, height: 1440, primary: false },
	],
	list_audio_outputs: [
		{ id: 'speakers', name: 'Speakers', is_default: true },
		{ id: 'cable', name: 'CABLE Input (VB-Audio)', is_default: false },
	],
	check_hotkey: null,
	get_media_dirs: { media: 'C:/mock/media', thumbs: 'C:/mock/thumbs' },
};

// Mocks that compute a value from their args, mirroring the Rust clamping.
const MOCK_HANDLERS: Record<
	string,
	(args?: Record<string, unknown>) => unknown
> = {
	set_ui_zoom: (args) => {
		const zoom = Number(args?.zoom);
		return Number.isFinite(zoom) ? clamp(zoom, ZOOM_MIN, ZOOM_MAX) : 1;
	},
};

/** Calls a Rust command. `args` is JSON, or raw bytes for a command that reads the request body (with `options.headers`). */
export async function invoke<T>(
	command: string,
	args?: Record<string, unknown> | Uint8Array,
	options?: InvokeOptions,
): Promise<T> {
	if (IS_TAURI) return tauriInvoke<T>(command, args, options);
	if (args instanceof Uint8Array) return null as T;

	if (command in MOCK_HANDLERS) {
		return MOCK_HANDLERS[command](args) as T;
	}

	if (command in MOCK_RESPONSES) {
		return MOCK_RESPONSES[command] as T;
	}
	console.info(`[ipc] not mocked: ${command}`, args);
	return null as T;
}

export async function listen<T>(
	event: string,
	handler: (e: { payload: T }) => void,
): Promise<UnlistenFn> {
	if (IS_TAURI) return tauriListen<T>(event, handler);
	return () => {};
}

export async function listenToSelf<T>(
	event: string,
	handler: (e: { payload: T }) => void,
): Promise<UnlistenFn> {
	if (!IS_TAURI) return () => {};
	const { getCurrentWebviewWindow } =
		await import('@tauri-apps/api/webviewWindow');
	return getCurrentWebviewWindow().listen<T>(event, handler);
}

export function convertFileSrc(path: string): string {
	if (IS_TAURI) return tauriConvertFileSrc(path);
	return PLACEHOLDER_IMAGE;
}

const PLACEHOLDER_IMAGE =
	'data:image/svg+xml;utf8,' +
	encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
       <rect width="100" height="100" fill="#26282f"/>
       <circle cx="50" cy="50" r="26" fill="#a97bff" opacity="0.5"/>
     </svg>`,
	);
