export interface DateRangePickerProps {
  from: string; // "YYYY-MM-DD"
  to: string; // "YYYY-MM-DD"
  min: string; // "YYYY-MM-DD"
  max: string; // "YYYY-MM-DD"
  maxSpanDays?: number;
  onChange: (range: { from: string; to: string }) => void;
}

const DEFAULT_MAX_SPAN_DAYS = 14;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Two date inputs bounded to the dataset's rolling window, capped to a max span. */
export default function DateRangePicker({
  from,
  to,
  min,
  max,
  maxSpanDays = DEFAULT_MAX_SPAN_DAYS,
  onChange,
}: DateRangePickerProps): JSX.Element {
  const limit = Math.max(1, maxSpanDays);

  return (
    <div className="field">
      <label htmlFor="tgvmax-date-from">Dates</label>
      <div className="date-range">
        <input
          id="tgvmax-date-from"
          type="date"
          value={from}
          min={min}
          max={max}
          onChange={(e) => {
            const next = e.target.value;
            const newTo = next > to ? next : to;
            const spanLimit = addDays(next, limit - 1);
            onChange({ from: next, to: newTo > spanLimit ? spanLimit : newTo });
          }}
        />
        <span className="muted">→</span>
        <input
          id="tgvmax-date-to"
          type="date"
          value={to}
          min={min}
          max={max}
          onChange={(e) => {
            const next = e.target.value;
            const newFrom = next < from ? next : from;
            const lowerLimit = addDays(next, -(limit - 1));
            onChange({
              from: newFrom < lowerLimit ? lowerLimit : newFrom,
              to: next,
            });
          }}
        />
      </div>
      <div className="hint">Plage limitée à {limit} jours.</div>
    </div>
  );
}
