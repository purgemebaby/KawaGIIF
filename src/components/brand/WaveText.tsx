import type { ReactNode } from "react";

interface Props {
  children: string;
  className?: string;
  /** Etiqueta a renderizar. Por defecto un `<span>`. */
  as?: "span" | "h1" | "h2" | "p";
}

/**
 * Texto con las letras ondeando: cada una sube un poco y vuelve, desfasada
 * respecto a la anterior, formando una ola.
 *
 * El truco está en `--i`, el índice de cada letra, que la animación usa como
 * retardo (ver `styles/motion.css`). Los espacios se renderizan como espacio
 * duro porque un espacio normal dentro de un `inline-block` se colapsa y las
 * palabras se pegarían.
 *
 * El texto completo va en `aria-label` y las letras quedan ocultas para los
 * lectores de pantalla: si no, leerían el contenido letra por letra.
 */
function WaveText({ children, className, as: Tag = "span" }: Props) {
  const letters: ReactNode[] = [...children].map((char, i) => (
    <span key={i} style={{ ["--i" as string]: i }} aria-hidden="true">
      {char === " " ? " " : char}
    </span>
  ));

  return (
    <Tag className={className ? `kg-wave ${className}` : "kg-wave"} aria-label={children}>
      {letters}
    </Tag>
  );
}

export default WaveText;
