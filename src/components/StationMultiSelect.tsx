import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Station } from '../types';
import { haversineKm } from '../lib/geo';

export interface StationMultiSelectProps {
  label: string;
  stations: Station[];
  value: Station[];
  onChange: (value: Station[]) => void;
  placeholder?: string;
  onGeolocate?: () => void;
  geolocating?: boolean;
}

interface Match {
  station: Station;
  rank: number;
  distance?: number;
}

const NEARBY_RADIUS_KM = 40;
const NEARBY_LIMIT = 8;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function filterStations(
  stations: Station[],
  query: string,
  excluded: Set<string>,
  limit: number,
): Match[] {
  const needle = normalize(query.trim());
  if (needle === '') return [];

  const ranked: Match[] = [];
  let bestPrefix: Station | null = null;

  for (const station of stations) {
    const name = normalize(station.name);
    const code = normalize(station.code);
    let rank = -1;
    if (name.startsWith(needle)) rank = 0;
    else if (name.includes(needle)) rank = 1;
    else if (code.includes(needle)) rank = 2;
    if (rank === 0 && !bestPrefix) bestPrefix = station;
    if (rank < 0 || excluded.has(station.code)) continue;
    ranked.push({ station, rank });
  }

  if (bestPrefix) {
    const matchedCodes = new Set(ranked.map((m) => m.station.code));
    matchedCodes.add(bestPrefix.code);
    const nearby: Match[] = [];
    for (const station of stations) {
      if (excluded.has(station.code) || matchedCodes.has(station.code)) continue;
      const d = haversineKm(bestPrefix.lat, bestPrefix.lon, station.lat, station.lon);
      if (d <= NEARBY_RADIUS_KM) {
        nearby.push({ station, rank: 3, distance: d });
      }
    }
    nearby.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
    ranked.push(...nearby.slice(0, NEARBY_LIMIT));
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank === 3) return (a.distance ?? 0) - (b.distance ?? 0);
    return a.station.name.localeCompare(b.station.name, 'fr');
  });
  return ranked.slice(0, limit);
}

/** Multi-city selector: autocomplete + "+" add button + removable chips. */
export default function StationMultiSelect({
  label,
  stations,
  value,
  onChange,
  placeholder,
  onGeolocate,
  geolocating = false,
}: StationMultiSelectProps): JSX.Element {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const excluded = new Set(value.map((s) => s.code));
  const matches = filterStations(stations, query, excluded, 10);

  function add(station: Station): void {
    if (excluded.has(station.code)) return;
    onChange([...value, station]);
    setQuery('');
    setHighlighted(0);
    setOpen(false);
    inputRef.current?.focus();
  }

  function addHighlighted(): void {
    const match = matches[highlighted] ?? matches[0];
    if (match) add(match.station);
  }

  function remove(code: string): void {
    onChange(value.filter((s) => s.code !== code));
  }

  function handleChange(next: string): void {
    setQuery(next);
    setOpen(true);
    setHighlighted(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      addHighlighted();
      return;
    }
    if (matches.length === 0) return;
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((h) => Math.min(h + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    }
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="autocomplete">
        <div className="multi-input-row">
          <input
            id={id}
            ref={inputRef}
            type="text"
            autoComplete="off"
            value={query}
            placeholder={placeholder}
            onFocus={() => setOpen(true)}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          />
          {onGeolocate && (
            <button
              type="button"
              className="geo-btn"
              aria-label="Utiliser ma position"
              title="Utiliser ma position"
              disabled={geolocating}
              onClick={onGeolocate}
            >
              {geolocating ? '…' : '📍'}
            </button>
          )}
          <button
            type="button"
            className="add-btn"
            aria-label={`Ajouter ${label}`}
            disabled={matches.length === 0}
            onMouseDown={(e) => e.preventDefault()}
            onClick={addHighlighted}
          >
            +
          </button>
        </div>
        {open && matches.length > 0 && (
          <ul className="menu">
            {matches.map((match, index) => (
              <li
                key={match.station.code}
                className={index === highlighted ? 'highlighted' : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(match.station)}
              >
                {match.station.name}
                {match.distance !== undefined ? (
                  <span className="muted"> ≈ {Math.round(match.distance)} km</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <div className="chips">
          {value.map((station) => (
            <span className="chip" key={station.code}>
              {station.name}
              <button
                type="button"
                className="chip-remove"
                aria-label={`Retirer ${station.name}`}
                onClick={() => remove(station.code)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
