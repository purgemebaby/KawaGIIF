import { motion } from 'motion/react';
import { t } from '../../i18n';
import type { MediaItem } from '../../lib/media';
import type { MemeView } from '../../lib/memeboard';
import { prefersReducedMotion } from '../../lib/navAnimations';
import type { Point } from '../../lib/sketch';
import MediaThumb from '../MediaThumb';
import SketchFrame from '../ui/SketchFrame';
import SketchIcon from '../ui/SketchIcon';

interface PodiumProps {
	memes: MemeView[];
	byId: Map<string, MediaItem>;
}

// Steps left to right as 2nd, 1st, 3rd, like a real podium; heights in px.
const STEP_ORDER = [1, 0, 2];
const STEP_HEIGHT = [150, 108, 78];
const GROW_S = 0.55;
// third grows first, the winner last
const growDelay = (place: number) => (2 - place) * 0.22;

// A block drawn by hand: a box whose top sags and whose sides lean a little. Stretched to whatever height it has.
const BLOCK: readonly Point[] = [
	[2, 4],
	[30, 2.5],
	[70, 3.5],
	[98, 2],
	[97.5, 50],
	[98.5, 99],
	[50, 98.5],
	[1.5, 99],
	[2.5, 50],
];

// The floor line under the three steps, a thin long shape.
const FLOOR: readonly Point[] = [
	[0, 2],
	[50, 1],
	[100, 2.5],
	[100, 3.5],
	[50, 2.5],
	[0, 3.5],
];

/** The three most played memes floating over a hand-drawn podium that grows, the rest ranked below. */
function Podium({ memes, byId }: PodiumProps) {
	const ranked = memes
		.filter((m) => m.fire_count > 0)
		.sort(
			(a, b) => b.fire_count - a.fire_count || a.name.localeCompare(b.name),
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
			<MediaThumb item={item} alt={meme.name} />
		) : (
			<SketchIcon name="laugh" size={56} />
		);
	};

	return (
		<div className="podium">
			<div className="podium-steps">
				{STEP_ORDER.map((place) => {
					const meme = ranked[place];
					if (!meme) return <div key={place} className="podium-step" />;
					const landed = growDelay(place) + GROW_S;
					return (
						<div
							key={meme.id}
							className={`podium-step podium-step--${place + 1}`}
							title={meme.name}
						>
							<motion.div
								className="podium-float"
								initial={still ? false : { opacity: 0, y: -40 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									delay: still ? 0 : landed,
									type: 'spring',
									bounce: 0.45,
								}}
							>
								{/* the bob runs on its own element so it doesn't fight the drop-in */}
								<div
									className={
										still ? 'podium-visual' : 'podium-visual is-bobbing'
									}
								>
									{visualOf(meme)}
								</div>
							</motion.div>

							<motion.div
								className="podium-block"
								initial={still ? false : { height: 0 }}
								animate={{ height: STEP_HEIGHT[place] }}
								transition={{
									delay: still ? 0 : growDelay(place),
									duration: GROW_S,
									ease: [0.34, 1.3, 0.64, 1],
								}}
							>
								<SketchFrame
									className="podium-block-frame"
									viewBox="0 0 100 100"
									seed={`podium-${place}`}
									points={BLOCK}
									roughness={1.4}
								/>
								<span className="podium-place">{place + 1}</span>
								<span className="podium-plays">
									{t.memeboard.podium.plays(meme.fire_count)}
								</span>
							</motion.div>
						</div>
					);
				})}
			</div>
			<SketchFrame
				className="podium-floor"
				viewBox="0 0 100 5"
				seed="podium-floor"
				points={FLOOR}
				roughness={0.6}
			/>

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
