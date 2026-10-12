import { useEffect, useState } from 'react';
import { useLoadingIndicator } from '../hooks/useLoadingIndicator';
import KawaTitle from './brand/KawaTitle';
import './LoadingScreen.css';

// short floor so a fast boot doesn't flash; the real length comes from `steps`
const MIN_DURATION_MS = 1200;
// share of the bar per second the walker may move, so it never jumps ahead of the work
const MAX_SPEED_PER_S = 0.9;

interface LoadingScreenProps {
	onDone: () => void;
	steps: Promise<unknown>[];
}

function LoadingScreen({ onDone, steps }: LoadingScreenProps) {
	const [progress, setProgress] = useState(0);
	const [leaving, setLeaving] = useState(false);
	const { url: walkerUrl, ready: walkerReady } = useLoadingIndicator();
	const [walkerFailed, setWalkerFailed] = useState(false);

	useEffect(() => {
		const start = performance.now();
		let last = start;
		let frame = 0;
		let shown = 0;
		let finished = 0;
		// a failed step still counts as finished: the app opens anyway
		const markDone = () => {
			finished += 1;
		};
		for (const step of steps) step.then(markDone, markDone);

		const tick = (now: number) => {
			const elapsed = now - start;
			const byWork = steps.length ? finished / steps.length : 1;
			const target = Math.min(byWork, elapsed / MIN_DURATION_MS);
			shown = Math.min(target, shown + ((now - last) / 1000) * MAX_SPEED_PER_S);
			last = now;
			setProgress(shown);

			if (shown >= 1) {
				setLeaving(true);
				return;
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	}, [steps]);

	const walkerStyle = {
		left: `calc(${progress * 100}% - ${progress} * var(--kg-walker-size))`,
	};

	return (
		<div
			className={leaving ? 'loading-screen is-leaving' : 'loading-screen'}
			onTransitionEnd={(e) => {
				if (leaving && e.target === e.currentTarget) onDone();
			}}
		>
			<KawaTitle size="clamp(56px, 12vw, 104px)" />

			<div
				className="loading-bar"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(progress * 100)}
			>
				<div
					className="loading-bar-fill"
					style={{ width: `${progress * 100}%` }}
				/>
				{walkerReady &&
					(walkerUrl && !walkerFailed ? (
						<img
							className="loading-walker loading-walker--image"
							src={walkerUrl}
							alt=""
							draggable={false}
							style={walkerStyle}
							onError={() => setWalkerFailed(true)}
						/>
					) : (
						<div
							className="loading-walker kg-walker-ball"
							style={walkerStyle}
						/>
					))}
			</div>
		</div>
	);
}

export default LoadingScreen;
