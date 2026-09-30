import { useEffect, useRef } from "react";
import { parseGIF, decompressFrames } from "gifuct-js";

interface GifFrame {
  dims: { top: number; left: number; width: number; height: number };
  delay: number;
  disposalType: number;
  patch: Uint8ClampedArray;
}

interface GifCanvasPlayerProps {
  src: string;
  speedMultiplier: number;
  className?: string;
  /** Se llama al decodificar, con las dimensiones reales del GIF. */
  onNaturalSize?: (width: number, height: number) => void;
}

/// El `<img>` nativo no expone ningún control de velocidad para GIF — se
/// decodifican los frames una sola vez con gifuct-js y se reproducen a mano
/// en un `<canvas>` con requestAnimationFrame, escalando el delay de cada
/// frame por `speedMultiplier` en cada tick (permite cambiar la velocidad
/// en vivo sin re-decodificar).
function GifCanvasPlayer({
  src,
  speedMultiplier,
  className,
  onNaturalSize,
}: GifCanvasPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(speedMultiplier);
  speedRef.current = speedMultiplier;
  // En una ref para que cambiar el callback no reinicie la decodificación.
  const onNaturalSizeRef = useRef(onNaturalSize);
  onNaturalSizeRef.current = onNaturalSize;

  useEffect(() => {
    let cancelled = false;
    let rafId = 0;

    async function load() {
      const buffer = await fetch(src).then((r) => r.arrayBuffer());
      const gif = parseGIF(buffer);
      const frames: GifFrame[] = decompressFrames(gif, true);
      if (cancelled || frames.length === 0) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = gif.lsd.width as number;
      const height = gif.lsd.height as number;
      canvas.width = width;
      canvas.height = height;
      onNaturalSizeRef.current?.(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const offscreen = document.createElement("canvas");
      offscreen.width = width;
      offscreen.height = height;
      const offCtx = offscreen.getContext("2d")!;

      let frameIndex = 0;
      let elapsed = 0;
      let lastTime = performance.now();
      let savedForDisposal3: ImageData | null = null;

      function drawFrame(frame: GifFrame) {
        if (frame.disposalType === 3 && !savedForDisposal3) {
          savedForDisposal3 = offCtx.getImageData(0, 0, width, height);
        }
        const patchCanvas = document.createElement("canvas");
        patchCanvas.width = frame.dims.width;
        patchCanvas.height = frame.dims.height;
        const patchCtx = patchCanvas.getContext("2d")!;
        const imgData = patchCtx.createImageData(frame.dims.width, frame.dims.height);
        imgData.data.set(frame.patch);
        patchCtx.putImageData(imgData, 0, 0);
        offCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

        ctx!.clearRect(0, 0, width, height);
        ctx!.drawImage(offscreen, 0, 0);

        if (frame.disposalType === 2) {
          offCtx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
        } else if (frame.disposalType === 3 && savedForDisposal3) {
          offCtx.putImageData(savedForDisposal3, 0, 0);
          savedForDisposal3 = null;
        }
      }

      function tick(now: number) {
        if (cancelled) return;
        const delta = now - lastTime;
        lastTime = now;
        elapsed += delta * speedRef.current;

        const currentFrame = frames[frameIndex];
        const frameDelay = Math.max(currentFrame.delay, 20);

        if (elapsed >= frameDelay) {
          elapsed = 0;
          drawFrame(currentFrame);
          frameIndex = (frameIndex + 1) % frames.length;
        }
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    }

    load();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [src]);

  return <canvas ref={canvasRef} className={className} />;
}

export default GifCanvasPlayer;
