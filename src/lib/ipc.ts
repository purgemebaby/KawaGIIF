import {
	invoke as tauriInvoke,
	convertFileSrc as tauriConvertFileSrc,
} from '@tauri-apps/api/core';
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event';
import { ZOOM_MAX, ZOOM_MIN } from './zoom';

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
};

const MOCK_RESPONSES: Record<string, unknown> = {
	list_media: MOCK_MEDIA,
	list_all_tags: MOCK_TAGS,
	get_config: MOCK_CONFIG,
	get_loading_indicator: null,
	set_nav_animations: null,
	list_system_fonts: ['Segoe UI', 'Arial', 'Consolas'],
	get_working_template: { items: [] },
	load_template: { items: [] },
	list_placed_items: [],
	has_unsaved_changes: false,
	get_placed_media: null,
	get_slot_info: null,
	get_file_size: 1024 * 1024,
	count_placed_media: 0,
	list_monitors: [
		{
			index: 0,
			name: null,
			x: 0,
			y: 0,
			width: 2560,
			height: 1392,
			primary: true,
		},
		{
			index: 1,
			name: null,
			x: 2560,
			y: 0,
			width: 1920,
			height: 1032,
			primary: false,
		},
	],
};

// Mocks that compute a value from their args, mirroring the Rust clamping.
const MOCK_HANDLERS: Record<
	string,
	(args?: Record<string, unknown>) => unknown
> = {
	set_ui_zoom: (args) => {
		const zoom = Number(args?.zoom);
		return Number.isFinite(zoom)
			? Math.min(Math.max(zoom, ZOOM_MIN), ZOOM_MAX)
			: 1;
	},
};

export async function invoke<T>(
	command: string,
	args?: Record<string, unknown>,
): Promise<T> {
	if (IS_TAURI) return tauriInvoke<T>(command, args);

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
