import type {
  DateRange,
  Edge,
  Leg,
} from '../types';

export const API_BASE =
  'https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax';

interface RecordsResponse<T> {
  total_count: number;
  results: T[];
}

interface DateRangeResult {
  mindate: string;
  maxdate: string;
}

interface StationCountRow {
  origine: string;
  origine_iata: string;
  n: number;
}

const LIMIT = 100;
const MAX_OFFSET = 10000;

/** Convert "HH:MM" to minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `tgvmax API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
    );
  }
  return (await res.json()) as T;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ';') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Min/max date available (30-day rolling window). */
export async function getDateRange(): Promise<DateRange> {
  const url =
    `${API_BASE}/records?select=min(date)%20as%20mindate,max(date)%20as%20maxdate&limit=1`;
  const data = await fetchJson<RecordsResponse<DateRangeResult>>(url);
  const row = data.results[0];
  return {
    min: row.mindate.slice(0, 10),
    max: row.maxdate.slice(0, 10),
  };
}

async function fetchAllLegs(params: URLSearchParams): Promise<Leg[]> {
  const collected: Leg[] = [];
  let offset = 0;
  for (;;) {
    const p = new URLSearchParams(params);
    p.set('limit', String(LIMIT));
    p.set('offset', String(offset));
    const url = `${API_BASE}/records?${p.toString()}`;
    const data = await fetchJson<RecordsResponse<Leg>>(url);
    collected.push(...data.results);
    if (data.results.length < LIMIT || offset + LIMIT >= MAX_OFFSET) {
      break;
    }
    offset += LIMIT;
  }
  collected.sort((a, b) => a.heure_depart.localeCompare(b.heure_depart));
  return collected;
}

function quoteList(codes: string[]): string {
  return codes.map((code) => `'${code}'`).join(',');
}

/** All OUI destinations reachable from given origins on a date. */
export async function getDestinations(
  date: string,
  originCodes: string[],
): Promise<Leg[]> {
  const params = new URLSearchParams({
    select: 'origine,destination,origine_iata,destination_iata,heure_depart,heure_arrivee,train_no',
    where: `date=date'${date}' AND origine_iata IN (${quoteList(originCodes)}) AND od_happy_card="OUI"`,
  });
  return fetchAllLegs(params);
}

/** All OUI origins that can reach given destinations on a date. */
export async function getOrigins(
  date: string,
  destinationCodes: string[],
): Promise<Leg[]> {
  const params = new URLSearchParams({
    select: 'origine,destination,origine_iata,destination_iata,heure_depart,heure_arrivee,train_no',
    where: `date=date'${date}' AND destination_iata IN (${quoteList(destinationCodes)}) AND od_happy_card="OUI"`,
  });
  return fetchAllLegs(params);
}

/** Distinct origins that have at least one OUI leg on a date. */
export async function getAvailableStations(
  date: string,
): Promise<{ code: string; name: string; count: number }[]> {
  const stations: { code: string; name: string; count: number }[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({
      select: 'origine,origine_iata,count(*) as n',
      group_by: 'origine,origine_iata',
      where: `date=date'${date}' AND od_happy_card="OUI"`,
      limit: String(LIMIT),
      offset: String(offset),
    });
    const url = `${API_BASE}/records?${params.toString()}`;
    const data = await fetchJson<RecordsResponse<StationCountRow>>(url);
    for (const row of data.results) {
      stations.push({ code: row.origine_iata, name: row.origine, count: row.n });
    }
    if (data.results.length < LIMIT || offset + LIMIT >= MAX_OFFSET) {
      break;
    }
    offset += LIMIT;
  }
  return stations;
}

/** Full-day OUI edges as a normalized graph for itinerary search. */
export async function getDayEdges(date: string): Promise<Edge[]> {
  const params = new URLSearchParams({
    select: 'origine_iata,destination_iata,origine,destination,heure_depart,heure_arrivee,train_no',
    where: `date=date'${date}' AND od_happy_card="OUI"`,
  });
  const url = `${API_BASE}/exports/csv?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`tgvmax CSV ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const rows = parseCsv(text);

  const edges: Edge[] = [];
  for (const row of rows.slice(1)) {
    if (row.length < 7) continue;
    edges.push({
      from: row[0],
      to: row[1],
      fromName: row[2],
      toName: row[3],
      dep: toMinutes(row[4]),
      arr: toMinutes(row[5]),
      trainNo: row[6],
    });
  }
  return edges;
}
