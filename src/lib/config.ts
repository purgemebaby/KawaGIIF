import { invoke } from './ipc';

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
}

export function loadConfig(): Promise<AppConfig> {
	return invoke<AppConfig>('get_config');
}
