import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DateRange,
  Edge,
  Itinerary,
  Leg,
  MapPoint,
  Mode,
  Station,
} from './types';
import {
  getDateRange,
  getDayEdges,
  getDestinations,
  getOrigins,
} from './api/tgvmax';
import { canonicalCode, getAllStations, getStation } from './lib/geo';
import { findItineraries, toMinutes } from './lib/itinerary';
import StationMap, { type MapLine } from './components/StationMap';
import { ItineraryList, LegList } from './components/ResultsList';
import DatePicker from './components/DatePicker';
import StationMultiSelect from './components/StationMultiSelect';
import ModeTabs from './components/ModeTabs';
import ItineraryControls, {
  type ItineraryConstraints,
} from './components/ItineraryControls';
import TimeFilter, { type TimeFilterValue } from './components/TimeFilter';
import ThemeToggle from './components/ThemeToggle';

const FIXED = '#e3000f';
const AVAILABLE = '#0f9d58';
const INTERMEDIATE = '#b26a00';

type SortKey = 'departure' | 'arrival' | 'duration' | 'connections';
type SortDir = 'asc' | 'desc';

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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

function buildPopup(list: Leg[]): string {
  return list
    .map((leg) => {
      const train = leg.train_no ? ` · train ${leg.train_no}` : '';
      return `${leg.heure_depart} → ${leg.heure_arrivee}${train}`;
    })
    .join('<br/>');
}

function canonicalizeLeg(leg: Leg): Leg {
  return {
    ...leg,
    origine_iata: canonicalCode(leg.origine_iata),
    destination_iata: canonicalCode(leg.destination_iata),
  };
}

function canonicalizeEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => ({
    ...edge,
    from: canonicalCode(edge.from),
    to: canonicalCode(edge.to),
  }));
}

export default function App() {
  const [mode, setMode] = useState<Mode>('origin');
  const [date, setDate] = useState('');
  const [range, setRange] = useState<DateRange | null>(null);
  const [origin, setOrigin] = useState<Station[]>([]);
  const [destination, setDestination] = useState<Station[]>([]);
  const [from, setFrom] = useState<Station[]>([]);
  const [to, setTo] = useState<Station[]>([]);
  const [legs, setLegs] = useState<Leg[] | null>(null);
  const [edges, setEdges] = useState<Edge[] | null>(null);
  const [constraints, setConstraints] = useState<ItineraryConstraints>({
    maxConnections: 2,
    minConnection: 15,
    maxConnection: 180,
  });
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({
    departure: { min: 0, max: 24 * 60 - 1 },
    arrival: { min: 0, max: 24 * 60 - 1 },
    kind: 'departure',
  });
  const [selectedItinerary, setSelectedItinerary] = useState<number | null>(null);
  const [connectionTab, setConnectionTab] = useState<number | 'all'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'arrival',
    dir: 'asc',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapPoint | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('tgvmax-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('tgvmax-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  }, []);

  const stations = useMemo(() => getAllStations(), []);
  const edgesCache = useRef<Map<string, Edge[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    getDateRange()
      .then((next) => {
        if (cancelled) return;
        setRange(next);
        setDate((current) => (current === '' ? next.min : current));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(toErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selected =
      mode === 'origin'
        ? origin
        : mode === 'destination'
          ? destination
          : null;

    if (!selected || selected.length === 0 || !date) {
      setLegs(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const codes = selected.flatMap((s) => s.codes);

    const request =
      mode === 'origin'
        ? getDestinations(date, codes)
        : getOrigins(date, codes);

    request
      .then((next) => {
        if (cancelled) return;
        setLegs(next.map(canonicalizeLeg));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(toErrorMessage(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, origin, destination, date]);

  useEffect(() => {
    setEdges(null);
    setFocus(null);
  }, [mode, from, to, date]);

  const searchItinerary = useCallback(async () => {
    if (from.length === 0 || to.length === 0 || !date) return;
    setLoading(true);
    setError(null);
    try {
      let cached = edgesCache.current.get(date);
      if (!cached) {
        cached = canonicalizeEdges(await getDayEdges(date));
        edgesCache.current.set(date, cached);
      }
      setEdges(cached);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to, date]);

  const itineraries = useMemo<Itinerary[] | null>(() => {
    if (!edges || from.length === 0 || to.length === 0) return null;
    const floor = isToday(date) ? nowMinutes() : -1;
    const usable = floor < 0 ? edges : edges.filter((e) => e.dep >= floor);
    const found = findItineraries(
      usable,
      from.map((s) => s.code),
      to.map((s) => s.code),
      {
        maxLegs: constraints.maxConnections + 1,
        minConnection: constraints.minConnection,
        maxConnection: constraints.maxConnection,
      },
    );
    return found.filter((it) => {
      return (
        it.departureTime >= timeFilter.departure.min &&
        it.departureTime <= timeFilter.departure.max &&
        it.arrivalTime >= timeFilter.arrival.min &&
        it.arrivalTime <= timeFilter.arrival.max
      );
    });
  }, [edges, from, to, constraints, timeFilter, date]);

  const connectionCounts = useMemo<Array<[number, number]>>(() => {
    if (!itineraries) return [];
    const counts = new Map<number, number>();
    for (const it of itineraries) {
      const c = it.legs.length - 1;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [itineraries]);

  const visibleItineraries = useMemo<Itinerary[] | null>(() => {
    if (!itineraries) return null;
    const filtered =
      connectionTab === 'all'
        ? itineraries
        : itineraries.filter((it) => it.legs.length - 1 === connectionTab);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'departure':
          return (a.departureTime - b.departureTime) * dir;
        case 'arrival':
          return (a.arrivalTime - b.arrivalTime) * dir;
        case 'duration':
          return (
            (a.arrivalTime - a.departureTime - (b.arrivalTime - b.departureTime)) *
            dir
          );
        case 'connections':
          return (a.legs.length - b.legs.length) * dir;
        default:
          return 0;
      }
    });
  }, [itineraries, connectionTab, sort]);

  const visibleLegs = useMemo<Leg[] | null>(() => {
    if (!legs) return null;
    const floor = isToday(date) ? nowMinutes() : -1;
    const range =
      timeFilter.kind === 'departure' ? timeFilter.departure : timeFilter.arrival;
    return legs.filter((leg) => {
      const dep = toMinutes(leg.heure_depart);
      if (dep < floor) return false;
      const t =
        timeFilter.kind === 'departure' ? dep : toMinutes(leg.heure_arrivee);
      return t >= range.min && t <= range.max;
    });
  }, [legs, date, timeFilter]);

  useEffect(() => {
    setSelectedItinerary(null);
    setConnectionTab('all');
  }, [itineraries]);

  const handleModeChange = useCallback((next: Mode) => {
    setMode(next);
    setLegs(null);
    setEdges(null);
    setFocus(null);
    setError(null);
  }, []);

  const handleSelect = useCallback((code: string) => {
    const station = getStation(code);
    if (!station) return;
    setFocus({
      code: station.code,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
    });
  }, []);

  const mapPoints = useMemo<MapPoint[]>(() => {
    if (mode === 'origin' && origin.length > 0) {
      const points: MapPoint[] = origin.map((s) => ({
        code: s.code,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        color: FIXED,
      }));
      if (visibleLegs) {
        const byDestination = new Map<string, Leg[]>();
        for (const leg of visibleLegs) {
          const list = byDestination.get(leg.destination_iata);
          if (list) list.push(leg);
          else byDestination.set(leg.destination_iata, [leg]);
        }
        for (const [code, list] of byDestination) {
          const station = getStation(code);
          if (!station) continue;
          points.push({
            code: station.code,
            name: station.name,
            lat: station.lat,
            lon: station.lon,
            color: AVAILABLE,
            popup: buildPopup(list),
          });
        }
      }
      return points;
    }

    if (mode === 'destination' && destination.length > 0) {
      const points: MapPoint[] = destination.map((s) => ({
        code: s.code,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        color: FIXED,
      }));
      if (visibleLegs) {
        const byOrigin = new Map<string, Leg[]>();
        for (const leg of visibleLegs) {
          const list = byOrigin.get(leg.origine_iata);
          if (list) list.push(leg);
          else byOrigin.set(leg.origine_iata, [leg]);
        }
        for (const [code, list] of byOrigin) {
          const station = getStation(code);
          if (!station) continue;
          points.push({
            code: station.code,
            name: station.name,
            lat: station.lat,
            lon: station.lon,
            color: AVAILABLE,
            popup: buildPopup(list),
          });
        }
      }
      return points;
    }

    if (mode === 'itinerary') {
      const points: MapPoint[] = [];
      const seen = new Set<string>();

      const addFixed = (station: Station) => {
        if (seen.has(station.code)) return;
        seen.add(station.code);
        points.push({
          code: station.code,
          name: station.name,
          lat: station.lat,
          lon: station.lon,
          color: FIXED,
        });
      };

      for (const s of from) addFixed(s);
      for (const s of to) addFixed(s);

      if (visibleItineraries) {
        for (const itinerary of visibleItineraries) {
          for (const leg of itinerary.legs) {
            for (const code of [leg.from, leg.to]) {
              if (seen.has(code)) continue;
              const station = getStation(code);
              if (!station) continue;
              seen.add(code);
              points.push({
                code: station.code,
                name: station.name,
                lat: station.lat,
                lon: station.lon,
                color: INTERMEDIATE,
              });
            }
          }
        }
      }
      return points;
    }

    return [];
  }, [mode, origin, destination, from, to, visibleLegs, visibleItineraries]);

  const mapLines = useMemo<MapLine[]>(() => {
    if (mode === 'origin' && origin.length > 0 && visibleLegs) {
      const lines: MapLine[] = [];
      for (const o of origin) {
        const seen = new Set<string>();
        for (const leg of visibleLegs) {
          if (leg.origine_iata !== o.code) continue;
          const dest = getStation(leg.destination_iata);
          if (!dest || seen.has(dest.code)) continue;
          seen.add(dest.code);
          lines.push({
            points: [
              [o.lat, o.lon],
              [dest.lat, dest.lon],
            ],
            color: '#9aa4b2',
          });
        }
      }
      return lines;
    }

    if (mode === 'destination' && destination.length > 0 && visibleLegs) {
      const lines: MapLine[] = [];
      for (const d of destination) {
        const seen = new Set<string>();
        for (const leg of visibleLegs) {
          if (leg.destination_iata !== d.code) continue;
          const src = getStation(leg.origine_iata);
          if (!src || seen.has(src.code)) continue;
          seen.add(src.code);
          lines.push({
            points: [
              [src.lat, src.lon],
              [d.lat, d.lon],
            ],
            color: '#9aa4b2',
          });
        }
      }
      return lines;
    }

    if (mode === 'itinerary' && visibleItineraries) {
      const list =
        selectedItinerary !== null && visibleItineraries[selectedItinerary]
          ? [visibleItineraries[selectedItinerary]]
          : visibleItineraries.slice(0, 5);
      const lines: MapLine[] = [];
      for (const itinerary of list) {
        const pts: [number, number][] = [];
        for (const leg of itinerary.legs) {
          const s = getStation(leg.from);
          if (s) pts.push([s.lat, s.lon]);
        }
        const last = itinerary.legs[itinerary.legs.length - 1];
        if (last) {
          const end = getStation(last.to);
          if (end) pts.push([end.lat, end.lon]);
        }
        if (pts.length >= 2) {
          lines.push({ points: pts, color: INTERMEDIATE });
        }
      }
      return lines;
    }

    return [];
  }, [mode, origin, destination, visibleLegs, visibleItineraries, selectedItinerary]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="header-row">
          <h1>
            <span className="brand-dot" />
            TGV MAX Map
          </h1>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        <ModeTabs mode={mode} onChange={handleModeChange} />

        {range ? (
          <DatePicker
            value={date}
            min={range.min}
            max={range.max}
            onChange={setDate}
          />
        ) : (
          <div className="hint">Chargement…</div>
        )}

        <TimeFilter
          value={timeFilter}
          onChange={setTimeFilter}
          showKind={mode !== 'itinerary'}
        />

        {mode === 'origin' && (
          <StationMultiSelect
            label="Gares de départ"
            stations={stations}
            value={origin}
            onChange={setOrigin}
            placeholder="Rechercher une gare…"
          />
        )}

        {mode === 'destination' && (
          <StationMultiSelect
            label="Gares d'arrivée"
            stations={stations}
            value={destination}
            onChange={setDestination}
            placeholder="Rechercher une gare…"
          />
        )}

        {mode === 'itinerary' && (
          <>
            <StationMultiSelect
              label="Départs"
              stations={stations}
              value={from}
              onChange={setFrom}
              placeholder="Rechercher une gare…"
            />
            <StationMultiSelect
              label="Arrivées"
              stations={stations}
              value={to}
              onChange={setTo}
              placeholder="Rechercher une gare…"
            />
            <ItineraryControls value={constraints} onChange={setConstraints} />
            <button
              className="primary"
              type="button"
              disabled={from.length === 0 || to.length === 0 || loading}
              onClick={() => {
                void searchItinerary();
              }}
            >
              Rechercher un itinéraire
            </button>
          </>
        )}

        {loading && <div className="hint">Chargement…</div>}
        {error && (
          <div className="hint" style={{ color: '#e3000f' }}>
            {error}
          </div>
        )}

        {mode === 'origin' && visibleLegs != null && origin.length > 0 && (
          <LegList
            legs={visibleLegs}
            fixedName={origin.map((s) => s.name).join(', ')}
            mode="origin"
            onSelect={handleSelect}
          />
        )}
        {mode === 'destination' && visibleLegs != null && destination.length > 0 && (
          <LegList
            legs={visibleLegs}
            fixedName={destination.map((s) => s.name).join(', ')}
            mode="destination"
            onSelect={handleSelect}
          />
        )}
        {mode === 'itinerary' && itineraries != null && (
          <>
            {itineraries.length > 0 && (
              <>
                <div className="tabs">
                  <button
                    type="button"
                    className={connectionTab === 'all' ? 'active' : undefined}
                    onClick={() => setConnectionTab('all')}
                  >
                    Tous ({itineraries.length})
                  </button>
                  {connectionCounts.map(([count, n]) => (
                    <button
                      type="button"
                      key={count}
                      className={connectionTab === count ? 'active' : undefined}
                      onClick={() => setConnectionTab(count)}
                    >
                      {count === 0 ? 'Direct' : `${count} corresp.`} ({n})
                    </button>
                  ))}
                </div>
                <div className="field">
                  <label>Trier par</label>
                  <select
                    value={`${sort.key}:${sort.dir}`}
                    onChange={(e) => {
                      const [key, dir] = e.target.value.split(':') as [
                        SortKey,
                        SortDir,
                      ];
                      setSort({ key, dir });
                    }}
                  >
                    <option value="arrival:asc">Arrivée (croissante)</option>
                    <option value="arrival:desc">Arrivée (décroissante)</option>
                    <option value="departure:asc">Départ (croissant)</option>
                    <option value="departure:desc">Départ (décroissant)</option>
                    <option value="duration:asc">Durée (croissante)</option>
                    <option value="duration:desc">Durée (décroissante)</option>
                    <option value="connections:asc">Correspondances (min)</option>
                  </select>
                </div>
              </>
            )}
            <ItineraryList
              itineraries={visibleItineraries ?? []}
              onSelect={setSelectedItinerary}
              selected={selectedItinerary}
            />
          </>
        )}
      </aside>

      <div className="map-wrap">
        <StationMap
          points={mapPoints}
          lines={mapLines}
          focus={focus}
          fit
          dark={theme === 'dark'}
          onPointClick={handleSelect}
        />
      </div>
    </div>
  );
}
