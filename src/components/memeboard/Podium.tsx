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

// Steps drawn left to right as 2nd, 1st, 3rd, like a real podium; heights in px.
const STEP_ORDER = [1, 0, 2];
const STEP_HEIGHT = [120, 84, 60];

/** The three most played memes on an animated podium, the rest ranked below. */
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
	const thumbOf = (meme: MemeView) => {
		const item =
			(meme.visual && byId.get(meme.visual)) ||
			(meme.audio && byId.get(meme.audio));
		return item ? (
			<MediaThumb item={item} alt={meme.name} />
		) : (
			<SketchIcon name="laugh" size={40} />
		);
	};

	return (
		<div className="podium">
			<div className="podium-steps">
				{STEP_ORDER.map((place) => {
					const meme = ranked[place];
					if (!meme)
						return <div key={place} className="podium-step is-empty" />;
					return (
						<motion.div
							key={meme.id}
							className={`podium-step podium-step--${place + 1}`}
							initial={still ? false : { opacity: 0, y: 40 }}
							animate={{ opacity: 1, y: 0 }}
							// third climbs first, the winner last
							transition={{
								delay: still ? 0 : (2 - place) * 0.18,
								type: 'spring',
								bounce: 0.4,
							}}
						>
							<div className="podium-thumb">{thumbOf(meme)}</div>
							<strong className="podium-name" title={meme.name}>
								{meme.name}
							</strong>
							<small>{t.memeboard.podium.plays(meme.fire_count)}</small>
							<div
								className="podium-block"
								style={{ height: STEP_HEIGHT[place] }}
							>
								{place + 1}
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
