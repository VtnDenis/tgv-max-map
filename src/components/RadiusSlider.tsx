export interface RadiusSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  valueLabel?: string;
}

/** Single-value native range input for the radius map mode. */
export default function RadiusSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  unit = 'km',
  valueLabel,
}: RadiusSliderProps): JSX.Element {
  return (
    <div className="field">
      <label>
        {label} :{' '}
        <span className="muted">{valueLabel ?? `${value} ${unit}`}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
