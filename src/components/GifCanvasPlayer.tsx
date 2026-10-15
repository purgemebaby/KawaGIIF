import { useEffect, useRef } from 'react';
import type { GifWorkerIn, GifWorkerSize } from '../workers/gifPlayer.worker';

interface GifCanvasPlayerProps {
	src: string;
	speedMultiplier: number;
	className?: string;
	onNaturalSize?: (width: number, height: number) => void;
}

/** Decoding and drawing run in a worker, so the renderer all windows share stays free. */
function GifCanvasPlayer({
	src,
	speedMultiplier,
	className,
	onNaturalSize,
}: GifCanvasPlayerProps) {
	const hostRef = useRef<HTMLDivElement>(null);
	const workerRef = useRef<Worker | null>(null);
	const speedRef = useRef(speedMultiplier);
	speedRef.current = speedMultiplier;
	const onNaturalSizeRef = useRef(onNaturalSize);
	onNaturalSizeRef.current = onNaturalSize;

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		// A canvas can be handed to a worker only once, so every run gets a new one.
		const canvas = document.createElement('canvas');
		canvas.className = className ?? '';
		host.append(canvas);

		const worker = new Worker(
			new URL('../workers/gifPlayer.worker.ts', import.meta.url),
			{ type: 'module' },
		);
		worker.onmessage = (e: MessageEvent<GifWorkerSize>) =>
			onNaturalSizeRef.current?.(e.data.width, e.data.height);
		const offscreen = canvas.transferControlToOffscreen();
		const init: GifWorkerIn = {
			type: 'init',
			canvas: offscreen,
			src,
			speed: speedRef.current,
		};
		worker.postMessage(init, [offscreen]);
		workerRef.current = worker;

		return () => {
			worker.terminate();
			workerRef.current = null;
			canvas.remove();
		};
	}, [src, className]);

	useEffect(() => {
		const speed: GifWorkerIn = { type: 'speed', speed: speedMultiplier };
		workerRef.current?.postMessage(speed);
	}, [speedMultiplier]);

	// `contents` keeps the wrapper out of the flex layout the canvas sits in.
	return <div ref={hostRef} style={{ display: 'contents' }} />;
}

export default GifCanvasPlayer;
