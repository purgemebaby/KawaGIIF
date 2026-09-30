interface Props {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Cómo mostrar el valor en la burbuja: `70%`, `1.35x`… */
  format: (value: number) => string;
  onChange: (value: number) => void;
}

/**
 * Slider con lectura numérica.
 *
 * La burbuja se coloca proporcionalmente al valor y aparece al pasar el ratón,
 * al enfocar con el teclado y mientras se arrastra. Antes estos controles no
 * decían en ningún momento qué número estabas poniendo, así que ajustar la
 * velocidad era prueba y error.
 */
function Slider({ label, min, max, step, value, format, onChange }: Props) {
  // 0 en el mínimo, 1 en el máximo. Se usa para posicionar la burbuja.
  const ratio = max === min ? 0 : (value - min) / (max - min);

  return (
    <label className="kg-slider">
      <span className="kg-slider-label">{label}</span>
      <span className="kg-slider-track-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <output
          className="kg-slider-bubble"
          style={{ left: `calc(${ratio * 100}% )` }}
          aria-hidden="true"
        >
          {format(value)}
        </output>
      </span>
    </label>
  );
}

export default Slider;
