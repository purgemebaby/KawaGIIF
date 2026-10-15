import { parseGIF, decompressFrame, type ParsedGif } from 'gifuct-js';

export type GifWorkerIn =
	| { type: 'init'; canvas: OffscreenCanvas; src: string; speed: number }
	| { type: 'speed'; speed: number };

export interface GifWorkerSize {
	type: 'size';
	width: number;
	height: number;
}

interface FrameSource {
	frameCount: number;
	/** Draws frame `index` on the canvas and returns how long it stays, in ms. */
	draw(index: number): Promise<number>;
}

type Ctx = OffscreenCanvasRenderingContext2D;
type RawFrame = Extract<ParsedGif['frames'][number], { image: unknown }>;

let speed = 1;

// Browsers show missing, 0 and <=10 ms delays as 100 ms.
function frameDelay(ms: number | null | undefined): number {
	return ms != null && ms > 10 ? ms : 100;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Frames are decoded on demand and closed after drawing, so none stay in RAM. */
async function decoderSource(
	buffer: ArrayBuffer,
	canvas: OffscreenCanvas,
	ctx: Ctx,
): Promise<FrameSource> {
	const decoder = new ImageDecoder({ data: buffer, type: 'image/gif' });
	await decoder.tracks.ready;
	// frameCount is only reliable once all the data is parsed.
	await decoder.completed;
	const frameCount = decoder.tracks.selectedTrack?.frameCount ?? 0;
	if (frameCount === 0) throw new Error('GIF without frames');

	return {
		frameCount,
		async draw(index) {
			const { image } = await decoder.decode({ frameIndex: index });
			// Durations are in microseconds.
			const delay = frameDelay(image.duration && image.duration / 1000);
			if (canvas.width !== image.displayWidth) {
				canvas.width = image.displayWidth;
				canvas.height = image.displayHeight;
			}
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(image, 0, 0);
			image.close();
			return delay;
		},
	};
}

/** Fallback for WebViews without ImageDecoder: gifuct decodes each frame on first use. */
function gifuctSource(
	buffer: ArrayBuffer,
	canvas: OffscreenCanvas,
	ctx: Ctx,
): FrameSource {
	const gif = parseGIF(buffer);
	// Blocks without an image (extensions) are not frames, so they are skipped.
	const rawFrames = gif.frames.filter((f): f is RawFrame => 'image' in f);
	if (rawFrames.length === 0) throw new Error('GIF without frames');

	const width = gif.lsd.width as number;
	const height = gif.lsd.height as number;
	canvas.width = width;
	canvas.height = height;

	const composed = new OffscreenCanvas(width, height);
	const composedCtx = composed.getContext('2d')!;
	let savedForDisposal3: ImageData | null = null;

	// One patch canvas and ImageData, reused while the patch size stays the same.
	const patchCanvas = new OffscreenCanvas(1, 1);
	const patchCtx = patchCanvas.getContext('2d')!;
	let imgData: ImageData | null = null;

	return {
		frameCount: rawFrames.length,
		async draw(index) {
			const frame = decompressFrame(rawFrames[index], gif.gct, true);
			if (frame.disposalType === 3 && !savedForDisposal3) {
				savedForDisposal3 = composedCtx.getImageData(0, 0, width, height);
			}
			const { left, top, width: pw, height: ph } = frame.dims;
			if (!imgData || imgData.width !== pw || imgData.height !== ph) {
				patchCanvas.width = pw;
				patchCanvas.height = ph;
				imgData = patchCtx.createImageData(pw, ph);
			}
			imgData.data.set(frame.patch);
			patchCtx.putImageData(imgData, 0, 0);
			composedCtx.drawImage(patchCanvas, left, top);

			ctx.clearRect(0, 0, width, height);
			ctx.drawImage(composed, 0, 0);

			if (frame.disposalType === 2) {
				composedCtx.clearRect(left, top, pw, ph);
			} else if (frame.disposalType === 3 && savedForDisposal3) {
				composedCtx.putImageData(savedForDisposal3, 0, 0);
				savedForDisposal3 = null;
			}
			return frameDelay(frame.delay);
		},
	};
}

async function openSource(
	buffer: ArrayBuffer,
	canvas: OffscreenCanvas,
	ctx: Ctx,
): Promise<FrameSource> {
	const hasDecoder =
		typeof ImageDecoder !== 'undefined' &&
		(await ImageDecoder.isTypeSupported('image/gif'));
	return hasDecoder
		? decoderSource(buffer, canvas, ctx)
		: gifuctSource(buffer, canvas, ctx);
}

async function play(canvas: OffscreenCanvas, src: string) {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	const buffer = await fetch(src).then((r) => r.arrayBuffer());
	const source = await openSource(buffer, canvas, ctx);

	let delay = await source.draw(0);
	const size: GifWorkerSize = {
		type: 'size',
		width: canvas.width,
		height: canvas.height,
	};
	self.postMessage(size);

	for (
		let index = 1;
		source.frameCount > 1;
		index = (index + 1) % source.frameCount
	) {
		await sleep(delay / speed);
		delay = await source.draw(index);
	}
}

self.onmessage = (e: MessageEvent<GifWorkerIn>) => {
	const msg = e.data;
	if (msg.type === 'speed') {
		speed = msg.speed;
		return;
	}
	speed = msg.speed;
	// A broken file or failed fetch just leaves the canvas empty.
	play(msg.canvas, msg.src).catch(() => {});
};
