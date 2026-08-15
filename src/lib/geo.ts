import stationsData from '../data/stations.json';
import type { Station } from '../types';

type StationsJson = Record<
  string,
  { name: string; lat: number; lon: number; uic?: string; uics?: string[] }
>;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

/** Great-circle distance in kilometers between two lat/lon points. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const RAW: Array<{
  code: string;
  name: string;
  lat: number;
  lon: number;
  uic?: string;
  uics?: string[];
}> = Object.entries(stationsData as StationsJson).map(([code, data]) => ({
  code,
  name: data.name,
  lat: data.lat,
  lon: data.lon,
  uic: data.uic,
  uics: data.uics,
}));

const byName = new Map<string, Station>();
for (const raw of RAW) {
  const key = normalize(raw.name);
  const existing = byName.get(key);
  if (existing) {
    existing.codes.push(raw.code);
    if (raw.uics) {
      const set = new Set([...(existing.uics ?? []), ...raw.uics]);
      existing.uics = [...set];
    }
    if (!existing.uic && raw.uic) existing.uic = raw.uic;
  } else {
    byName.set(key, {
      code: raw.code,
      codes: [raw.code],
      name: raw.name,
      lat: raw.lat,
      lon: raw.lon,
      uic: raw.uic,
      uics: raw.uics,
    });
  }
}

const STATIONS: Station[] = [...byName.values()].sort((a, b) =>
  a.name.localeCompare(b.name, 'fr'),
);

const STATION_BY_CODE = new Map<string, Station>();
for (const station of STATIONS) {
  for (const code of station.codes) {
    STATION_BY_CODE.set(code, station);
  }
}

/** Build the full list of stations, grouped by display name, sorted alphabetically. */
export function getAllStations(): Station[] {
  return [...STATIONS];
}

/** Look up a station group by any of its IATA-ish codes. */
export function getStation(code: string): Station | undefined {
  return STATION_BY_CODE.get(code);
}

/** UIC codes for a station code (list for aggregates, single for simple stations). */
export function getStationUics(code: string): string[] {
  const station = getStation(code);
  if (!station) return [];
  if (station.uics) return station.uics;
  if (station.uic) return [station.uic];
  return [];
}

/** Map any IATA-ish code to the canonical code of its group. */
export function canonicalCode(code: string): string {
  return STATION_BY_CODE.get(code)?.code ?? code;
}

/** Return the station group closest to a lat/lon position. */
export function nearestStation(lat: number, lon: number): Station | undefined {
  let best: Station | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const station of STATIONS) {
    const d = haversineKm(lat, lon, station.lat, station.lon);
    if (d < bestDistance) {
      bestDistance = d;
      best = station;
    }
  }
  return best;
}

const PARIS_CENTER = { lat: 48.853, lon: 2.348 };
const PARIS_RADIUS_KM = 30;

/** All stations within ~30 km of central Paris (Paris + nearby TGV hubs). */
export function getParisAreaStations(radiusKm = PARIS_RADIUS_KM): Station[] {
  return STATIONS.filter(
    (s) => haversineKm(PARIS_CENTER.lat, PARIS_CENTER.lon, s.lat, s.lon) <= radiusKm,
  );
}

/** Return stations matching `query` on name or code, ranked by relevance. */
export function searchStations(query: string, limit = 20): Station[] {
  const needle = normalize(query.trim());
  if (needle === '') return [];

  const matches: Array<{ station: Station; rank: number }> = [];
  for (const station of STATIONS) {
    const name = normalize(station.name);
    const code = normalize(station.code);
    let rank = -1;
    if (name.startsWith(needle)) rank = 0;
    else if (name.includes(needle)) rank = 1;
    else if (code.includes(needle)) rank = 2;
    if (rank >= 0) matches.push({ station, rank });
  }

  matches.sort(
    (a, b) => a.rank - b.rank || a.station.name.localeCompare(b.station.name, 'fr'),
  );
  return matches.slice(0, limit).map((m) => m.station);
}
