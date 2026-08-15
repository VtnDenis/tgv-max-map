import stationsData from '../data/stations.json';
import type { Station } from '../types';

type StationsJson = Record<string, { name: string; lat: number; lon: number }>;

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

const RAW: Array<{ code: string; name: string; lat: number; lon: number }> =
  Object.entries(stationsData as StationsJson).map(([code, data]) => ({
    code,
    name: data.name,
    lat: data.lat,
    lon: data.lon,
  }));

const byName = new Map<string, Station>();
for (const raw of RAW) {
  const key = normalize(raw.name);
  const existing = byName.get(key);
  if (existing) {
    existing.codes.push(raw.code);
  } else {
    byName.set(key, {
      code: raw.code,
      codes: [raw.code],
      name: raw.name,
      lat: raw.lat,
      lon: raw.lon,
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

/** Map any IATA-ish code to the canonical code of its group. */
export function canonicalCode(code: string): string {
  return STATION_BY_CODE.get(code)?.code ?? code;
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
