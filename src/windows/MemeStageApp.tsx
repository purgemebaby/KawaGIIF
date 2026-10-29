import { useEffect, useState } from 'react';
import { convertFileSrc, invoke, listenToSelf } from '../lib/ipc';
import type { StageFire } from '../lib/memeboard';
import { t } from '../i18n';
import MemeLayer from '../components/memeboard/MemeLayer';

/** What Rust reports while a path is recorded (meme_path.rs). */
type RecordPhase =
	| { phase: 'countdown'; n: number }
	| { phase: 'recording' }
	| { phase: 'done' };

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
	const [recording, setRecording] = useState<RecordPhase | null>(null);

	useEffect(() => {
		const offs = [
			listenToSelf<StageFire>('meme-fire', (e) =>
				setLayers((prev) => [...prev, e.payload]),
			),
			listenToSelf<string>('meme-end', (e) =>
				setLayers((prev) => prev.filter((l) => l.instance !== e.payload)),
			),
			listenToSelf<null>('meme-clear', () => setLayers([])),
			listenToSelf<RecordPhase>('path-recording', (e) =>
				setRecording(e.payload.phase === 'done' ? null : e.payload),
			),
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
			{recording && (
				<div className="meme-record-veil">
					<p className="meme-record-title">
						{recording.phase === 'countdown'
							? t.memeboard.path.countdown(recording.n)
							: t.memeboard.path.record}
					</p>
					<p className="meme-record-hint">{t.memeboard.path.hint}</p>
				</div>
			)}
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
