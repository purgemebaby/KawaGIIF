import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { motionValue, springValue, type MotionValue } from 'motion';
import { invoke } from '../lib/ipc';
import { useTauriEvent } from './useTauriEvent';

// Pendulum: tilt from the grip, proportional to the horizontal speed (logical px/s).
const TILT_PER_SPEED = 0.01;
const MAX_TILT = 12;
// Air drag: the far end trails behind the grip (skew), more the faster it moves.
const SKEW_PER_SPEED = 0.006;
const MAX_SKEW = 6;
// Squash and stretch: speed stretches it along the hanging axis; lifting stretches, dropping squashes.
const STRETCH_PER_SPEED = 0.00003;
const STRETCH_PER_RISE = 0.00002;
const MAX_STRETCH = 0.04;
const CARRY_SIDE = 150; // longest side while carried, in logical px
const MAX_CARRIED_SCALE = 0.5; // never above this, so the tilted corners stay inside the window
const STILL_MS = 70; // no move for this long = the hand stopped, so every target goes back to rest
const LOST_CHECK_MS = 2500; // no move for this long: ask Rust whether the item is still carried
const LOST_POLL_MS = 1000;
const SETTLE_LIMIT_MS = 1800;
// Lightly damped springs: they overshoot once and settle, like something hanging from a claw.
const TILT_SPRING = { stiffness: 140, damping: 14, mass: 0.7 };
const SKEW_SPRING = { stiffness: 220, damping: 18 };
const STRETCH_SPRING = { stiffness: 300, damping: 16 };
// The drop grows it back to full size with the same elastic pop as a spawn.
export const POP_BOUNCE = 0.25;
export const POP_SECONDS = 0.45;
const LIFT_SPRING = { bounce: POP_BOUNCE, visualDuration: POP_SECONDS };

interface Session {
	drop: () => void;
	finish: () => void;
}

const clamp = (value: number, limit: number) =>
	Math.max(-limit, Math.min(limit, value));

const carriedScale = () =>
	Math.min(
		MAX_CARRIED_SCALE,
		CARRY_SIDE / Math.max(window.innerWidth, window.innerHeight, 1),
	);

/**
 * Claw-machine pickup: from `start()` to `pickup-ended` the media hangs from its top edge and reacts to the window's
 * speed (pendulum tilt, trailing skew, squash and stretch, all on Motion springs), then settles and clears its
 * transform so it costs nothing afterwards.
 */
export function useSwing(target: RefObject<HTMLElement | null>) {
	const carrying = useRef(false);
	const session = useRef<Session | null>(null);

	const start = useCallback(() => {
		const el = target.current;
		if (!el || session.current) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		carrying.current = true;

		const goals = {
			tilt: motionValue<number>(0),
			skew: motionValue<number>(0),
			stretch: motionValue<number>(0),
		};
		const tilt = springValue(goals.tilt, TILT_SPRING);
		const skew = springValue(goals.skew, SKEW_SPRING);
		const stretch = springValue(goals.stretch, STRETCH_SPRING);
		const lift = springValue<number>(carriedScale(), LIFT_SPRING);
		const springs: MotionValue<number>[] = [tilt, skew, stretch, lift];

		const render = () => {
			const sy = 1 + stretch.get();
			const sx = 1 / Math.sqrt(sy); // keep the volume: longer means thinner
			const s = lift.get();
			el.style.transform = `rotate(${tilt.get()}deg) skewX(${skew.get()}deg) scale(${s * sx}, ${s * sy})`;
		};
		const unsubscribe = springs.map((value) => value.on('change', render));
		el.style.transformOrigin = 'top center';
		render(); // small on the very next frame, not after the first spring tick

		// fit_overlay_to_media resizes the window mid-carry: keep the carried side at CARRY_SIDE
		const onResize = () => lift.jump(carriedScale());
		window.addEventListener('resize', onResize);

		const rest = () => {
			goals.tilt.set(0);
			goals.skew.set(0);
			goals.stretch.set(0);
		};

		let last: { x: number; y: number; t: number } | null = null;
		let stillTimer = 0;
		let lastMoveAt = performance.now();
		let checking = false;
		let restFrame = 0;
		let dropped = false;

		// Moving right drags the grip along and the body lags behind: clockwise tilt, bottom skewed back to the left.
		const unlisten = getCurrentWindow().onMoved(({ payload }) => {
			if (dropped) return;
			const now = performance.now();
			if (last) {
				const seconds = Math.max(now - last.t, 1) / 1000;
				const vx = (payload.x - last.x) / window.devicePixelRatio / seconds;
				const vy = (payload.y - last.y) / window.devicePixelRatio / seconds;
				const speed = Math.hypot(vx, vy);
				goals.tilt.set(clamp(vx * TILT_PER_SPEED, MAX_TILT));
				goals.skew.set(clamp(-vx * SKEW_PER_SPEED, MAX_SKEW));
				goals.stretch.set(
					clamp(speed * STRETCH_PER_SPEED - vy * STRETCH_PER_RISE, MAX_STRETCH),
				);
			}
			last = { x: payload.x, y: payload.y, t: now };
			window.clearTimeout(stillTimer);
			stillTimer = window.setTimeout(rest, STILL_MS);
			lastMoveAt = now;
		});

		// Rust switches the arrival Carried -> Pop on release, before `pickup-ended`: a missed event still drops.
		const checkLost = () => {
			if (checking || performance.now() - lastMoveAt < LOST_CHECK_MS) return;
			checking = true;
			invoke<{ arrival: string } | null>('get_slot_info')
				.then((info) => {
					if (info?.arrival !== 'carried') drop();
				})
				.catch(() => {}) // a failed ask is retried on the next poll
				.finally(() => {
					checking = false;
				});
		};
		const lostPoll = window.setInterval(checkLost, LOST_POLL_MS);

		// After the drop the window is an ordinary one again: a new grab must not feed the swing.
		const stopFollowing = () => {
			window.clearTimeout(stillTimer);
			window.clearInterval(lostPoll);
			window.removeEventListener('resize', onResize);
			unlisten.then((stop) => stop());
		};

		const finish = () => {
			if (!dropped) {
				dropped = true; // a poll answer arriving later must not drop a finished session
				stopFollowing();
			}
			cancelAnimationFrame(restFrame);
			unsubscribe.forEach((stop) => stop());
			springs.forEach((value) => value.destroy());
			Object.values(goals).forEach((value) => value.destroy());
			el.style.transform = '';
			el.style.transformOrigin = '';
			carrying.current = false;
			session.current = null;
		};

		const drop = () => {
			if (dropped) return;
			dropped = true;
			stopFollowing();
			carrying.current = false;
			rest();
			lift.set(1);
			const startedAt = performance.now();
			// the springs start on the next frame, so wait one before asking whether they are done
			const waitForRest = () => {
				const resting = springs.every((value) => !value.isAnimating());
				if (resting || performance.now() - startedAt > SETTLE_LIMIT_MS)
					finish();
				else restFrame = requestAnimationFrame(waitForRest);
			};
			restFrame = requestAnimationFrame(() => {
				restFrame = requestAnimationFrame(waitForRest);
			});
		};

		session.current = { drop, finish };
	}, [target]);

	useTauriEvent('pickup-ended', () => session.current?.drop(), 'self');
	useTauriEvent('slot-released', () => session.current?.finish(), 'self');
	useEffect(() => () => session.current?.finish(), []);

	return { carrying, start };
}
