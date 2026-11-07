import { useEffect, useState } from 'react';
import { convertFileSrc, invoke, listenToSelf } from '../lib/ipc';
import type { StageFire } from '../lib/memeboard';
import MemeLayer from '../components/memeboard/MemeLayer';

/** Size of the stage window, which Rust stretches over the cursor's monitor before every meme. */
function useStageSize(): [number, number] {
	const [size, setSize] = useState<[number, number]>([
		window.innerWidth,
		window.innerHeight,
	]);
	useEffect(() => {
		const onResize = () => setSize([window.innerWidth, window.innerHeight]);
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, []);
	return size;
}

/** A layer on the stage. `key` stays the same when a combo press takes it over, so its visual isn't loaded again. */
type Layer = StageFire & { key: string };

/** Adds a fired meme, or puts it in place of the layer it takes over (keeping that layer's key). */
function withFired(layers: Layer[], fired: StageFire): Layer[] {
	const at = fired.replaces
		? layers.findIndex((l) => l.instance === fired.replaces)
		: -1;
	if (at < 0) return [...layers, { ...fired, key: fired.instance }];
	const next = [...layers];
	next[at] = { ...fired, key: layers[at].key };
	return next;
}

// The memeboard's overlay: every meme on screen is one layer here. Click-through, never focused.
function MemeStageApp() {
	const [layers, setLayers] = useState<Layer[]>([]);
	const [stageW, stageH] = useStageSize();

	useEffect(() => {
		const offs = [
			listenToSelf<StageFire>('meme-fire', (e) =>
				setLayers((prev) => withFired(prev, e.payload)),
			),
			listenToSelf<string>('meme-end', (e) =>
				setLayers((prev) => prev.filter((l) => l.instance !== e.payload)),
			),
			listenToSelf<null>('meme-clear', () => setLayers([])),
		];
		return () => offs.forEach((off) => off.then((f) => f()));
	}, []);

	// Empty at startup too, so the hidden stage goes to sleep right away instead of after its first meme. Rust hides
	// the window unless a sound-only meme is still counted as playing.
	const empty = layers.length === 0;
	useEffect(() => {
		if (empty) invoke('meme_stage_idle').catch(() => {});
	}, [empty]);

	const remove = (instance: string) =>
		setLayers((prev) => prev.filter((l) => l.instance !== instance));

	return (
		<div className="meme-stage">
			{layers.map(
				(layer) =>
					layer.visual && (
						<MemeLayer
							key={layer.key}
							url={convertFileSrc(layer.visual.path)}
							mediaType={layer.visual.media_type}
							naturalW={layer.visual.width}
							naturalH={layer.visual.height}
							animation={layer.meme.animation}
							anchor={layer.meme.anchor}
							size={layer.meme.size}
							durationMs={layer.duration_ms}
							speed={layer.speed}
							motionSpeed={layer.meme.motion_speed}
							cursor={layer.cursor}
							stack={layer.stack}
							party={layer.party.map((v) => ({
								url: convertFileSrc(v.path),
								mediaType: v.media_type,
								poster: v.poster ? convertFileSrc(v.poster) : null,
							}))}
							combo={layer.combo}
							stageW={stageW}
							stageH={stageH}
							onDone={() => remove(layer.instance)}
						/>
					),
			)}
		</div>
	);
}

export default MemeStageApp;
