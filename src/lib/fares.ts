import faresData from '../data/fares.json';
import { getStationUics } from './geo';

type FaresJson = Record<string, { min: number; max: number }>;

const FARES = faresData as FaresJson;

export interface FareRange {
  min: number;
  max: number;
}

/**
 * Cheapest representative fare range between two station codes. Resolves each
 * code to its list of UIC codes, scans every directed pair, and returns the
 * lowest `min` with the lowest `max` across matches, or null when unknown.
 */
export function getFareRange(fromCode: string, toCode: string): FareRange | null {
  const origins = getStationUics(fromCode);
  const destinations = getStationUics(toCode);
  let best: FareRange | null = null;
  for (const o of origins) {
    for (const d of destinations) {
      const range = FARES[`${o}>${d}`];
      if (!range) continue;
      if (!best || range.min < best.min || (range.min === best.min && range.max < best.max)) {
        best = { min: range.min, max: range.max };
      }
    }
  }
  return best;
}
