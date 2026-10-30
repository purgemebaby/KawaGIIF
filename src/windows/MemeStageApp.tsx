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

// The memeboard's overlay: every meme on screen is one layer here. Click-through, never focused.
function MemeStageApp() {
	const [layers, setLayers] = useState<StageFire[]>([]);
	const [stageW, stageH] = useStageSize();

	useEffect(() => {
		const offs = [
			listenToSelf<StageFire>('meme-fire', (e) =>
				setLayers((prev) => [...prev, e.payload]),
			),
			listenToSelf<string>('meme-end', (e) =>
				setLayers((prev) => prev.filter((l) => l.instance !== e.payload)),
			),
			listenToSelf<null>('meme-clear', () => setLayers([])),
		];
		return () => offs.forEach((off) => off.then((f) => f()));
	}, []);

	const [hadLayers, setHadLayers] = useState(false);
	useEffect(() => {
		if (layers.length > 0) {
			setHadLayers(true);
		} else if (hadLayers) {
			// Rust hides the window unless a sound-only meme is still counted as playing
			invoke('meme_stage_idle').catch(() => {});
			setHadLayers(false);
		}
	}, [layers.length, hadLayers]);

	const remove = (instance: string) =>
		setLayers((prev) => prev.filter((l) => l.instance !== instance));

	return (
		<div className="meme-stage">
			{layers.map(
				(layer) =>
					layer.visual && (
						<MemeLayer
							key={layer.instance}
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
