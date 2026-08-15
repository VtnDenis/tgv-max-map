export interface ItineraryConstraints {
  maxConnections: number;
  minConnection: number;
  maxConnection: number;
}

export interface ItineraryControlsProps {
  value: ItineraryConstraints;
  onChange: (value: ItineraryConstraints) => void;
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}): JSX.Element {
  const { label, value, min, max, step, unit, onChange } = props;
  return (
    <div className="field">
      <label>
        {label} : <span className="muted">{value}</span> {unit}
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

/** Sliders to configure the multi-leg itinerary search. */
export default function ItineraryControls({
  value,
  onChange,
}: ItineraryControlsProps): JSX.Element {
  return (
    <div>
      <Slider
        label="Correspondances max"
        value={value.maxConnections}
        min={0}
        max={2}
        step={1}
        unit=""
        onChange={(v) => onChange({ ...value, maxConnections: v })}
      />
      <Slider
        label="Correspondance min"
        value={value.minConnection}
        min={0}
        max={60}
        step={5}
        unit="min"
        onChange={(v) => onChange({ ...value, minConnection: v })}
      />
      <Slider
        label="Correspondance max"
        value={value.maxConnection}
        min={30}
        max={240}
        step={10}
        unit="min"
        onChange={(v) => onChange({ ...value, maxConnection: v })}
      />
    </div>
  );
}
