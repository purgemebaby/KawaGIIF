import type { MediaType } from './media';

// Mirror of memeboard.rs.

export type Side = 'left' | 'right' | 'top' | 'bottom';

/** `t` ms after the start; `x`/`y` as a fraction (0..1) of the monitor. */
export interface PathPoint {
	t: number;
	x: number;
	y: number;
}

export type Animation =
	| { kind: 'static' }
	| { kind: 'pop' }
	| { kind: 'dvd_bounce' }
	| { kind: 'bounce' }
	| { kind: 'shake' }
	| { kind: 'cross'; from: Side }
	| { kind: 'fall' }
	| { kind: 'path'; points: PathPoint[] };

export type AnimationKind = Animation['kind'];

export type Anchor =
	| { kind: 'cursor' }
	| { kind: 'center' }
	| { kind: 'random' }
	| { kind: 'fixed'; x: number; y: number };

/** What a second press does while the meme still plays. */
export type Refire = 'restart' | 'stack' | 'ignore';

export interface Behaviour {
	cooldown_ms: number;
	refire: Refire;
	/** Each play runs at a random speed within 1 ± this (0..0.5). */
	speed_jitter: number;
}

/** A saved look and behaviour, applied to memes from the editor. */
export interface Preset {
	id: string;
	name: string;
	animation: Animation;
	anchor: Anchor;
	size: number;
	behaviour: Behaviour;
}

export interface Meme {
	id: string;
	name: string;
	visual: string | null;
	audio: string | null;
	animation: Animation;
	anchor: Anchor;
	/** Longer side of the visual as a fraction of the monitor's shorter one. */
	size: number;
	volume: number;
	/** Only used without sound. */
	duration_ms: number | null;
	/** Canonical `Ctrl+Alt+Digit1` form, keys as `KeyboardEvent.code`. */
	hotkey: string | null;
	behaviour: Behaviour;
	fire_count: number;
}

export interface MemeView extends Meme {
	hotkey_conflict: boolean;
}

export interface MemeboardView {
	memes: MemeView[];
	stop_hotkey: string;
	stop_conflict: boolean;
	presets: Preset[];
	max_hotkeys: number;
	max_meme_ms: number;
}

export type HotkeyRefusal =
	'invalid' | 'needs_modifier' | 'reserved' | 'duplicate' | 'limit';

export interface StageVisual {
	path: string;
	media_type: MediaType;
	width: number | null;
	height: number | null;
}

/** The `meme-fire` event. `cursor` is a fraction of the stage. */
export interface StageFire {
	instance: string;
	meme: Meme;
	visual: StageVisual | null;
	duration_ms: number;
	/** Playback speed of the visual, matching the sound's. */
	speed: number;
	cursor: [number, number];
}

export const ANIMATION_KINDS: AnimationKind[] = [
	'pop',
	'static',
	'dvd_bounce',
	'bounce',
	'shake',
	'cross',
	'fall',
	'path',
];

/** The animation of a kind with its default options. */
export function defaultAnimation(kind: AnimationKind): Animation {
	switch (kind) {
		case 'cross':
			return { kind, from: 'left' };
		case 'path':
			return { kind, points: [] };
		default:
			return { kind };
	}
}

const MODIFIERS = ['Ctrl', 'Alt', 'Shift'] as const;

/** `KeyboardEvent.code` of a modifier, which alone is no hotkey. */
const MODIFIER_CODES = new Set([
	'ControlLeft',
	'ControlRight',
	'AltLeft',
	'AltRight',
	'ShiftLeft',
	'ShiftRight',
	'MetaLeft',
	'MetaRight',
	'AltGraph',
]);

/** The canonical hotkey of a key press, or null while only modifiers are held. AltGr reaches us as Ctrl+Alt. */
export function hotkeyFromEvent(e: KeyboardEvent): string | null {
	if (MODIFIER_CODES.has(e.code) || !e.code) return null;
	const altGr = e.getModifierState('AltGraph');
	const held = {
		Ctrl: e.ctrlKey || altGr,
		Alt: e.altKey || altGr,
		Shift: e.shiftKey,
	};
	const parts: string[] = MODIFIERS.filter((m) => held[m]);
	if (e.metaKey) parts.unshift('Win');
	parts.push(e.code);
	return parts.join('+');
}

/** How a hotkey reads in the UI: `Ctrl+Alt` shows as `Ctrl+AltGr`, `Digit1` as `1`, `KeyA` as `A`. */
export function displayHotkey(hotkey: string): string {
	const parts = hotkey.split('+');
	const key = parts.pop() ?? '';
	const label = key
		.replace(/^Digit/, '')
		.replace(/^Key/, '')
		.replace(/^Numpad/, 'Num ');
	const mods =
		parts.includes('Ctrl') && parts.includes('Alt')
			? ['Ctrl', 'AltGr', ...parts.filter((p) => p !== 'Ctrl' && p !== 'Alt')]
			: parts;
	return [...mods, label].join('+');
}
