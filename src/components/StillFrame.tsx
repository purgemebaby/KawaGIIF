import { useEffect, useRef } from 'react';

interface StillFrameProps {
	url: string;
	className?: string;
	alt?: string;
}

// a tile is small: twice its CSS size covers HiDPI screens without keeping a full-size frame around
const MAX_SIDE = 192;

/** The first frame of an animated image, painted once onto a small canvas. The decoded GIF is dropped right after,
 so a strip of dozens of GIFs costs a few thumbnails instead of dozens of animations. */
function StillFrame({ url, className = '', alt = '' }: StillFrameProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		let cancelled = false;
		const image = new Image();
		image.decoding = 'async';
		image.onload = () => {
			const canvas = canvasRef.current;
			if (cancelled || !canvas) return;
			const scale = Math.min(
				1,
				MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight),
			);
			canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
			canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
			canvas
				.getContext('2d')
				?.drawImage(image, 0, 0, canvas.width, canvas.height);
			image.src = '';
		};
		image.src = url;
		return () => {
			cancelled = true;
			image.src = '';
		};
	}, [url]);

	return (
		<canvas ref={canvasRef} className={className} role="img" aria-label={alt} />
	);
}

export default StillFrame;
