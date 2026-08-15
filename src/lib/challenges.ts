import type {
  ChallengeKind,
  ChallengeResult,
  Edge,
  Itinerary,
  Leg,
  Station,
} from '../types';
import { getAllStations, getStation, haversineKm } from './geo';
import { findItineraries, formatDuration, toMinutes } from './itinerary';

const LONGEST_DIRECT_MAX_MIN = 180;

const DEFINITIONS: Record<ChallengeKind, { title: string; description: string }> = {
  'far-direct': {
    title: 'Destination directe la plus lointaine',
    description: 'Quelle gare est la plus éloignée en un seul trajet direct ?',
  },
  'longest-under-3h': {
    title: 'Trajet direct le plus long (< 3 h)',
    description: 'Le trajet direct le plus long qui dure moins de 3 heures.',
  },
  'most-departures': {
    title: 'Destination avec le plus de départs',
    description: 'Vers quelle gare partent le plus de trains directs ?',
  },
  'earliest-departure': {
    title: 'Premier départ de la période',
    description: 'Quel est le train le plus matinal depuis ta gare ?',
  },
  'most-days': {
    title: 'Destination la plus souvent desservie',
    description: 'Quelle gare est disponible le plus de jours distincts ?',
  },
  'longest-itinerary': {
    title: 'Itinéraire le plus long',
    description:
      'Le trajet (avec correspondances) le plus long possible depuis ta gare.',
  },
};

function isToday(date: string): boolean {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return date === `${y}-${m}-${d}`;
}

function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/** Drop direct trains that have already left today (mirrors `visibleLegs`). */
function usableLegs(legs: Leg[]): Leg[] {
  return legs.filter((leg) => {
    if (leg.date && isToday(leg.date) && toMinutes(leg.heure_depart) < nowMinutes()) {
      return false;
    }
    return true;
  });
}

function groupByDestination(legs: Leg[]): Map<string, Leg[]> {
  const map = new Map<string, Leg[]>();
  for (const leg of legs) {
    const list = map.get(leg.destination_iata);
    if (list) list.push(leg);
    else map.set(leg.destination_iata, [leg]);
  }
  return map;
}

function distinctDays(legs: Leg[]): number {
  return new Set(legs.map((leg) => leg.date).filter(Boolean)).size;
}

function pending(kind: ChallengeKind): ChallengeResult {
  const def = DEFINITIONS[kind];
  return {
    kind,
    status: 'pending',
    title: def.title,
    description: def.description,
    winner: null,
  };
}

function empty(kind: ChallengeKind): ChallengeResult {
  const def = DEFINITIONS[kind];
  return {
    kind,
    status: 'empty',
    title: def.title,
    description: def.description,
    winner: null,
  };
}

function solved(
  kind: ChallengeKind,
  winner: Station,
  extra: Partial<ChallengeResult>,
): ChallengeResult {
  const def = DEFINITIONS[kind];
  return {
    kind,
    status: 'solved',
    title: def.title,
    description: def.description,
    winner,
    winnerCode: winner.code,
    ...extra,
  };
}

function computeDirect(kind: ChallengeKind, legs: Leg[], origin: Station): ChallengeResult {
  switch (kind) {
    case 'far-direct': {
      let best: { leg: Leg; station: Station; distance: number } | null = null;
      for (const leg of legs) {
        const station = getStation(leg.destination_iata);
        if (!station) continue;
        const distance = haversineKm(origin.lat, origin.lon, station.lat, station.lon);
        if (!best || distance > best.distance) best = { leg, station, distance };
      }
      if (!best) return empty(kind);
      return solved(kind, best.station, {
        metric: Math.round(best.distance),
        detail: `${Math.round(best.distance)} km`,
        legs: [best.leg],
      });
    }

    case 'longest-under-3h': {
      let best: { leg: Leg; duration: number } | null = null;
      for (const leg of legs) {
        const duration = toMinutes(leg.heure_arrivee) - toMinutes(leg.heure_depart);
        if (duration >= LONGEST_DIRECT_MAX_MIN) continue;
        if (!best || duration > best.duration) best = { leg, duration };
      }
      if (!best) return empty(kind);
      const station = getStation(best.leg.destination_iata);
      if (!station) return empty(kind);
      return solved(kind, station, {
        metric: best.duration,
        detail: formatDuration(best.duration),
        legs: [best.leg],
      });
    }

    case 'most-departures': {
      let best: { code: string; list: Leg[] } | null = null;
      for (const [code, list] of groupByDestination(legs)) {
        if (!best || list.length > best.list.length) best = { code, list };
      }
      if (!best) return empty(kind);
      const station = getStation(best.code);
      if (!station) return empty(kind);
      const days = distinctDays(best.list);
      return solved(kind, station, {
        metric: best.list.length,
        detail: `${best.list.length} départs sur ${days} jour${days > 1 ? 's' : ''}`,
        legs: best.list,
      });
    }

    case 'earliest-departure': {
      let best: Leg | null = null;
      for (const leg of legs) {
        if (!best || toMinutes(leg.heure_depart) < toMinutes(best.heure_depart)) {
          best = leg;
        }
      }
      if (!best) return empty(kind);
      const station = getStation(best.destination_iata);
      if (!station) return empty(kind);
      const detail = best.date ? `${best.date} · ${best.heure_depart}` : best.heure_depart;
      return solved(kind, station, {
        metric: toMinutes(best.heure_depart),
        detail,
        legs: [best],
      });
    }

    case 'most-days': {
      let best: { code: string; days: number } | null = null;
      for (const [code, list] of groupByDestination(legs)) {
        const days = distinctDays(list);
        if (!best || days > best.days) best = { code, days };
      }
      if (!best) return empty(kind);
      const station = getStation(best.code);
      if (!station) return empty(kind);
      return solved(kind, station, {
        metric: best.days,
        detail: `${best.days} jour${best.days > 1 ? 's' : ''}`,
      });
    }

    default:
      return empty(kind);
  }
}

/**
 * Compute the five direct-trip challenges from `getDestinations` legs.
 * Returns "pending" when the origin is not selected or data is still loading,
 * and "empty" when there is no availability over the period.
 */
export function computeChallenges(
  legs: Leg[] | null,
  origin: Station | null,
): ChallengeResult[] {
  const kinds: ChallengeKind[] = [
    'far-direct',
    'longest-under-3h',
    'most-departures',
    'earliest-departure',
    'most-days',
  ];

  if (!origin) return kinds.map(pending);
  if (!legs) return kinds.map(pending);
  if (legs.length === 0) return kinds.map(empty);

  const usable = usableLegs(legs);
  if (usable.length === 0) return kinds.map(empty);

  return kinds.map((kind) => computeDirect(kind, usable, origin));
}

/**
 * Compute the "longest itinerary (with connections)" challenge from the full
 * range-edge graph. Returns "pending" when edges are not loaded yet.
 */
export function computeLongestItinerary(
  edges: Edge[] | null,
  origin: Station | null,
): ChallengeResult {
  const kind: ChallengeKind = 'longest-itinerary';
  if (!origin || !edges) return pending(kind);
  if (edges.length === 0) return empty(kind);

  const allCodes = getAllStations().map((s) => s.code);

  const byDate = new Map<string, Edge[]>();
  for (const edge of edges) {
    const d = edge.date ?? '';
    const list = byDate.get(d);
    if (list) list.push(edge);
    else byDate.set(d, [edge]);
  }

  let bestItinerary: Itinerary | null = null;
  let bestDuration = -1;

  for (const [d, dayEdges] of byDate) {
    const floor = isToday(d) ? nowMinutes() : -1;
    const usable = floor < 0 ? dayEdges : dayEdges.filter((e) => e.dep >= floor);
    const found = findItineraries(usable, [origin.code], allCodes, { maxLegs: 3 });
    for (const it of found) {
      const duration = it.arrivalTime - it.departureTime;
      if (duration > bestDuration) {
        bestDuration = duration;
        bestItinerary = { ...it, date: d };
      }
    }
  }

  if (!bestItinerary) return empty(kind);

  const last = bestItinerary.legs[bestItinerary.legs.length - 1];
  const winner = getStation(last.to) ?? null;

  return {
    kind,
    status: winner ? 'solved' : 'empty',
    title: DEFINITIONS[kind].title,
    description: DEFINITIONS[kind].description,
    winner,
    winnerCode: winner?.code,
    metric: bestDuration,
    detail: formatDuration(bestDuration),
    edge: last,
    itinerary: bestItinerary,
  };
}
