import type { Itinerary, Leg } from '../types';
import { formatDuration, toMinutes } from '../lib/itinerary';
import { formatDate, formatFare, formatMinutes } from '../lib/format';
import { getFareRange } from '../lib/fares';

function distinctDays(legs: Leg[]): number {
  return new Set(legs.map((leg) => leg.date).filter(Boolean)).size;
}

export function LegList(props: {
  legs: Leg[];
  fixedName: string;
  mode: 'origin' | 'destination';
  onSelect?: (code: string) => void;
}): JSX.Element {
  const { legs, fixedName, mode, onSelect } = props;

  if (legs.length === 0) {
    return <div className="hint">Aucune disponibilité MAX sur la période pour cette gare. Essayez d'élargir les horaires ou la plage de dates.</div>;
  }

  const groups = new Map<string, Leg[]>();
  for (const leg of legs) {
    const key = mode === 'origin' ? leg.destination_iata : leg.origine_iata;
    const list = groups.get(key);
    if (list) list.push(leg);
    else groups.set(key, [leg]);
  }

  const entries = [...groups.entries()];
  entries.sort((a, b) =>
    (a[1][0].date ?? '').localeCompare(b[1][0].date ?? '') ||
    a[1][0].heure_depart.localeCompare(b[1][0].heure_depart),
  );

  const prefix = mode === 'origin' ? 'Depuis' : 'Vers';
  const label =
    mode === 'origin' ? 'destinations disponibles' : 'origines disponibles';

  return (
    <div className="results">
      <div className="hint">
        {prefix} {fixedName} — {entries.length} {label}
      </div>
      {entries.map(([code, list]) => {
        const name = mode === 'origin' ? list[0].destination : list[0].origine;
        const days = distinctDays(list);
        return (
          <div
            className="result-card clickable"
            key={code}
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(code)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(code);
              }
            }}
          >
            <div className="row">
              <div className="station">{name}</div>
              {days > 1 && (
                <span className="badge ok">{days} jours dispo</span>
              )}
            </div>
            {list.map((leg, i) => {
              const fare = getFareRange(leg.origine_iata, leg.destination_iata);
              return (
                <div className="row" key={i}>
                  <span className="time">
                    {leg.date ? `${formatDate(leg.date)} · ` : ''}
                    {leg.heure_depart} → {leg.heure_arrivee}
                  </span>
                  {leg.train_no ? <span className="badge leg">{leg.train_no}</span> : null}
                  <span className="muted">
                    {formatDuration(
                      toMinutes(leg.heure_arrivee) - toMinutes(leg.heure_depart),
                    )}
                  </span>
                  {fare ? <span className="muted fare">≈ {formatFare(fare)}</span> : null}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function ItineraryList(props: {
  itineraries: Itinerary[];
  onSelect?: (itinerary: Itinerary) => void;
  selected?: Itinerary | null;
  recordMode?: boolean;
}): JSX.Element {
  const { itineraries, onSelect, selected = null, recordMode = false } = props;

  if (itineraries.length === 0) {
    return <div className="hint">Aucun itinéraire trouvé. Essayez de réduire le nombre de correspondances ou d'élargir les dates.</div>;
  }

  const maxConnections = recordMode
    ? Math.max(...itineraries.map((it) => it.legs.length - 1))
    : -1;

  return (
    <div className="results">
      {itineraries.map((itinerary, i) => {
        const connections = itinerary.legs.length - 1;
        const badge =
          connections === 0
            ? 'direct'
            : `${connections} correspondance${connections > 1 ? 's' : ''}`;
        const duration = itinerary.arrivalTime - itinerary.departureTime;
        const isSelected = selected === itinerary;
        const isRecord = recordMode && connections === maxConnections && connections > 0;
        let totalFare: { min: number; max: number } | null = null;
        for (const leg of itinerary.legs) {
          const legFare = getFareRange(leg.from, leg.to);
          if (!legFare) {
            totalFare = null;
            break;
          }
          totalFare = totalFare
            ? { min: totalFare.min + legFare.min, max: totalFare.max + legFare.max }
            : { min: legFare.min, max: legFare.max };
        }
        return (
          <div
            className={`result-card clickable${isSelected ? ' selected' : ''}${isRecord ? ' record' : ''}`}
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(itinerary)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(itinerary);
              }
            }}
          >
            <div className="row">
              <span className="time">{formatMinutes(itinerary.departureTime)}</span>
              <span className="badge leg">{badge}</span>
              {isRecord && <span className="badge record-badge">record</span>}
              <span className="time">{formatMinutes(itinerary.arrivalTime)}</span>
            </div>
            <div className="row">
              <span className="muted">{formatDuration(duration)}</span>
              {itinerary.date ? <span className="badge ok">{formatDate(itinerary.date)}</span> : null}
              {totalFare ? <span className="muted fare">≈ {formatFare(totalFare)}</span> : null}
            </div>
            {itinerary.legs.map((leg, j) => (
              <div className="muted" key={j}>
                {leg.fromName} ({formatMinutes(leg.dep)}) → {leg.toName} (
                {formatMinutes(leg.arr)})
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
