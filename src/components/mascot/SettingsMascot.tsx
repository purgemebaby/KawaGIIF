import { useEffect, useRef } from 'react';
import settingsBody from '../../assets/mascot/settings-body.png';
import settingsWrench from '../../assets/mascot/settings-wrench.webp';
import { clamp } from '../../lib/overlayGeometry';
import './Mascot.css';

// where the gripping hand sits on the 420x348 canvas, and where the wrench's jaw points at rest
const PIVOT_X = 0.874;
const PIVOT_Y = 0.816;
const REST_ANGLE = 116.6;
const MIN_TURN = -50;
const MAX_TURN = 60;

const POINTABLE = '.settings-section, .ram-gauge';

/** How far the wrench turns from rest to point at `box`, clamped so it never swings behind the chibi. */
function wrenchTurn(root: HTMLElement, box: Element): number {
	const mascot = root.getBoundingClientRect();
	const target = box.getBoundingClientRect();
	const dx =
		target.left + target.width / 2 - (mascot.left + mascot.width * PIVOT_X);
	const dy =
		target.top + target.height / 2 - (mascot.top + mascot.height * PIVOT_Y);
	const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
	const turn = ((((angle - REST_ANGLE) % 360) + 540) % 360) - 180;
	return clamp(turn, MIN_TURN, MAX_TURN);
}

/** Peeks over the RAM gauge and turns its wrench towards whichever settings box the mouse is over. */
function SettingsMascot() {
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const root = rootRef.current;
		const screen = root?.closest('.settings-screen');
		if (!root || !screen) return;

		let current: Element | null = null;
		const point = (turn: number) =>
			root.style.setProperty('--wrench-angle', `${turn}deg`);

		const onOver = (event: Event) => {
			const box = (event.target as Element).closest(POINTABLE);
			if (!box || box === current) return;
			current = box;
			point(wrenchTurn(root, box));
		};
		const onLeave = () => {
			current = null;
			point(0);
		};

		screen.addEventListener('pointerover', onOver);
		screen.addEventListener('pointerleave', onLeave);
		return () => {
			screen.removeEventListener('pointerover', onOver);
			screen.removeEventListener('pointerleave', onLeave);
		};
	}, []);

	return (
		<div ref={rootRef} className="settings-mascot" aria-hidden="true">
			<img src={settingsBody} alt="" draggable={false} decoding="async" />
			<img
				className="settings-mascot-wrench"
				src={settingsWrench}
				alt=""
				draggable={false}
				decoding="async"
			/>
		</div>
	);
}

export default SettingsMascot;
