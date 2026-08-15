import frequentationData from '../data/frequentation.json';
import { getStationUics } from './geo';

const frequentation = frequentationData as Record<string, number>;

/** Total 2024 passenger count for a station code, or null if unavailable. */
export function getAttendance(code: string): number | null {
  const uics = getStationUics(code);
  if (uics.length === 0) return null;

  let total = 0;
  let found = false;
  for (const uic of uics) {
    const count = frequentation[uic];
    if (count !== undefined) {
      total += count;
      found = true;
    }
  }
  return found ? total : null;
}
