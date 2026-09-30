import { useMemo } from "react";
import "./KawaiiBackdrop.css";

/**
 * Caras en dos versiones: con los ojos abiertos y guiñando. El guiño es
 * cambiar de una a otra durante un instante.
 */
const FACES: { open: string; wink: string }[] = [
  { open: "(◕‿◕)", wink: "(◕‿−)" },
  { open: "(＾▽＾)", wink: "(＾▽−)" },
  { open: "(・◡・)", wink: "(・◡−)" },
  { open: "(◔◡◔)", wink: "(◔◡−)" },
  { open: "(ᵔ◡ᵔ)", wink: "(ᵔ◡−)" },
  { open: "(≧◡≦)", wink: "(≧◡−)" },
];

/** Filas y columnas del patrón. Se repite en mosaico para llenar la pantalla. */
const ROWS = 9;
const COLS = 7;

/**
 * Generador determinista sencillo. Se usa para repartir caras y retardos sin
 * que cambien en cada render (que haría parpadear el fondo entero al
 * repintar) ni depender de una semilla externa.
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Fondo decorativo: caritas kawaii ASCII de contorno desplazándose despacio
 * en diagonal, con guiños ocasionales.
 *
 * Se construye con DOM y CSS en vez de con un GIF a propósito: un GIF no
 * dejaría que cada cara guiñe por su cuenta, no se adaptaría al color del
 * tema, pesaría más y se vería pixelado al escalar.
 *
 * El bucle es continuo porque se dibujan DOS copias del patrón en diagonal y
 * la animación desplaza exactamente lo que mide una: cuando la primera sale
 * por un extremo, la segunda está justo donde empezó la primera, así que el
 * salto al reiniciar es invisible.
 */
function KawaiiBackdrop() {
  const tile = useMemo(() => {
    const cells: { face: string; wink: string; delay: number; duration: number }[] = [];
    for (let i = 0; i < ROWS * COLS; i++) {
      const pick = FACES[Math.floor(pseudoRandom(i) * FACES.length)];
      cells.push({
        face: pick.open,
        wink: pick.wink,
        // Retardos largos y muy repartidos: si varias guiñaran a la vez se
        // notaría que es un bucle en vez de un fondo vivo.
        delay: pseudoRandom(i + 100) * 24,
        duration: 6 + pseudoRandom(i + 200) * 6,
      });
    }
    return cells;
  }, []);

  const renderTile = (copy: number) => (
    <div className="kawaii-tile" key={copy} aria-hidden="true">
      {tile.map((cell, i) => (
        <span
          className="kawaii-face"
          key={i}
          // El retardo y la duración van en línea porque son distintos para
          // cada cara; los heredan las dos capas del guiño desde el CSS.
          style={{
            animationDelay: `${cell.delay}s`,
            animationDuration: `${cell.duration}s`,
          }}
        >
          <span className="kawaii-face-open">{cell.face}</span>
          <span className="kawaii-face-wink">{cell.wink}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="kawaii-backdrop" aria-hidden="true">
      {/* La capa girada define el ángulo; dentro, el desplazamiento es solo
          horizontal. Ver la nota de arriba del CSS. */}
      <div className="kawaii-rotor">
        <div className="kawaii-drift">
          {renderTile(0)}
          {renderTile(1)}
        </div>
      </div>
    </div>
  );
}

export default KawaiiBackdrop;
