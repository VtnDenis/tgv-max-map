import type { Leg } from '../types';
import { formatDuration } from '../lib/itinerary';

export interface RayonDestination {
  code: string;
  name: string;
  distanceKm: number;
  durationMin?: number;
  color?: string;
  legs: Leg[];
}

interface RayonListProps {
  destinations: RayonDestination[];
  mode?: 'distance' | 'time';
  onSelect?: (code: string) => void;
}

/** Sorted list of destinations within the radius/halo, with distance/time and direct departures. */
export default function RayonList({
  destinations,
  mode = 'distance',
  onSelect,
}: RayonListProps): JSX.Element {
  if (destinations.length === 0) {
    return (
      <div className="hint">
        Aucune destination. Augmentez le rayon (curseur ci-dessus).
      </div>
    );
  }

  return (
    <div className="results">
      <div className="hint">
        {destinations.length} destination{destinations.length > 1 ? 's' : ''}{' '}
        {mode === 'time' ? 'dans la limite de temps' : 'dans le rayon'}
      </div>
      {destinations.map((dest) => (
        <div
          className="result-card clickable"
          key={dest.code}
          role="button"
          tabIndex={0}
          style={
            dest.color ? { borderLeftColor: dest.color } : undefined
          }
          onClick={() => onSelect?.(dest.code)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect?.(dest.code);
            }
          }}
        >
          <div className="row">
            <div className="station">{dest.name}</div>
            <span className="muted">
              {dest.durationMin !== undefined
                ? formatDuration(dest.durationMin)
                : `${Math.round(dest.distanceKm)} km`}
            </span>
          </div>
          {dest.legs.map((leg, i) => (
            <div className="row" key={i}>
              <span className="time">
                {leg.heure_depart} → {leg.heure_arrivee}
              </span>
              {leg.train_no ? <span className="badge leg">{leg.train_no}</span> : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
