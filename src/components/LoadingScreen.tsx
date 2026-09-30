import { useEffect, useState } from "react";
import KawaTitle from "./brand/KawaTitle";
import "./LoadingScreen.css";

/** Suelo de duración: la pantalla se ve al menos esto, aunque todo cargue ya. */
const MIN_DURATION_MS = 5000;

interface Props {
  /** Se llama cuando la pantalla ha terminado de desvanecerse. */
  onDone: () => void;
  /** Trabajo real de arranque. La barra no llega al final hasta que resuelve. */
  work: Promise<unknown>;
}

/**
 * Pantalla de carga: el título y una barra cuyo indicador camina de un
 * extremo al otro.
 *
 * Vive dentro de la ventana de control como una pantalla más, no como una
 * ventana aparte: así se ahorra la restricción de que las ventanas
 * transparentes solo pueden crearse al arrancar.
 */
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
      // Mientras el trabajo real no termine, la barra se queda en el 92%: es
      // preferible a llegar al 100% y quedarse ahí parada, que es lo que hace
      // que una carga parezca colgada.
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
        // Solo la transición del propio contenedor, no las de dentro.
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
        {/* El indicador se coloca descontando su propio ancho, para que al
            100% quede pegado al final de la barra y no se salga. */}
        <div
          className="loading-walker"
          style={{ left: `calc(${progress * 100}% - ${progress} * var(--walker-size))` }}
        />
      </div>
    </div>
  );
}

export default LoadingScreen;
