import { useEffect, useState } from 'react';
import { invoke } from '../lib/ipc';
import { loadConfig, type AppConfig } from '../lib/config';
import { t } from '../i18n';
import { announceNavAnimations } from '../lib/navAnimations';
import { announceShowMascot } from '../lib/mascot';
import { useMascotShown } from '../hooks/useMascotShown';
import FontRow from './settings/FontRow';
import LanguageRow from './settings/LanguageRow';
import LoadingIndicatorRow from './settings/LoadingIndicatorRow';
import SettingsMascot from './mascot/SettingsMascot';
import RamGauge from './settings/RamGauge';
import SettingsSection from './settings/SettingsSection';
import ZoomRow from './settings/ZoomRow';
import SketchIcon from './ui/SketchIcon';
import './SettingsScreen.css';

// must match window_manager::MAX_POOL in Rust
const MAX_POOL = 20;

interface SettingsToggleProps {
	checked: boolean;
	text: { label: string; hint: string };
	onChange: (checked: boolean) => void;
}

function SettingsToggle({ checked, text, onChange }: SettingsToggleProps) {
	return (
		<label className="settings-row settings-row-toggle">
			<span className="settings-row-text">
				<strong>{text.label}</strong>
				<small>{text.hint}</small>
			</span>
			<span className="settings-switch">
				<input
					type="checkbox"
					role="switch"
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
				/>
				<span className="settings-switch-track" aria-hidden="true" />
			</span>
		</label>
	);
}

// Static icons (no `pixel-hover` ancestor here), drawn at 32 px.
const SECTION_ICON_SIZE = 32;

const ICONS = {
	startup: <SketchIcon name="power" size={SECTION_ICON_SIZE} />,
	library: <SketchIcon name="folder" size={SECTION_ICON_SIZE} />,
	appearance: <SketchIcon name="palette" size={SECTION_ICON_SIZE} />,
	motion: <SketchIcon name="sparkles" size={SECTION_ICON_SIZE} />,
	performance: <SketchIcon name="chip" size={SECTION_ICON_SIZE} />,
};

function SettingsScreen() {
	const [config, setConfig] = useState<AppConfig | null>(null);
	const showMascot = useMascotShown();

	useEffect(() => {
		loadConfig().then(setConfig);
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

	const sections = t.settings.sections;

	return (
		<div className="settings-screen">
			<h1>{t.settings.title}</h1>

			<div className="settings-layout">
				<div className="settings-sections">
					<SettingsSection title={sections.startup.title} icon={ICONS.startup}>
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
					</SettingsSection>

					<SettingsSection title={sections.library.title} icon={ICONS.library}>
						<SettingsToggle
							checked={config.confirm_media_delete}
							text={t.settings.confirmDelete}
							onChange={(enabled) =>
								update(
									'confirm_media_delete',
									enabled,
									'set_confirm_media_delete',
									{ enabled },
								)
							}
						/>
					</SettingsSection>

					<SettingsSection
						title={sections.appearance.title}
						icon={ICONS.appearance}
					>
						<LanguageRow language={config.language} />

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
							checked={config.show_mascot}
							text={t.settings.showMascot}
							onChange={(enabled) => {
								announceShowMascot(enabled);
								update('show_mascot', enabled, 'set_show_mascot', {
									enabled,
								});
							}}
						/>
					</SettingsSection>

					<SettingsSection title={sections.motion.title} icon={ICONS.motion}>
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
					</SettingsSection>
				</div>

				<aside className="settings-aside">
					{showMascot && <SettingsMascot />}
					<RamGauge />

					<SettingsSection
						title={sections.performance.title}
						icon={ICONS.performance}
					>
						<label className="settings-row settings-row-number">
							<span className="settings-row-text">
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
					</SettingsSection>
				</aside>
			</div>
		</div>
	);
}

export default SettingsScreen;
