import type { Screen } from '../components/navItems';
import { directionOf } from './radial';

type Offset = { x: number; y: number };

/** Home sits at the origin. Every other screen one viewport away, towards its ring sector. */
function worldPosition(screen: Screen, width: number, height: number): Offset {
	if (screen === 'home') return { x: 0, y: 0 };
	const { x, y } = directionOf(screen);
	const reach = Math.max(Math.abs(x), Math.abs(y));
	return { x: (x / reach) * width, y: (y / reach) * height };
}

/** How far the camera moves, in px, to get from one screen to the other. */
export function worldOffset(
	from: Screen,
	to: Screen,
	width: number,
	height: number,
): Offset {
	const a = worldPosition(from, width, height);
	const b = worldPosition(to, width, height);
	return { x: Math.round(b.x - a.x), y: Math.round(b.y - a.y) };
}

type TransitionKind = 'pan' | 'burst' | 'unburst' | 'instant';

/** How a screen change is shown. One place to give a pair its own animation. */
export function transitionKind(from: Screen, to: Screen): TransitionKind {
	if (from === to) return 'instant';
	if (from === 'home' && to === 'editor') return 'burst';
	if (from === 'editor' && to === 'home') return 'unburst';
	return 'pan';
}
