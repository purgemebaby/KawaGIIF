import { useEffect, useState } from "react";
import { invoke } from "../../lib/ipc";
import { t } from "../../i18n/es";
import "./RamGauge.css";

interface SystemStats {
  total_ram_mb: number;
  used_ram_mb: number;
  available_ram_mb: number;
  app_ram_mb: number;
}

const REFRESH_MS = 2000;

/** Arco de 240°, abierto por abajo, como un cuentakilómetros. */
const START_ANGLE = -210;
const SWEEP = 240;

function toGb(mb: number): string {
  return (mb / 1024).toFixed(1);
}

/** Punto del arco para un ángulo dado, en el sistema de coordenadas del SVG. */
function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, radius: number, fromDeg: number, toDeg: number) {
  const start = polar(cx, cy, radius, fromDeg);
  const end = polar(cx, cy, radius, toDeg);
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * Medidor de memoria: la aguja marca el uso de RAM del sistema y debajo se
 * indica, aparte, lo que se estima que consume la app.
 *
 * Son dos números de fiabilidad distinta y por eso se presentan distinto: el
 * del sistema es exacto, el de la app es una suma de procesos que el motor web
 * crea por su cuenta y solo vale como orden de magnitud.
 */
function RamGauge() {
  const [stats, setStats] = useState<SystemStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = async () => {
      const next = await invoke<SystemStats>("get_system_stats");
      if (!cancelled) setStats(next);
    };
    read();
    // Solo refresca mientras Ajustes está montado: recorrer la lista de
    // procesos no es gratis y no tiene sentido hacerlo en segundo plano.
    const timer = window.setInterval(read, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!stats || stats.total_ram_mb === 0) {
    return <p className="empty-state">{t.common.loading}</p>;
  }

  const ratio = Math.min(stats.used_ram_mb / stats.total_ram_mb, 1);
  const needleAngle = START_ANGLE + SWEEP * ratio;
  const needle = polar(60, 58, 34, needleAngle);

  return (
    <div className="ram-gauge">
      <svg viewBox="0 0 120 90" className="ram-gauge-dial" role="img" aria-label={t.settings.ram.label}>
        {/* Arco de fondo: el recorrido completo. */}
        <path
          d={arcPath(60, 58, 44, START_ANGLE, START_ANGLE + SWEEP)}
          className="ram-gauge-track"
        />
        {/* Arco de progreso: la parte ocupada. */}
        <path
          d={arcPath(60, 58, 44, START_ANGLE, needleAngle)}
          className={ratio > 0.85 ? "ram-gauge-fill is-high" : "ram-gauge-fill"}
        />
        <line x1="60" y1="58" x2={needle.x} y2={needle.y} className="ram-gauge-needle" />
        <circle cx="60" cy="58" r="3.5" className="ram-gauge-hub" />
      </svg>

      <div className="ram-gauge-readout">
        <strong>
          {toGb(stats.used_ram_mb)} / {toGb(stats.total_ram_mb)} GB
        </strong>
        <small>{t.settings.ram.system}</small>
      </div>

      <p className="ram-gauge-app">
        {t.settings.ram.app(stats.app_ram_mb)}
        <span className="ram-gauge-estimate">{t.settings.ram.estimateNote}</span>
      </p>
    </div>
  );
}

export default RamGauge;
