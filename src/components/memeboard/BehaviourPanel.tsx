import { useState } from 'react';
import { t } from '../../i18n';
import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import type { Meme, Preset, Refire } from '../../lib/memeboard';
import Slider from '../ui/Slider';

interface BehaviourPanelProps {
	draft: Meme;
	presets: Preset[];
	onChange: (meme: Meme) => void;
}

const REFIRES: Refire[] = ['restart', 'stack', 'ignore'];
const MAX_COOLDOWN_MS = 30_000;

/** Cooldown, second-press rule and random speed, plus presets that copy a look and behaviour between memes. */
function BehaviourPanel({ draft, presets, onChange }: BehaviourPanelProps) {
	const [naming, setNaming] = useState(false);
	const [presetName, setPresetName] = useState('');
	const behaviour = draft.behaviour;
	const text = t.memeboard.behaviour;

	const setBehaviour = (patch: Partial<Meme['behaviour']>) =>
		onChange({ ...draft, behaviour: { ...behaviour, ...patch } });

	const apply = (preset: Preset) =>
		onChange({
			...draft,
			animation: preset.animation,
			anchor: preset.anchor,
			size: preset.size,
			behaviour: preset.behaviour,
		});

	const savePreset = async () => {
		const name = presetName.trim();
		if (!name) return;
		const preset: Preset = {
			// a nil id asks Rust for a new one
			id: '00000000-0000-0000-0000-000000000000',
			name,
			animation: draft.animation,
			anchor: draft.anchor,
			size: draft.size,
			behaviour,
		};
		try {
			await invoke('save_preset', { preset });
			setNaming(false);
			setPresetName('');
		} catch (e) {
			notifyError(e);
		}
	};

	return (
		<details className="meme-field meme-behaviour">
			<summary>{text.title}</summary>

			<div className="meme-subfield">
				<small>{text.presets}</small>
				{presets.length === 0 ? (
					<small className="meme-field-note">{text.noPresets}</small>
				) : (
					<div className="filter-types">
						{presets.map((preset) => (
							<span key={preset.id} className="meme-preset">
								<button
									type="button"
									className="filter-type"
									onClick={() => apply(preset)}
								>
									{preset.name}
								</button>
								<button
									type="button"
									className="meme-preset-delete"
									aria-label={text.deletePreset(preset.name)}
									title={text.deletePreset(preset.name)}
									onClick={() =>
										invoke('delete_preset', { id: preset.id }).catch(
											notifyError,
										)
									}
								>
									×
								</button>
							</span>
						))}
					</div>
				)}
				{naming ? (
					<div className="hotkey-field-row">
						<input
							className="filter-search"
							autoFocus
							placeholder={text.presetName}
							value={presetName}
							maxLength={60}
							onChange={(e) => setPresetName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') savePreset();
							}}
						/>
						<button
							type="button"
							className="kg-btn kg-btn--primary kg-btn--sm"
							disabled={!presetName.trim()}
							onClick={savePreset}
						>
							{t.memeboard.editor.save}
						</button>
					</div>
				) : (
					<button
						type="button"
						className="kg-btn kg-btn--secondary kg-btn--sm meme-preset-save"
						onClick={() => setNaming(true)}
					>
						{text.savePreset}
					</button>
				)}
			</div>

			<Slider
				label={text.cooldown}
				min={0}
				max={MAX_COOLDOWN_MS}
				step={250}
				value={behaviour.cooldown_ms}
				format={(ms) => (ms === 0 ? '—' : `${(ms / 1000).toFixed(1)} s`)}
				onChange={(cooldown_ms) => setBehaviour({ cooldown_ms })}
			/>

			<div className="meme-subfield">
				<small>{text.refire}</small>
				<div className="filter-types">
					{REFIRES.map((refire) => (
						<button
							key={refire}
							type="button"
							className={
								behaviour.refire === refire
									? 'filter-type active'
									: 'filter-type'
							}
							onClick={() => setBehaviour({ refire })}
						>
							{text.refires[refire]}
						</button>
					))}
				</div>
			</div>

			<Slider
				label={text.jitter}
				min={0}
				max={0.5}
				step={0.01}
				value={behaviour.speed_jitter}
				format={(v) => (v === 0 ? '—' : `± ${Math.round(v * 100)} %`)}
				onChange={(speed_jitter) => setBehaviour({ speed_jitter })}
			/>
		</details>
	);
}

export default BehaviourPanel;
