import { useEffect, useState } from 'react';
import { t } from '../../i18n';
import { invoke } from '../../lib/ipc';
import {
	displayHotkey,
	hotkeyFromEvent,
	type HotkeyRefusal,
} from '../../lib/memeboard';
import ResetButton from '../ui/ResetButton';

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

// under memeboard.rs PAUSE_LIMIT (15 s)
const PAUSE_RENEW_MS = 10_000;

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

	// While recording, the memes' hotkeys are paused: pressing one types it here instead of firing it. Rust lifts a
	// pause nobody renews after 15 s, so it is renewed while the field still listens.
	useEffect(() => {
		if (!listening) return;
		const pause = (paused: boolean) =>
			invoke('pause_meme_hotkeys', { paused }).catch(() => {});
		pause(true);
		const renew = window.setInterval(() => pause(true), PAUSE_RENEW_MS);
		return () => {
			window.clearInterval(renew);
			pause(false);
		};
	}, [listening]);

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
			// a refused combination (taken, reserved…) is never set: the field keeps its value and says why
			invoke<HotkeyRefusal | null>('check_hotkey', {
				hotkey,
				memeId: memeId ?? null,
			})
				.then((result) => {
					if (result) setRefusal(result);
					else onChange(hotkey);
				})
				.catch(() => {});
		};
		// capture, so Escape doesn't also close the editor around it
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, [listening, onChange, memeId]);

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
				{/* the reset sits in the row's right column, so the key stays centred with or without it */}
				{clearable && value && (
					<ResetButton
						label={t.memeboard.editor.hotkeyClear}
						onReset={() => onChange(null)}
						className="hotkey-field-clear"
					/>
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
