import { useEffect, useState } from 'react';
import { useLoadingIndicator } from '../hooks/useLoadingIndicator';
import KawaTitle from './brand/KawaTitle';
import './LoadingScreen.css';

// floor so the neon bar is on screen long enough to be seen; the real length comes from `steps`
const MIN_DURATION_MS = 2200;
// share of the bar per second the walker may move, so it never jumps ahead of the work
const MAX_SPEED_PER_S = 0.9;

// the neon bar's geometry, in the svg's 360x24 user space
const TRACK_START = 12;
const TRACK_END = 348;
const TRACK_Y = 12;

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
	const fillEnd = TRACK_START + progress * (TRACK_END - TRACK_START);

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
				<svg className="loading-neon" viewBox="0 0 360 24" aria-hidden="true">
					<defs>
						<linearGradient
							id="loading-glow-gradient"
							gradientUnits="userSpaceOnUse"
							x1={TRACK_START}
							y1={TRACK_Y}
							x2={TRACK_END}
							y2={TRACK_Y}
						>
							<stop offset="0" className="kg-neon-stop-pink" />
							<stop offset="1" className="kg-neon-stop-purple" />
						</linearGradient>
						{/* user space: a horizontal line has a zero-height box, which would hide a box-relative filter */}
						<filter
							id="loading-glow-blur"
							filterUnits="userSpaceOnUse"
							x="-24"
							y="-24"
							width="408"
							height="72"
						>
							<feGaussianBlur stdDeviation="6" />
						</filter>
					</defs>

					<line
						className="loading-track"
						x1={TRACK_START}
						y1={TRACK_Y}
						x2={TRACK_END}
						y2={TRACK_Y}
					/>

					{progress > 0 && (
						<>
							<line
								className="kg-neon-halo loading-glow-halo"
								x1={TRACK_START}
								y1={TRACK_Y}
								x2={fillEnd}
								y2={TRACK_Y}
							/>
							<line
								className="kg-neon-line loading-glow-line"
								x1={TRACK_START}
								y1={TRACK_Y}
								x2={fillEnd}
								y2={TRACK_Y}
							/>
							<circle
								className="loading-tip-bloom"
								cx={fillEnd}
								cy={TRACK_Y}
								r={7}
							/>
							<circle className="loading-tip" cx={fillEnd} cy={TRACK_Y} r={4} />
						</>
					)}
				</svg>

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
