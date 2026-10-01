import { useEffect, useState } from "react";
import KawaTitle from "./brand/KawaTitle";
import "./LoadingScreen.css";

const MIN_DURATION_MS = 5000;

interface Props {
  onDone: () => void;
  work: Promise<unknown>;
}

function LoadingScreen({ onDone, work }: Props) {
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const start = performance.now();
    let frame = 0;
    let workDone = false;
    work.finally(() => {
      workDone = true;
    });

    const tick = () => {
      const elapsed = performance.now() - start;
      const byTime = elapsed / MIN_DURATION_MS;
      const target = workDone ? byTime : Math.min(byTime, 0.92);
      setProgress(Math.min(target, 1));

      if (elapsed >= MIN_DURATION_MS && workDone) {
        setLeaving(true);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [work]);

  return (
    <div
      className={leaving ? "loading-screen is-leaving" : "loading-screen"}
      onTransitionEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onDone();
      }}
    >
      <KawaTitle size="clamp(56px, 12vw, 104px)" />

      <div
        className="loading-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div className="loading-bar-fill" style={{ width: `${progress * 100}%` }} />
        <div
          className="loading-walker"
          style={{ left: `calc(${progress * 100}% - ${progress} * var(--walker-size))` }}
        />
      </div>
    </div>
  );
}

export default LoadingScreen;
