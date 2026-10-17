import { useEffect, useState } from 'react';
import { invoke } from '../lib/ipc';
import { t } from '../i18n/en';
import { announceNavAnimations } from '../lib/navAnimations';
import FontRow from './settings/FontRow';
import LoadingIndicatorRow from './settings/LoadingIndicatorRow';
import RamGauge from './settings/RamGauge';
import ZoomRow from './settings/ZoomRow';

interface AppConfig {
	launch_on_startup: boolean;
	start_minimized_to_tray: boolean;
	confirm_media_delete: boolean;
	overlay_pool_size: number;
	ui_font: string | null;
	font_scale: number;
	ui_zoom: number;
	nav_animations: boolean;
}

// must match window_manager::MAX_POOL in Rust
const MAX_POOL = 20;

interface SettingsToggleProps {
	checked: boolean;
	text: { label: string; hint: string };
	onChange: (checked: boolean) => void;
}

function SettingsToggle({ checked, text, onChange }: SettingsToggleProps) {
	return (
		<label className="settings-row">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
			/>
			<span>
				<strong>{text.label}</strong>
				<small>{text.hint}</small>
			</span>
		</label>
	);
}

function SettingsScreen() {
	const [config, setConfig] = useState<AppConfig | null>(null);

	useEffect(() => {
		invoke<AppConfig>('get_config').then(setConfig);
	}, []);

	if (!config) {
		return <p className="empty-state">{t.common.loading}</p>;
	}

	const update = async <K extends keyof AppConfig>(
		key: K,
		value: AppConfig[K],
		command: string,
		args: Record<string, unknown>,
	) => {
		setConfig({ ...config, [key]: value });
		await invoke(command, args);
	};

	return (
		<div className="settings-screen">
			<h1>{t.settings.title}</h1>

			<RamGauge />

			<div className="settings-list">
				<SettingsToggle
					checked={config.launch_on_startup}
					text={t.settings.launchOnStartup}
					onChange={(enabled) =>
						update('launch_on_startup', enabled, 'set_launch_on_startup', {
							enabled,
						})
					}
				/>

				<SettingsToggle
					checked={config.start_minimized_to_tray}
					text={t.settings.startMinimized}
					onChange={(enabled) =>
						update(
							'start_minimized_to_tray',
							enabled,
							'set_start_minimized_to_tray',
							{ enabled },
						)
					}
				/>

				<SettingsToggle
					checked={config.confirm_media_delete}
					text={t.settings.confirmDelete}
					onChange={(enabled) =>
						update(
							'confirm_media_delete',
							enabled,
							'set_confirm_media_delete',
							{
								enabled,
							},
						)
					}
				/>

				<label className="settings-row settings-row-number">
					<span>
						<strong>{t.settings.poolSize.label}</strong>
						<small>{t.settings.poolSize.hint}</small>
					</span>
					<input
						type="number"
						min={1}
						max={MAX_POOL}
						value={config.overlay_pool_size}
						onChange={(e) => {
							const count = Math.min(
								Math.max(Number(e.target.value) || 1, 1),
								MAX_POOL,
							);
							update('overlay_pool_size', count, 'set_overlay_pool_size', {
								count,
							});
						}}
					/>
				</label>

				<FontRow
					font={config.ui_font}
					scale={config.font_scale}
					onFontChange={(family) =>
						update('ui_font', family, 'set_ui_font', { family })
					}
					onScaleChange={(scale) =>
						update('font_scale', scale, 'set_font_scale', { scale })
					}
				/>

				<ZoomRow
					zoom={config.ui_zoom}
					onZoomChange={(zoom) => setConfig({ ...config, ui_zoom: zoom })}
				/>

				<SettingsToggle
					checked={config.nav_animations}
					text={t.settings.navAnimations}
					onChange={(enabled) => {
						announceNavAnimations(enabled);
						update('nav_animations', enabled, 'set_nav_animations', {
							enabled,
						});
					}}
				/>

				<LoadingIndicatorRow />
			</div>
		</div>
	);
}

export default SettingsScreen;
