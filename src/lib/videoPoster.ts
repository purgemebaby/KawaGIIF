import { invoke } from './ipc';

// must match media_thumbs::THUMB_SIDE
const THUMB_SIDE = 320;
// the poster is the frame at this point: past a fade-in, never past a short clip's end
const POSTER_AT_S = 1;
const POSTER_AT_FRACTION = 0.1;
const WEBP_QUALITY = 0.85;

const listeners = new Map<string, Set<() => void>>();
const asked = new Set<string>();
// one video at a time: each poster waits for the one before
let queue: Promise<void> = Promise.resolve();

/** Calls `onReady` once the poster of `id` is saved. Returns the unsubscribe. */
export function onPosterReady(id: string, onReady: () => void): () => void {
	let set = listeners.get(id);
	if (!set) listeners.set(id, (set = new Set()));
	set.add(onReady);
	return () => {
		set.delete(onReady);
		if (set.size === 0) listeners.delete(id);
	};
}

/** Draws an MP4's poster from its first second and hands it to Rust (save_video_thumb). Asked once per session. */
export function requestPoster(id: string, url: string): void {
	if (asked.has(id)) return;
	asked.add(id);
	queue = queue
		.then(() => drawPoster(url))
		.then((bytes) =>
			invoke('save_video_thumb', bytes, { headers: { 'media-id': id } }),
		)
		.then(() => listeners.get(id)?.forEach((ready) => ready()))
		.catch(() => {});
}

/** The frame as WEBP bytes. The video is let go of right after, so the queue never holds more than one. */
async function drawPoster(url: string): Promise<Uint8Array> {
	const video = document.createElement('video');
	// the asset protocol answers with CORS, so the canvas stays readable
	video.crossOrigin = 'anonymous';
	video.muted = true;
	video.preload = 'metadata';
	try {
		await new Promise<void>((resolve, reject) => {
			video.onloadedmetadata = () => {
				video.currentTime = Math.min(
					POSTER_AT_S,
					video.duration * POSTER_AT_FRACTION,
				);
			};
			video.onseeked = () => resolve();
			video.onerror = () => reject(video.error);
			video.src = url;
		});
		const scale = Math.min(
			1,
			THUMB_SIDE / Math.max(video.videoWidth, video.videoHeight),
		);
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
		canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
		canvas
			.getContext('2d')
			?.drawImage(video, 0, 0, canvas.width, canvas.height);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
		);
		if (!blob) throw new Error('poster encode failed');
		return new Uint8Array(await blob.arrayBuffer());
	} finally {
		video.removeAttribute('src');
		video.load();
	}
}
