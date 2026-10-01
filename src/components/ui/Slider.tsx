interface Props {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

function Slider({ label, min, max, step, value, format, onChange }: Props) {
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
