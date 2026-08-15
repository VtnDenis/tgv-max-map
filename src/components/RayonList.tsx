import type { Leg } from '../types';

export interface RayonDestination {
  code: string;
  name: string;
  distanceKm: number;
  legs: Leg[];
}

interface RayonListProps {
  destinations: RayonDestination[];
  onSelect?: (code: string) => void;
}

/** Sorted list of destinations within the radius, with distance and direct departures. */
export default function RayonList({ destinations, onSelect }: RayonListProps): JSX.Element {
  if (destinations.length === 0) {
    return (
      <div className="hint">
        Aucune destination dans ce rayon. Augmentez le rayon (curseur ci-dessus).
      </div>
    );
  }

  return (
    <div className="results">
      <div className="hint">
        {destinations.length} destination{destinations.length > 1 ? 's' : ''} dans le
        rayon
      </div>
      {destinations.map((dest) => (
        <div
          className="result-card clickable"
          key={dest.code}
          role="button"
          tabIndex={0}
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
            <span className="muted">{Math.round(dest.distanceKm)} km</span>
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
