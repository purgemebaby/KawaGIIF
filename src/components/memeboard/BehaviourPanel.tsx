import { useState } from 'react';
import { t } from '../../i18n';
import type { Behaviour, Refire } from '../../lib/memeboard';
import SettingsToggle from '../settings/SettingsToggle';
import ChoiceChips from '../ui/ChoiceChips';
import Slider from '../ui/Slider';

interface BehaviourPanelProps {
	behaviour: Behaviour;
	onChange: (behaviour: Behaviour) => void;
	/** "Memes at once" of the Memeboard settings: with 1, nothing can be stacked. */
	maxConcurrent: number;
}

const REFIRES: readonly Refire[] = ['restart', 'stack', 'ignore'];
const MAX_COOLDOWN_MS = 30_000;
// `speed_jitter`: each play runs at a random speed (and so pitch) within 1 ± it; must match memeboard.rs MAX_SPEED_JITTER
const MIN_JITTER = 0.01;
const MAX_JITTER = 0.5;
const DEFAULT_JITTER = 0.12;

/** What pressing the shortcut does: the cooldown and what a second press does. */
function BehaviourPanel({
	behaviour,
	onChange,
	maxConcurrent,
}: BehaviourPanelProps) {
	const text = t.memeboard.behaviour;
	const set = (patch: Partial<Behaviour>) =>
		onChange({ ...behaviour, ...patch });

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
				{/* the setting wins over this choice: say so, instead of a meme that silently restarts */}
				{behaviour.refire === 'stack' && maxConcurrent <= 1 && (
					<small className="meme-field-note">{text.stackLimited}</small>
				)}
			</div>
		</>
	);
}

/** A pitch that varies at random on each play: a switch, and how much it varies while on. */
export function RandomPitch({
	behaviour,
	onChange,
}: Omit<BehaviourPanelProps, 'maxConcurrent'>) {
	const text = t.memeboard.behaviour;
	// switching the random pitch off and on again brings back the last variation
	const [lastJitter, setLastJitter] = useState(
		behaviour.speed_jitter > 0 ? behaviour.speed_jitter : DEFAULT_JITTER,
	);
	const randomPitch = behaviour.speed_jitter > 0;

	return (
		<>
			<SettingsToggle
				checked={randomPitch}
				text={{ label: text.pitch }}
				onChange={(on) =>
					onChange({ ...behaviour, speed_jitter: on ? lastJitter : 0 })
				}
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
						onChange({ ...behaviour, speed_jitter });
					}}
				/>
			)}
		</>
	);
}

export default BehaviourPanel;
