import type { MediaType } from './media';

// Mirror of memeboard.rs.

/** `random` picks one of the four on each play. */
export type Side = 'left' | 'right' | 'top' | 'bottom' | 'random';
const CONCRETE_SIDES = ['left', 'right', 'top', 'bottom'] as const;

/** `t` ms after the start; `x`/`y` as a fraction (0..1) of the monitor. */
export interface PathPoint {
	t: number;
	x: number;
	y: number;
}

export type Animation =
	| { kind: 'static' }
	| { kind: 'pop'; enter_ms: number; exit_ms: number }
	| { kind: 'dvd_bounce'; colors: boolean }
	| { kind: 'bounce' }
	| { kind: 'shake'; intensity: number }
	/** `at`: where on the other axis it crosses, 0..1 of the monitor (height for left/right, else width); `random_at`
	 picks it anew on each play. */
	| { kind: 'cross'; from: Side; at: number; random_at: boolean }
	/** `at`: where along the width it falls, 0..1, or anywhere with `random_at`. */
	| { kind: 'fall'; at: number; random_at: boolean }
	| { kind: 'path'; points: PathPoint[] }
	/** Tiny pop-ups of the saved memes' media, `count` of them (5..60). */
	| { kind: 'party'; count: number }
	/** In a corner, `margin` (0..0.2 of the shorter side) in: a combo counter that grows flames every `step` presses
	 and resets after `window_ms` without one. */
	| {
			kind: 'combo';
			corner: Corner;
			margin: number;
			step: number;
			window_ms: number;
	  };

export type Corner = 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';

type AnimationKind = Animation['kind'];

export type Anchor =
	| { kind: 'cursor' }
	| { kind: 'center' }
	| { kind: 'random' }
	| { kind: 'fixed'; x: number; y: number };

/** Which monitor a meme shows on. */
type MonitorChoice = { kind: 'cursor' } | { kind: 'named'; name: string };

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
	motion_speed: number;
	playback_speed: number;
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
	/** How long it lasts; null = as long as its sound (or one GIF loop). Longer loops it. */
	duration_ms: number | null;
	/** How fast the animation moves (1 = normal). */
	motion_speed: number;
	/** How fast the visual and the sound play (1 = as recorded). */
	playback_speed: number;
	monitor: MonitorChoice;
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

interface StageVisual {
	path: string;
	media_type: MediaType;
	width: number | null;
	height: number | null;
}

/** The `meme-fire` event. `cursor` is a fraction of the stage. */
/** A party pop-up: for a video, the poster that shows when too many videos are already playing. */
interface PartyVisual extends StageVisual {
	poster: string | null;
}

export interface StageFire {
	instance: string;
	meme: Meme;
	visual: StageVisual | null;
	duration_ms: number;
	/** Playback speed of the visual, matching the sound's. */
	speed: number;
	cursor: [number, number];
	/** How many copies of this meme were already on screen. */
	stack: number;
	/** Party: one visual per pop-up. */
	party: PartyVisual[];
	/** Combo: this press's count (1..99); 0 for other animations. */
	combo: number;
	/** The layer this play takes over (a combo press on its own meme) instead of adding one. */
	replaces: string | null;
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
	'party',
	'combo',
];

// must match memeboard.rs
export const PARTY_COUNT_RANGE: [number, number] = [5, 60];
export const COMBO_STEP_RANGE: [number, number] = [2, 6];
export const COMBO_WINDOW_RANGE: [number, number] = [1000, 10_000];
export const COMBO_MAX_MARGIN = 0.2;

// Defaults and ranges of the animation options; memeboard.rs clamps to the same.
export const POP_IN_MS = 280;
export const POP_OUT_MS = 220;
export const POP_MS_RANGE: [number, number] = [80, 1500];
const SHAKE_INTENSITY = 0.25;
export const SPEED_RANGE: [number, number] = [0.25, 3];

/** The animation of a kind with its default options. */
export function defaultAnimation(kind: AnimationKind): Animation {
	switch (kind) {
		case 'cross':
			return { kind, from: 'left', at: 0.5, random_at: false };
		case 'fall':
			return { kind, at: 0.5, random_at: false };
		case 'path':
			return { kind, points: [] };
		case 'pop':
			return { kind, enter_ms: POP_IN_MS, exit_ms: POP_OUT_MS };
		case 'dvd_bounce':
			return { kind, colors: true };
		case 'shake':
			return { kind, intensity: SHAKE_INTENSITY };
		case 'party':
			return { kind, count: 20 };
		case 'combo':
			return {
				kind,
				corner: 'bottom_right',
				margin: 0.04,
				step: 3,
				window_ms: 3000,
			};
		default:
			return { kind };
	}
}

/** One play's animation, with a random side or position picked (memeboard.rs `Animation::resolved`). The stage
 already gets them picked; the editor preview picks again on each loop. */
export function resolveAnimation(animation: Animation): Animation {
	switch (animation.kind) {
		case 'cross': {
			const from =
				animation.from === 'random'
					? CONCRETE_SIDES[Math.floor(Math.random() * CONCRETE_SIDES.length)]
					: animation.from;
			const at = animation.random_at ? Math.random() : animation.at;
			return { ...animation, from, at, random_at: false };
		}
		case 'fall':
			return animation.random_at
				? { ...animation, at: Math.random(), random_at: false }
				: animation;
		default:
			return animation;
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
