import { useMemo } from 'react';
import { motion } from 'motion/react';
import { t } from '../../i18n';
import type { MediaItem } from '../../lib/media';
import type { MemeView } from '../../lib/memeboard';
import { prefersReducedMotion } from '../../lib/navAnimations';
import { seedOf, sketchStroke, type Point } from '../../lib/sketch';
import MediaThumb from '../MediaThumb';
import SketchIcon from '../ui/SketchIcon';

interface PodiumProps {
	memes: MemeView[];
	byId: Map<string, MediaItem>;
}

// The whole podium in one fixed viewBox, so the hand-drawn wobble is never stretched.
const VIEW_W = 360;
const VIEW_H = 252;
const FLOOR_Y = 240;
const STEP_W = 108;
// left to right the steps are 2nd, 1st, 3rd; place is 0-based
const STEPS = [
	{ place: 1, x: 8, height: 96 },
	{ place: 0, x: 126, height: 136 },
	{ place: 2, x: 244, height: 68 },
] as const;
const FILLS = ['var(--kg-px-sun)', 'var(--kg-px-purple)', 'var(--kg-px-pink)'];
const MEME_W = 82; // viewBox units, the floating meme's box
const GROW_S = 0.5;
// third grows first, the winner last
const growDelay = (place: number) => (2 - place) * 0.2;

/** One step as a slightly uneven box standing on the floor. */
function stepOutline(x: number, height: number): Point[] {
	const top = FLOOR_Y - height;
	return [
		[x, FLOOR_Y],
		[x + 0.6, top + 1],
		[x + STEP_W / 2, top - 0.8],
		[x + STEP_W - 0.4, top + 0.6],
		[x + STEP_W, FLOOR_Y],
	];
}

/** The three most played memes floating over a hand-drawn podium that grows; the rest ranked below. */
function Podium({ memes, byId }: PodiumProps) {
	const ranked = useMemo(
		() =>
			memes
				.filter((m) => m.fire_count > 0)
				.sort(
					(a, b) => b.fire_count - a.fire_count || a.name.localeCompare(b.name),
				),
		[memes],
	);
	const drawn = useMemo(
		() => ({
			steps: STEPS.map(({ place, x, height }) =>
				sketchStroke(stepOutline(x, height), {
					seed: seedOf(`podium.step.${place}`),
					closed: true,
					roughness: 1.4,
				}),
			),
			floor: sketchStroke(
				[
					[0, FLOOR_Y],
					[VIEW_W / 2, FLOOR_Y + 0.8],
					[VIEW_W, FLOOR_Y],
				],
				{ seed: seedOf('podium.floor'), roughness: 1.2 },
			),
		}),
		[],
	);

	if (ranked.length === 0) {
		return (
			<p className="storage-empty-hint podium-empty">
				{t.memeboard.podium.empty}
			</p>
		);
	}

	const still = prefersReducedMotion();
	const visualOf = (meme: MemeView) => {
		const item =
			(meme.visual && byId.get(meme.visual)) ||
			(meme.audio && byId.get(meme.audio));
		return item ? (
			<MediaThumb item={item} motion="always" alt={meme.name} />
		) : (
			<SketchIcon name="laugh" size={56} />
		);
	};

	return (
		<div className="podium">
			<div
				className="podium-stage"
				style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
			>
				<svg
					className="podium-svg"
					viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
					aria-hidden="true"
				>
					{STEPS.map(({ place, x, height }, i) => {
						const meme = ranked[place];
						const [first, second] = drawn.steps[i];
						const top = FLOOR_Y - height;
						const centre = x + STEP_W / 2;
						return (
							<motion.g
								key={place}
								className={meme ? 'podium-step' : 'podium-step is-empty'}
								style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
								initial={still ? false : { scaleY: 0 }}
								animate={{ scaleY: 1 }}
								transition={{
									delay: still ? 0 : growDelay(place),
									duration: GROW_S,
									ease: [0.34, 1.3, 0.64, 1],
								}}
							>
								{meme && (
									<path className="podium-fill" d={first} fill={FILLS[place]} />
								)}
								<path className="podium-stroke" d={first} />
								<path
									className="podium-stroke podium-stroke--second"
									d={second}
								/>
								<text className="podium-place" x={centre} y={top + 30}>
									{place + 1}
								</text>
								{meme && (
									<text
										className="podium-plays"
										x={centre}
										y={top + height / 2 + 22}
									>
										{t.memeboard.podium.plays(meme.fire_count)}
									</text>
								)}
							</motion.g>
						);
					})}
					<path className="podium-stroke" d={drawn.floor[0]} />
					<path
						className="podium-stroke podium-stroke--second"
						d={drawn.floor[1]}
					/>
				</svg>

				{/* the memes float in HTML over their step, placed in viewBox units turned into % */}
				{STEPS.map(({ place, x, height }) => {
					const meme = ranked[place];
					if (!meme) return null;
					return (
						<motion.div
							key={meme.id}
							className="podium-meme"
							title={meme.name}
							style={{
								left: `${((x + STEP_W / 2 - MEME_W / 2) / VIEW_W) * 100}%`,
								bottom: `${((VIEW_H - FLOOR_Y + height + 4) / VIEW_H) * 100}%`,
								width: `${(MEME_W / VIEW_W) * 100}%`,
							}}
							initial={still ? false : { opacity: 0, y: -30 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								delay: still ? 0 : growDelay(place) + GROW_S,
								type: 'spring',
								bounce: 0.45,
							}}
						>
							<div
								className={still ? 'podium-visual' : 'podium-visual is-bobbing'}
							>
								{visualOf(meme)}
							</div>
						</motion.div>
					);
				})}
			</div>

			{ranked.length > 3 && (
				<ol className="podium-rest" start={4}>
					{ranked.slice(3).map((meme) => (
						<li key={meme.id}>
							<span>{meme.name}</span>
							<small>{t.memeboard.podium.plays(meme.fire_count)}</small>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

export default Podium;
