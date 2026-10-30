import { t } from '../../i18n';
import type { Behaviour, Refire } from '../../lib/memeboard';
import ChoiceChips from '../ui/ChoiceChips';
import Slider from '../ui/Slider';

interface BehaviourPanelProps {
	behaviour: Behaviour;
	onChange: (behaviour: Behaviour) => void;
}

const REFIRES: readonly Refire[] = ['restart', 'stack', 'ignore'];
const MAX_COOLDOWN_MS = 30_000;
/** The pitch choices and the `speed_jitter` each one stands for. */
const PITCH_JITTER = { off: 0, low: 0.12, high: 0.3 } as const;
type Pitch = keyof typeof PITCH_JITTER;
const PITCHES = Object.keys(PITCH_JITTER) as Pitch[];

/** The pitch choice closest to a stored jitter, so values saved before the choices existed still show one. */
function pitchOf(jitter: number): Pitch {
	return PITCHES.reduce((best, p) =>
		Math.abs(PITCH_JITTER[p] - jitter) < Math.abs(PITCH_JITTER[best] - jitter)
			? p
			: best,
	);
}

/** What pressing the shortcut does: the cooldown, what a second press does, and a varying pitch. */
function BehaviourPanel({ behaviour, onChange }: BehaviourPanelProps) {
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
			</div>
			<div className="meme-field">
				<span>{text.pitch}</span>
				<ChoiceChips
					options={PITCHES}
					value={pitchOf(behaviour.speed_jitter)}
					label={(pitch) => text.pitches[pitch]}
					onChange={(pitch) => set({ speed_jitter: PITCH_JITTER[pitch] })}
					ariaLabel={text.pitch}
				/>
			</div>
		</>
	);
}

export default BehaviourPanel;
