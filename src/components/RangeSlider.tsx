import { Range, getTrackBackground } from 'react-range';

export interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  format: (value: number) => string;
}

/** Single-track dual-thumb range slider (wraps react-range). */
export default function RangeSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: RangeSliderProps): JSX.Element {
  return (
    <div className="field">
      <label>
        {label} :{' '}
        <span className="muted">
          {format(value[0])} → {format(value[1])}
        </span>
      </label>
      <div className="range-wrap">
        <Range
          step={step}
          min={min}
          max={max}
          values={value}
          onChange={(next) => onChange([next[0], next[1]])}
          renderTrack={({ props, children }) => (
            <div
              {...props}
              style={{
                ...props.style,
                height: '6px',
                width: '100%',
                background: getTrackBackground({
                  values: value,
                  colors: ['var(--border)', 'var(--accent)', 'var(--border)'],
                  min,
                  max,
                }),
              }}
            >
              {children}
            </div>
          )}
          renderThumb={({ props, isDragged, index }) => (
            <div
              {...props}
              aria-label={`${label} ${index === 0 ? 'min' : 'max'}`}
              className="range-thumb"
              style={{
                ...props.style,
                boxShadow: isDragged ? '0 0 0 4px rgba(227, 0, 15, 0.15)' : 'none',
              }}
            />
          )}
        />
      </div>
    </div>
  );
}
