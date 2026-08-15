import type { Edge, Itinerary } from '../types';

export interface ItineraryOptions {
  maxLegs?: number;
  minConnection?: number;
  maxConnection?: number;
  /** Optional total travel-time budget (minutes, arrival - departure). */
  maxDuration?: number;
}

const MAX_RESULTS = 200;

/** Parse an "HH:MM" time (optionally with seconds) into minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [hoursPart, minutesPart] = hhmm.split(':');
  const hours = Number.parseInt(hoursPart ?? '', 10);
  const minutes = Number.parseInt(minutesPart ?? '', 10);
  return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
}

/** Format a duration in minutes as a compact "2h34" string. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

/** Find all connecting itineraries between any start in `from` and any end in `to`, within `maxLegs` legs. */
export function findItineraries(edges: Edge[], from: string[], to: string[], options?: ItineraryOptions): Itinerary[] {
  const maxLegs = options?.maxLegs ?? 3;
  const minConnection = options?.minConnection ?? 15;
  const maxConnection = options?.maxConnection;

  if (maxLegs < 1 || from.length === 0 || to.length === 0) return [];

  const fromSet = new Set(from);
  const toSet = new Set(to);

  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }

  type State = { legs: Edge[]; visited: Set<string> };
  let queue: State[] = [];
  for (const start of fromSet) {
    for (const edge of outgoing.get(start) ?? []) {
      queue.push({ legs: [edge], visited: new Set<string>([edge.from, edge.to]) });
    }
  }

  const best = new Map<string, Map<number, number>>();
  const results: Itinerary[] = [];

  while (queue.length > 0) {
    const next: State[] = [];
    for (const state of queue) {
      const last = state.legs[state.legs.length - 1];
      if (toSet.has(last.to)) {
        results.push({
          legs: state.legs,
          departureTime: state.legs[0].dep,
          arrivalTime: last.arr,
        });
        continue;
      }
      if (state.legs.length >= maxLegs) continue;

      const byLeg = best.get(last.to);
      const previous = byLeg?.get(state.legs.length);
      if (previous !== undefined && previous <= last.arr) continue;
      if (byLeg) byLeg.set(state.legs.length, last.arr);
      else best.set(last.to, new Map([[state.legs.length, last.arr]]));

      for (const edge of outgoing.get(last.to) ?? []) {
        if (state.visited.has(edge.to)) continue;
        if (edge.dep < last.arr + minConnection) continue;
        if (maxConnection !== undefined && edge.dep > last.arr + maxConnection) continue;
        next.push({
          legs: [...state.legs, edge],
          visited: new Set(state.visited).add(edge.to),
        });
      }
    }
    queue = next;
  }

  results.sort((a, b) => a.arrivalTime - b.arrivalTime || a.legs.length - b.legs.length);
  return results.slice(0, MAX_RESULTS);
}

/**
 * Find itineraries that maximize the number of legs (connections) instead of
 * minimizing arrival time. Unlike `findItineraries`, this does NOT prune by
 * earliest arrival: the goal is the longest cycle-free chain of distinct
 * stations, so a later arrival to the same station can still yield more legs.
 *
 * Results are sorted by connection count (descending), then total duration
 * (ascending), then arrival time (ascending).
 */
export function findMaxConnectionItineraries(
  edges: Edge[],
  from: string[],
  to: string[],
  options?: ItineraryOptions,
): Itinerary[] {
  const maxLegs = options?.maxLegs ?? 3;
  const minConnection = options?.minConnection ?? 15;
  const maxConnection = options?.maxConnection;
  const maxDuration = options?.maxDuration;

  if (maxLegs < 1 || from.length === 0 || to.length === 0) return [];

  const fromSet = new Set(from);
  const toSet = new Set(to);

  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }
  // Order by departure time so DFS finds long chains early.
  for (const list of outgoing.values()) {
    list.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  }

  type State = { legs: Edge[]; visited: Set<string> };
  const stack: State[] = [];
  for (const start of fromSet) {
    for (const edge of outgoing.get(start) ?? []) {
      stack.push({ legs: [edge], visited: new Set<string>([edge.from, edge.to]) });
    }
  }

  const results: Itinerary[] = [];
  let bestLegs = 0;
  let explored = 0;
  // Safety valve against combinatorial explosion on dense daily graphs.
  const MAX_EXPLORED = 1_000_000;

  while (stack.length > 0) {
    if (++explored > MAX_EXPLORED) break;

    const state = stack.pop() as State;
    const last = state.legs[state.legs.length - 1];
    const departureTime = state.legs[0].dep;
    const arrivalTime = last.arr;

    if (maxDuration !== undefined && arrivalTime - departureTime > maxDuration) {
      continue;
    }

    if (toSet.has(last.to)) {
      if (state.legs.length > bestLegs) bestLegs = state.legs.length;
      results.push({ legs: state.legs, departureTime, arrivalTime });
    }

    if (state.legs.length >= maxLegs) continue;
    // Once a chain of `maxLegs` legs is found, no longer chain is possible.
    if (bestLegs >= maxLegs) continue;

    for (const edge of outgoing.get(last.to) ?? []) {
      if (state.visited.has(edge.to)) continue;
      if (edge.dep < last.arr + minConnection) continue;
      if (maxConnection !== undefined && edge.dep > last.arr + maxConnection) continue;
      stack.push({
        legs: [...state.legs, edge],
        visited: new Set(state.visited).add(edge.to),
      });
    }
  }

  results.sort(
    (a, b) =>
      b.legs.length - a.legs.length ||
      a.arrivalTime - a.departureTime - (b.arrivalTime - b.departureTime) ||
      a.arrivalTime - b.arrivalTime,
  );
  return results.slice(0, MAX_RESULTS);
}
