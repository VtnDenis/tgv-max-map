import RangeSlider from './RangeSlider';

export interface TimeRange {
  min: number;
  max: number;
}

export interface TimeFilterValue {
  departure: TimeRange;
  arrival: TimeRange;
  kind: 'departure' | 'arrival';
}

export interface TimeFilterProps {
  value: TimeFilterValue;
  onChange: (value: TimeFilterValue) => void;
  showKind?: boolean;
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAY_END = 24 * 60 - 1;

/** Independent departure/arrival time-range filters. */
export default function TimeFilter({
  value,
  onChange,
  showKind = false,
}: TimeFilterProps): JSX.Element {
  return (
    <div className="range-group">
      {showKind && (
        <div className="tabs">
          <button
            type="button"
            className={value.kind === 'departure' ? 'active' : undefined}
            onClick={() => onChange({ ...value, kind: 'departure' })}
          >
            Départ
          </button>
          <button
            type="button"
            className={value.kind === 'arrival' ? 'active' : undefined}
            onClick={() => onChange({ ...value, kind: 'arrival' })}
          >
            Arrivée
          </button>
        </div>
      )}
      {(!showKind || value.kind === 'departure') && (
        <RangeSlider
          label="Départ"
          min={0}
          max={DAY_END}
          step={5}
          value={[value.departure.min, value.departure.max]}
          onChange={([min, max]) =>
            onChange({ ...value, departure: { min, max } })
          }
          format={formatTime}
        />
      )}
      {(!showKind || value.kind === 'arrival') && (
        <RangeSlider
          label="Arrivée"
          min={0}
          max={DAY_END}
          step={5}
          value={[value.arrival.min, value.arrival.max]}
          onChange={([min, max]) =>
            onChange({ ...value, arrival: { min, max } })
          }
          format={formatTime}
        />
      )}
    </div>
  );
}
