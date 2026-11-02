import { useMemo, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { t } from '../../i18n';
import type { MediaItem } from '../../lib/media';
import type { MemeView } from '../../lib/memeboard';
import { prefersReducedMotion } from '../../lib/navAnimations';
import MediaThumb from '../MediaThumb';
import SketchIcon from '../ui/SketchIcon';

interface PodiumProps {
	memes: MemeView[];
	byId: Map<string, MediaItem>;
}

// The whole podium in one fixed viewBox; the floating memes are placed in its units turned into %.
const VIEW_W = 360;
const VIEW_H = 252;
const FLOOR_Y = 240;
const STEP_W = 108;
const STEP_RADIUS = 6;
// left to right the steps are 2nd, 1st, 3rd; place is 0-based
const STEPS = [
	{ place: 1, x: 8, height: 96 },
	{ place: 0, x: 126, height: 136 },
	{ place: 2, x: 244, height: 68 },
] as const;
// gold, silver, bronze (tokens.css)
const MEDALS = ['gold', 'silver', 'bronze'] as const;
// the winner gets the most sparkles
const SPARKLES = [6, 4, 4];
const MEME_W = 82; // viewBox units, the floating meme's box
const GROW_S = 0.5;
// third grows first, the winner last
const growDelay = (place: number) => (2 - place) * 0.2;

/** The three most played memes floating, glowing, over a gold, silver and bronze podium that grows; the rest below. */
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
					<defs>
						{/* polished metal: light at the top, the medal colour, a darker foot */}
						{MEDALS.map((medal) => (
							<linearGradient
								key={medal}
								id={`podium-${medal}`}
								x1="0"
								y1="0"
								x2="0"
								y2="1"
							>
								<stop offset="0" stopColor={`var(--kg-medal-${medal}-light)`} />
								<stop offset="0.35" stopColor={`var(--kg-medal-${medal})`} />
								<stop offset="1" stopColor={`var(--kg-medal-${medal}-dark)`} />
							</linearGradient>
						))}
					</defs>
					{STEPS.map(({ place, x, height }) => {
						const meme = ranked[place];
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
								<rect
									className="podium-block"
									x={x}
									y={top}
									width={STEP_W}
									height={height}
									rx={STEP_RADIUS}
									fill={meme ? `url(#podium-${MEDALS[place]})` : 'none'}
								/>
								{meme && (
									// the shine along the top edge
									<rect
										className="podium-shine"
										x={x + 6}
										y={top + 4}
										width={STEP_W - 12}
										height={5}
										rx={2.5}
									/>
								)}
								<text className="podium-place" x={centre} y={top + 32}>
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
					<line
						className="podium-floor"
						x1={0}
						y1={FLOOR_Y}
						x2={VIEW_W}
						y2={FLOOR_Y}
					/>
				</svg>

				{/* the memes float in HTML over their step, glowing in their medal's colour */}
				{STEPS.map(({ place, x, height }) => {
					const meme = ranked[place];
					if (!meme) return null;
					const medal = { '--medal': `var(--kg-medal-${MEDALS[place]})` };
					return (
						<motion.div
							key={meme.id}
							className="podium-meme"
							title={meme.name}
							style={
								{
									...medal,
									left: `${((x + STEP_W / 2 - MEME_W / 2) / VIEW_W) * 100}%`,
									bottom: `${((VIEW_H - FLOOR_Y + height + 4) / VIEW_H) * 100}%`,
									width: `${(MEME_W / VIEW_W) * 100}%`,
								} as CSSProperties
							}
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
							{!still &&
								Array.from({ length: SPARKLES[place] }, (_, i) => (
									<span key={i} className="podium-sparkle" aria-hidden="true">
										✦
									</span>
								))}
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
