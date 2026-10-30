import { t } from '../../i18n';
import type { Behaviour, Meme, Refire } from '../../lib/memeboard';
import Slider from '../ui/Slider';

interface BehaviourPanelProps {
	behaviour: Behaviour;
	onChange: (behaviour: Meme['behaviour']) => void;
}

const REFIRES: Refire[] = ['restart', 'stack', 'ignore'];
const MAX_COOLDOWN_MS = 30_000;
/** The pitch choices and the `speed_jitter` each one stands for. */
const PITCHES = [
	['off', 0],
	['low', 0.12],
	['high', 0.3],
] as const;

/** The pitch choice closest to a stored jitter, so values saved before the choices existed still show one. */
function pitchOf(jitter: number) {
	return PITCHES.reduce((best, p) =>
		Math.abs(p[1] - jitter) < Math.abs(best[1] - jitter) ? p : best,
	)[0];
}

/** What pressing the shortcut does: a minimum wait, what a second press does, and a varying pitch. */
function BehaviourPanel({ behaviour, onChange }: BehaviourPanelProps) {
	const text = t.memeboard.behaviour;
	const set = (patch: Partial<Behaviour>) =>
		onChange({ ...behaviour, ...patch });
	const pitch = pitchOf(behaviour.speed_jitter);

	return (
		<section className="meme-behaviour">
			<h4 className="meme-behaviour-title">{text.title}</h4>

			<div className="meme-option">
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
				<small className="meme-field-note">{text.cooldownHint}</small>
			</div>

			<div className="meme-option">
				<span className="meme-option-label">{text.refire}</span>
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
							aria-pressed={behaviour.refire === refire}
							onClick={() => set({ refire })}
						>
							{text.refires[refire]}
						</button>
					))}
				</div>
			</div>

			<div className="meme-option">
				<span className="meme-option-label">{text.pitch}</span>
				<div className="filter-types">
					{PITCHES.map(([id, jitter]) => (
						<button
							key={id}
							type="button"
							className={pitch === id ? 'filter-type active' : 'filter-type'}
							aria-pressed={pitch === id}
							onClick={() => set({ speed_jitter: jitter })}
						>
							{text.pitches[id]}
						</button>
					))}
				</div>
				<small className="meme-field-note">{text.pitchHint}</small>
			</div>
		</section>
	);
}

export default BehaviourPanel;
