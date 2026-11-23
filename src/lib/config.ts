import { invoke } from './ipc';

/** Where memeboard sounds go: a device id, or the default speakers plus one. */
export type AudioOutput =
	| { mode: 'default' }
	| { mode: 'device'; device: string }
	| { mode: 'default_plus_device'; device: string };

// Mirror of config.rs AppConfig.
export interface AppConfig {
	launch_on_startup: boolean;
	start_minimized_to_tray: boolean;
	confirm_media_delete: boolean;
	overlay_pool_size: number;
	loading_indicator: string | null;
	ui_font: string | null;
	font_scale: number;
	ui_zoom: number;
	nav_animations: boolean;
	show_mascot: boolean;
	language: string;
	audio_output: AudioOutput;
	meme_volume: number;
	meme_max_concurrent: number;
}

export function loadConfig(): Promise<AppConfig> {
	return invoke<AppConfig>('get_config');
}
