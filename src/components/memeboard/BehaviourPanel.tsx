import { useState } from 'react';
import { t } from '../../i18n';
import type { Behaviour, Refire } from '../../lib/memeboard';
import SettingsToggle from '../settings/SettingsToggle';
import ChoiceChips from '../ui/ChoiceChips';
import Slider from '../ui/Slider';

interface BehaviourPanelProps {
	behaviour: Behaviour;
	onChange: (behaviour: Behaviour) => void;
}

const REFIRES: readonly Refire[] = ['restart', 'stack', 'ignore'];
const MAX_COOLDOWN_MS = 30_000;
// `speed_jitter`: each play runs at a random speed (and so pitch) within 1 ± it; must match memeboard.rs MAX_SPEED_JITTER
const MIN_JITTER = 0.01;
const MAX_JITTER = 0.5;
const DEFAULT_JITTER = 0.12;

/** What pressing the shortcut does: the cooldown, what a second press does, and a pitch that can vary at random. */
function BehaviourPanel({ behaviour, onChange }: BehaviourPanelProps) {
	const text = t.memeboard.behaviour;
	const set = (patch: Partial<Behaviour>) =>
		onChange({ ...behaviour, ...patch });
	// switching the random pitch off and on again brings back the last variation
	const [lastJitter, setLastJitter] = useState(
		behaviour.speed_jitter > 0 ? behaviour.speed_jitter : DEFAULT_JITTER,
	);
	const randomPitch = behaviour.speed_jitter > 0;

	return (
		<>
			<Slider
				label={text.cooldown}
				min={0}
				max={MAX_COOLDOWN_MS}
				step={250}
				value={behaviour.cooldown_ms}
				format={(ms) =>
					ms === 0 ? text.noWait : `${(ms / 1000).toFixed(1)} s`
				}
				onChange={(cooldown_ms) => set({ cooldown_ms })}
			/>
			<div className="meme-field">
				<span>{text.refire}</span>
				<ChoiceChips
					options={REFIRES}
					value={behaviour.refire}
					label={(refire) => text.refires[refire]}
					onChange={(refire) => set({ refire })}
					ariaLabel={text.refire}
				/>
			</div>
			<SettingsToggle
				checked={randomPitch}
				text={{ label: text.pitch }}
				onChange={(on) => set({ speed_jitter: on ? lastJitter : 0 })}
			/>
			{randomPitch && (
				<Slider
					label={text.pitchRange}
					min={MIN_JITTER}
					max={MAX_JITTER}
					step={0.01}
					value={behaviour.speed_jitter}
					format={(v) => `± ${Math.round(v * 100)} %`}
					onChange={(speed_jitter) => {
						setLastJitter(speed_jitter);
						set({ speed_jitter });
					}}
				/>
			)}
		</>
	);
}

export default BehaviourPanel;
