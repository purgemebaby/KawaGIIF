import { useState } from 'react';
import { t } from '../../i18n';
import { invoke } from '../../lib/ipc';
import { notifyError } from '../../lib/notify';
import type { Meme, Preset } from '../../lib/memeboard';

interface StyleRowProps {
	draft: Meme;
	presets: Preset[];
	onChange: (meme: Meme) => void;
}

// a nil id asks Rust for a new one
const NEW_PRESET_ID = '00000000-0000-0000-0000-000000000000';

/** Saved styles (animation, position, size and what the shortcut does): load one into the meme, or save the current one. */
function StyleRow({ draft, presets, onChange }: StyleRowProps) {
	const [naming, setNaming] = useState(false);
	const [name, setName] = useState('');
	const [picked, setPicked] = useState('');
	const text = t.memeboard.styles;

	const load = (id: string) => {
		setPicked(id);
		const preset = presets.find((p) => p.id === id);
		if (!preset) return;
		onChange({
			...draft,
			animation: preset.animation,
			anchor: preset.anchor,
			size: preset.size,
			behaviour: preset.behaviour,
		});
	};

	const save = async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		const preset: Preset = {
			id: NEW_PRESET_ID,
			name: trimmed,
			animation: draft.animation,
			anchor: draft.anchor,
			size: draft.size,
			behaviour: draft.behaviour,
		};
		try {
			const saved = await invoke<Preset>('save_preset', { preset });
			setPicked(saved.id);
			setNaming(false);
			setName('');
		} catch (e) {
			notifyError(e);
		}
	};

	const remove = (id: string) => {
		if (picked === id) setPicked('');
		invoke('delete_preset', { id }).catch(notifyError);
	};

	return (
		<div className="meme-styles">
			{naming ? (
				<>
					<input
						className="filter-search"
						autoFocus
						placeholder={text.name}
						value={name}
						maxLength={60}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') save();
						}}
					/>
					<button
						type="button"
						className="kg-btn kg-btn--primary kg-btn--sm"
						disabled={!name.trim()}
						onClick={save}
					>
						{text.save}
					</button>
					<button
						type="button"
						className="kg-btn kg-btn--ghost kg-btn--sm"
						onClick={() => setNaming(false)}
					>
						{t.common.cancel}
					</button>
				</>
			) : (
				<>
					<select
						className="filter-search"
						value={picked}
						disabled={presets.length === 0}
						onChange={(e) => load(e.target.value)}
					>
						<option value="">
							{presets.length === 0 ? text.none : text.load}
						</option>
						{presets.map((preset) => (
							<option key={preset.id} value={preset.id}>
								{preset.name}
							</option>
						))}
					</select>
					{picked && (
						<button
							type="button"
							className="kg-btn kg-btn--ghost kg-btn--sm"
							title={text.delete}
							onClick={() => remove(picked)}
						>
							×
						</button>
					)}
					<button
						type="button"
						className="kg-btn kg-btn--secondary kg-btn--sm"
						onClick={() => setNaming(true)}
					>
						{text.saveCurrent}
					</button>
				</>
			)}
		</div>
	);
}

export default StyleRow;
