import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import { loadConfig, type AudioOutput } from '../../lib/config';
import SettingsRowText from '../settings/SettingsRowText';
import SettingsSection from '../settings/SettingsSection';
import SketchIcon from '../ui/SketchIcon';
import Slider from '../ui/Slider';
import HotkeyField from './HotkeyField';

interface AudioDevice {
	id: string;
	name: string;
	is_default: boolean;
}

// must match config::MAX_MEME_CONCURRENCY in Rust
const MAX_CONCURRENT = 10;

/** One `<select>` value per output choice: `default`, `device:<id>` or `both:<id>`. */
function encodeOutput(output: AudioOutput): string {
	if (output.mode === 'default') return 'default';
	return `${output.mode === 'device' ? 'device' : 'both'}:${output.device}`;
}

function decodeOutput(value: string): AudioOutput {
	if (value === 'default') return { mode: 'default' };
	const [kind, ...rest] = value.split(':');
	const device = rest.join(':');
	return kind === 'device'
		? { mode: 'device', device }
		: { mode: 'default_plus_device', device };
}

/** Sound output, volume, how many memes at once, and the Stop all shortcut. */
function MemeboardSettings({ stopHotkey }: { stopHotkey: string }) {
	const [devices, setDevices] = useState<AudioDevice[]>([]);
	const [output, setOutput] = useState<AudioOutput>({ mode: 'default' });
	const [volume, setVolume] = useState(0.8);
	const [concurrent, setConcurrent] = useState(1);
	const [stop, setStop] = useState(stopHotkey);

	useEffect(() => setStop(stopHotkey), [stopHotkey]);

	useEffect(() => {
		loadConfig().then((config) => {
			setOutput(config.audio_output);
			setVolume(config.meme_volume);
			setConcurrent(config.meme_max_concurrent);
		});
		invoke<AudioDevice[]>('list_audio_outputs')
			.then(setDevices)
			.catch(notifyError);
	}, []);

	const settings = t.memeboard.settings;
	const others = devices.filter((d) => !d.is_default);

	const changeOutput = (next: AudioOutput) => {
		setOutput(next);
		invoke('set_audio_output', { output: next }).catch(notifyError);
	};

	return (
		<SettingsSection
			title={settings.section}
			icon={<SketchIcon name="cassette" size={32} />}
		>
			<label className="settings-row settings-row-number">
				<SettingsRowText text={settings.output} />
				<select
					className="filter-search"
					value={encodeOutput(output)}
					onChange={(e) => changeOutput(decodeOutput(e.target.value))}
				>
					<option value="default">{settings.output.default}</option>
					{others.map((d) => (
						<option key={`device:${d.id}`} value={`device:${d.id}`}>
							{d.name}
						</option>
					))}
					{others.map((d) => (
						<option key={`both:${d.id}`} value={`both:${d.id}`}>
							{settings.output.both(d.name)}
						</option>
					))}
				</select>
			</label>

			<Slider
				label={settings.volume.label}
				min={0}
				max={1}
				step={0.01}
				value={volume}
				format={(v) => `${Math.round(v * 100)} %`}
				onChange={(v) => {
					setVolume(v);
					invoke('set_meme_volume', { volume: v }).catch(notifyError);
				}}
			/>

			<label className="settings-row settings-row-number">
				<SettingsRowText text={settings.concurrent} />
				<input
					type="number"
					min={1}
					max={MAX_CONCURRENT}
					value={concurrent}
					onChange={(e) => {
						const count = Math.min(
							MAX_CONCURRENT,
							Math.max(1, Number(e.target.value) || 1),
						);
						setConcurrent(count);
						invoke('set_meme_max_concurrent', { count }).catch(notifyError);
					}}
				/>
			</label>

			<div className="settings-row">
				<SettingsRowText text={settings.stopHotkey} />
				<HotkeyField
					value={stop}
					clearable={false}
					onChange={(hotkey) => {
						if (!hotkey) return;
						invoke<string>('set_stop_hotkey', { hotkey })
							.then(setStop)
							.catch(notifyError);
					}}
				/>
			</div>
		</SettingsSection>
	);
}

export default MemeboardSettings;
