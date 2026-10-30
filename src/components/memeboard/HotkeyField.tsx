import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { invoke } from '../../lib/ipc';
import {
	displayHotkey,
	hotkeyFromEvent,
	type HotkeyRefusal,
} from '../../lib/memeboard';

interface HotkeyFieldProps {
	value: string | null;
	/** The meme it belongs to; none for the Stop all shortcut. */
	memeId?: string;
	onChange: (hotkey: string | null) => void;
	/** Reports whether the current value can be saved. */
	onValidity?: (ok: boolean) => void;
	clearable?: boolean;
	/** Shows the line on which keys work; errors always show. */
	hint?: boolean;
}

// A button that, once clicked, records the next key combination. Rust checks it (reserved, duplicate, the cap of 10).
function HotkeyField({
	value,
	memeId,
	onChange,
	onValidity,
	clearable = true,
	hint = true,
}: HotkeyFieldProps) {
	const [listening, setListening] = useState(false);
	const [refusal, setRefusal] = useState<HotkeyRefusal | null>(null);

	useEffect(() => {
		if (!value) {
			setRefusal(null);
			onValidity?.(true);
			return;
		}
		let cancelled = false;
		invoke<HotkeyRefusal | null>('check_hotkey', {
			hotkey: value,
			memeId: memeId ?? null,
		})
			.then((result) => {
				if (cancelled) return;
				setRefusal(result);
				onValidity?.(result === null);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
		// onValidity is a fresh closure each render; the check only depends on the value
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value, memeId]);

	useEffect(() => {
		if (!listening) return;
		const onKeyDown = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
				setListening(false);
				return;
			}
			const hotkey = hotkeyFromEvent(e);
			if (!hotkey) return;
			setListening(false);
			onChange(hotkey);
		};
		// capture, so Escape doesn't also close the editor around it
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, [listening, onChange]);

	return (
		<div className="hotkey-field">
			<div className="hotkey-field-row">
				<button
					type="button"
					className={`hotkey-capture${listening ? ' is-listening' : ''}${refusal ? ' is-refused' : ''}`}
					onClick={() => setListening(true)}
					onBlur={() => setListening(false)}
				>
					{listening
						? t.memeboard.editor.hotkeyListening
						: value
							? displayHotkey(value)
							: t.memeboard.editor.hotkeyPlaceholder}
				</button>
				{clearable && value && (
					<button
						type="button"
						className="kg-btn kg-btn--ghost kg-btn--sm"
						onClick={() => onChange(null)}
					>
						{t.memeboard.editor.hotkeyClear}
					</button>
				)}
			</div>
			{refusal ? (
				<small className="hotkey-field-error">
					{t.memeboard.refusals[refusal]}
				</small>
			) : (
				hint && (
					<small className="hotkey-field-hint">
						{t.memeboard.editor.hotkeyHint}
					</small>
				)
			)}
		</div>
	);
}

export default HotkeyField;
