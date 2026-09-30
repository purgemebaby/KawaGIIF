import { t } from "../../i18n/es";
import WaveText from "./WaveText";
import "./KawaTitle.css";

interface Props {
  /** Tamaño de la fuente. Todo lo demás escala con `em`. */
  size?: string;
  /** Si las letras ondean. Se desactiva donde el movimiento distraería. */
  animated?: boolean;
}

/**
 * El título de la app: Modak con relleno degradado violeta/chicle y contorno
 * doble, para el efecto de burbuja grafiteada.
 *
 * Se dibuja DOS veces superpuestas porque un elemento solo admite un
 * `-webkit-text-stroke`, y aquí hacen falta dos contornos: el oscuro pegado a
 * la letra (grosor de pegatina) y un filo claro por fuera. Ese filo claro es
 * lo que hace visible el título: el contorno oscuro por sí solo es casi del
 * mismo color que el fondo de la app y se funde con él.
 */
function KawaTitle({ size = "72px", animated = true }: Props) {
  const text = t.app.name;
  const content = animated ? <WaveText>{text}</WaveText> : text;

  return (
    <div className="kg-title-wrap" style={{ fontSize: size }}>
      {/* Detrás: aporta el filo claro exterior. */}
      <span className="kg-title-layer kg-title-keyline" aria-hidden="true">
        {content}
      </span>
      {/* Delante: relleno degradado y contorno oscuro. */}
      <span className="kg-title-layer kg-title-fill" aria-hidden="true">
        {content}
      </span>
      <span className="kg-title-sr">{text}</span>
    </div>
  );
}

export default KawaTitle;
