import { useEffect, useMemo, useState, useId } from 'react';

export interface DateRangePickerProps {
  from: string; // "YYYY-MM-DD"
  to: string; // "YYYY-MM-DD"
  min: string; // "YYYY-MM-DD"
  max: string; // "YYYY-MM-DD"
  maxSpanDays?: number;
  mode?: 'range' | 'split';
  label?: string;
  fromLabel?: string;
  toLabel?: string;
  onChange: (range: { from: string; to: string }) => void;
}

const DEFAULT_MAX_SPAN_DAYS = 14;

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function toIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY_MS);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function startWeekdayMonday(year: number, month: number): number {
  return (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
}

function formatShort(iso: string): string {
  const date = parseIso(iso);
  return `${date.getUTCDate()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

interface Cell {
  iso: string;
  day: number;
  disabled: boolean;
  today: boolean;
  isFrom: boolean;
  isTo: boolean;
  inRange: boolean;
}

/** Single-calendar range picker (click start, then click end). */
export default function DateRangePicker({
  from,
  to,
  min,
  max,
  maxSpanDays = DEFAULT_MAX_SPAN_DAYS,
  mode = 'range',
  label = 'Dates',
  fromLabel = 'Aller',
  toLabel = 'Retour',
  onChange,
}: DateRangePickerProps): JSX.Element {
  const limit = Math.max(1, maxSpanDays);

  const fromDate = parseIso(from);
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>({
    year: fromDate.getUTCFullYear(),
    month: fromDate.getUTCMonth(),
  });
  const [hover, setHover] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [open, setOpen] = useState(false);
  const id = useId();

  useEffect(() => {
    setSelecting(false);
  }, [mode]);

  const minDate = parseIso(min);
  const maxDate = parseIso(max);

  const canPrev =
    viewMonth.year > minDate.getUTCFullYear() ||
    (viewMonth.year === minDate.getUTCFullYear() &&
      viewMonth.month > minDate.getUTCMonth());
  const canNext =
    viewMonth.year < maxDate.getUTCFullYear() ||
    (viewMonth.year === maxDate.getUTCFullYear() &&
      viewMonth.month < maxDate.getUTCMonth());

  function shiftMonth(delta: number): void {
    setViewMonth((current) => {
      const next = current.month + delta;
      const d = new Date(Date.UTC(current.year, next, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  function handleDayClick(iso: string): void {
    if (iso < min || iso > max) return;

    if (!selecting) {
      onChange({ from: iso, to: iso });
      setSelecting(true);
      return;
    }

    if (iso < from) {
      onChange({ from: iso, to: iso });
      return;
    }

    const clamped =
      mode === 'range' ? addDays(from, limit - 1) : max;
    onChange({ from, to: iso > clamped ? clamped : iso });
    setSelecting(false);
  }

  const cells = useMemo<Cell[]>(() => {
    const result: Cell[] = [];
    const first = startWeekdayMonday(viewMonth.year, viewMonth.month);
    const total = daysInMonth(viewMonth.year, viewMonth.month);

    for (let i = 0; i < first; i++) {
      result.push({
        iso: '',
        day: 0,
        disabled: true,
        today: false,
        isFrom: false,
        isTo: false,
        inRange: false,
      });
    }

    const todayIso = toIso(new Date());
    const preview = mode === 'range' && selecting && hover && hover >= from ? hover : null;
    const endIso = preview ?? to;

    for (let d = 1; d <= total; d++) {
      const iso = toIso(new Date(Date.UTC(viewMonth.year, viewMonth.month, d)));
      const isFrom = iso === from;
      const isTo = iso === endIso && endIso !== from;
      const inRange =
        mode === 'range' && iso > from && iso < endIso;

      result.push({
        iso,
        day: d,
        disabled: iso < min || iso > max,
        today: iso === todayIso,
        isFrom,
        isTo,
        inRange,
      });
    }

    return result;
  }, [viewMonth, from, to, min, max, mode, selecting, hover]);

  const spanDays = daysBetween(from, to) + 1;

  const summary =
    mode === 'range'
      ? `Du ${formatShort(from)} → Au ${formatShort(to)} (${spanDays} j)`
      : `${fromLabel} ${formatShort(from)} · ${toLabel} ${formatShort(to)}`;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <button
        type="button"
        id={id}
        className="date-summary"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <span>{summary}</span>
        <span className="chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>

      <div className="hint">
        {selecting
          ? 'Choisissez maintenant la date de fin.'
          : 'Cliquez sur la date de départ puis la date de fin.'}
      </div>

      {open && (
        <>
          <div
            className="calendar"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          >
            <div className="calendar-header">
              <button
                type="button"
                className="calendar-nav"
                aria-label="Mois précédent"
                disabled={!canPrev}
                onClick={() => shiftMonth(-1)}
              >
                ‹
              </button>
              <span className="calendar-title">
                {MONTHS[viewMonth.month]} {viewMonth.year}
              </span>
              <button
                type="button"
                className="calendar-nav"
                aria-label="Mois suivant"
                disabled={!canNext}
                onClick={() => shiftMonth(1)}
              >
                ›
              </button>
            </div>

            <div className="calendar-grid">
              {WEEKDAYS.map((w) => (
                <span className="calendar-weekday" key={w}>
                  {w}
                </span>
              ))}
              {cells.map((cell, i) =>
                cell.iso === '' ? (
                  <span className="calendar-day empty" key={`e-${i}`} />
                ) : (
                  <button
                    type="button"
                    key={cell.iso}
                    disabled={cell.disabled}
                    className={[
                      'calendar-day',
                      cell.today ? 'today' : '',
                      cell.isFrom
                        ? mode === 'range'
                          ? 'range-start'
                          : 'split-start'
                        : '',
                      cell.isTo
                        ? mode === 'range'
                          ? 'range-end'
                          : 'split-end'
                        : '',
                      cell.inRange ? 'in-range' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onMouseEnter={() => setHover(cell.iso)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => handleDayClick(cell.iso)}
                  >
                    {cell.day}
                  </button>
                ),
              )}
            </div>
          </div>

          {mode === 'range' && (
            <div className="hint">Plage limitée à {limit} jours.</div>
          )}
        </>
      )}
    </div>
  );
}
