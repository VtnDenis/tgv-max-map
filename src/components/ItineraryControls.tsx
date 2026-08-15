import { formatDuration } from '../lib/itinerary';

export interface ItineraryConstraints {
  maxConnections: number;
  minConnection: number;
  maxConnection: number;
  maxDuration: number;
}

export interface ItineraryControlsProps {
  value: ItineraryConstraints;
  onChange: (value: ItineraryConstraints) => void;
  /** Record mode raises the connection ceiling and exposes a duration budget. */
  record?: boolean;
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}): JSX.Element {
  const { label, value, min, max, step, unit, onChange, formatValue } = props;
  return (
    <div className="field">
      <label>
        {label} :{' '}
        <span className="muted">{formatValue ? formatValue(value) : `${value} ${unit}`}</span>
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
  record = false,
}: ItineraryControlsProps): JSX.Element {
  return (
    <div>
      <Slider
        label="Nombre de correspondances"
        value={value.maxConnections}
        min={0}
        max={record ? 8 : 2}
        step={1}
        unit=""
        onChange={(v) => onChange({ ...value, maxConnections: v })}
      />
      <Slider
        label="Temps de correspondance min"
        value={value.minConnection}
        min={0}
        max={60}
        step={5}
        unit="min"
        onChange={(v) => onChange({ ...value, minConnection: v })}
      />
      <Slider
        label="Temps de correspondance max"
        value={value.maxConnection}
        min={30}
        max={240}
        step={10}
        unit="min"
        onChange={(v) => onChange({ ...value, maxConnection: v })}
      />
      {record && (
        <Slider
          label="Durée max"
          value={value.maxDuration}
          min={120}
          max={1440}
          step={30}
          unit="min"
          formatValue={formatDuration}
          onChange={(v) => onChange({ ...value, maxDuration: v })}
        />
      )}
    </div>
  );
}
