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
  getDestinations,
  getOrigins,
  getRangeEdges,
} from './api/tgvmax';
import { canonicalCode, getAllStations, getStation } from './lib/geo';
import {
  findItineraries,
  formatDuration,
  toMinutes,
} from './lib/itinerary';
import StationMap, { type MapLine } from './components/StationMap';
import { ItineraryList, LegList } from './components/ResultsList';
import DateRangePicker from './components/DateRangePicker';
import StationMultiSelect from './components/StationMultiSelect';
import ModeTabs from './components/ModeTabs';
import ItineraryControls, {
  type ItineraryConstraints,
} from './components/ItineraryControls';
import TimeFilter, { type TimeFilterValue } from './components/TimeFilter';
import ThemeToggle from './components/ThemeToggle';
import { useGeolocation } from './hooks/useGeolocation';

const FIXED = '#e3000f';
const AVAILABLE = '#0f9d58';
const INTERMEDIATE = '#b26a00';

const MAX_ITINERARIES = 500;

type SortKey = 'departure' | 'arrival' | 'duration' | 'connections';
type SortDir = 'asc' | 'desc';

type GeoTarget = 'origin' | 'from' | null;

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

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]} ${d}`;
}

function computeDayItineraries(
  edges: Edge[],
  fromCodes: string[],
  toCodes: string[],
  allowedDates: string[] | null,
  options: {
    maxLegs: number;
    minConnection: number;
    maxConnection?: number;
  },
): Itinerary[] {
  const byDate = new Map<string, Edge[]>();
  for (const edge of edges) {
    const d = edge.date ?? '';
    const list = byDate.get(d);
    if (list) list.push(edge);
    else byDate.set(d, [edge]);
  }

  const found: Itinerary[] = [];
  for (const [d, dayEdges] of byDate) {
    if (allowedDates && !allowedDates.includes(d)) continue;
    const floor = isToday(d) ? nowMinutes() : -1;
    const usable = floor < 0 ? dayEdges : dayEdges.filter((e) => e.dep >= floor);
    const dayResults = findItineraries(usable, fromCodes, toCodes, options);
    for (const it of dayResults) {
      found.push({ ...it, date: d });
    }
  }
  return found;
}

function buildPopup(list: Leg[]): string {
  return list
    .map((leg) => {
      const train = leg.train_no ? ` · train ${leg.train_no}` : '';
      const dur = formatDuration(
        toMinutes(leg.heure_arrivee) - toMinutes(leg.heure_depart),
      );
      const day = leg.date ? `${formatDate(leg.date)} ` : '';
      return `${day}${leg.heure_depart} → ${leg.heure_arrivee} (${dur})${train}`;
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
  const [range, setRange] = useState<DateRange | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
  const [selectedOutbound, setSelectedOutbound] = useState<Itinerary | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<Itinerary | null>(null);
  const [connectionTab, setConnectionTab] = useState<number | 'all'>('all');
  const [dayTab, setDayTab] = useState<string | 'all'>('all');
  const [legDayTab, setLegDayTab] = useState<string | 'all'>('all');
  const [tripKind, setTripKind] = useState<'single' | 'return'>('single');
  const [directionTab, setDirectionTab] = useState<'outbound' | 'return'>('outbound');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'arrival',
    dir: 'asc',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapPoint | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [resizeToken, setResizeToken] = useState(0);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('tgvmax-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });
  const geo = useGeolocation();
  const [geoTarget, setGeoTarget] = useState<GeoTarget>(null);

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
        setDateFrom((current) => (current === '' ? next.min : current));
        setDateTo((current) => (current === '' ? next.min : current));
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

    if (!selected || selected.length === 0 || !dateFrom || !dateTo) {
      setLegs(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const codes = selected.flatMap((s) => s.codes);

    const request =
      mode === 'origin'
        ? getDestinations(dateFrom, dateTo, codes)
        : getOrigins(dateFrom, dateTo, codes);

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
  }, [mode, origin, destination, dateFrom, dateTo]);

  useEffect(() => {
    setEdges(null);
    setFocus(null);
  }, [mode, from, to, dateFrom, dateTo]);

  const searchItinerary = useCallback(async () => {
    if (from.length === 0 || to.length === 0 || !dateFrom || !dateTo) return;
    setLoading(true);
    setError(null);
    try {
      const key = `${dateFrom}..${dateTo}`;
      let cached = edgesCache.current.get(key);
      if (!cached) {
        cached = canonicalizeEdges(await getRangeEdges(dateFrom, dateTo));
        edgesCache.current.set(key, cached);
      }
      setEdges(cached);
      setDirectionTab('outbound');
      setSelectedOutbound(null);
      setSelectedReturn(null);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to, dateFrom, dateTo]);

  const itineraries = useMemo<Itinerary[] | null>(() => {
    if (!edges || from.length === 0 || to.length === 0) return null;

    const options = {
      maxLegs: constraints.maxConnections + 1,
      minConnection: constraints.minConnection,
      maxConnection: constraints.maxConnection,
    };

    const found = computeDayItineraries(
      edges,
      from.map((s) => s.code),
      to.map((s) => s.code),
      tripKind === 'return' ? [dateFrom] : null,
      options,
    );

    const filtered = found.filter((it) => {
      return (
        it.departureTime >= timeFilter.departure.min &&
        it.departureTime <= timeFilter.departure.max &&
        it.arrivalTime >= timeFilter.arrival.min &&
        it.arrivalTime <= timeFilter.arrival.max
      );
    });

    filtered.sort(
      (a, b) =>
        (a.date ?? '').localeCompare(b.date ?? '') || a.arrivalTime - b.arrivalTime,
    );
    return filtered.slice(0, MAX_ITINERARIES);
  }, [edges, from, to, constraints, timeFilter, tripKind, dateFrom]);

  const returnItineraries = useMemo<Itinerary[] | null>(() => {
    if (!edges || tripKind !== 'return' || from.length === 0 || to.length === 0) {
      return null;
    }

    const options = {
      maxLegs: constraints.maxConnections + 1,
      minConnection: constraints.minConnection,
      maxConnection: constraints.maxConnection,
    };

    const found = computeDayItineraries(
      edges,
      to.map((s) => s.code),
      from.map((s) => s.code),
      [dateTo],
      options,
    );

    let filtered = found.filter((it) => {
      return (
        it.departureTime >= timeFilter.departure.min &&
        it.departureTime <= timeFilter.departure.max &&
        it.arrivalTime >= timeFilter.arrival.min &&
        it.arrivalTime <= timeFilter.arrival.max
      );
    });

    if (selectedOutbound) {
      const obDate = selectedOutbound.date ?? '';
      const obArr = selectedOutbound.arrivalTime;
      filtered = filtered.filter((it) => {
        const d = it.date ?? '';
        return d > obDate || (d === obDate && it.departureTime >= obArr);
      });
    }

    filtered.sort((a, b) => a.arrivalTime - b.arrivalTime);
    return filtered.slice(0, MAX_ITINERARIES);
  }, [edges, from, to, constraints, timeFilter, tripKind, dateTo, selectedOutbound]);

  const activeItineraries = useMemo<Itinerary[] | null>(
    () => (directionTab === 'return' ? returnItineraries : itineraries),
    [directionTab, returnItineraries, itineraries],
  );

  const connectionCounts = useMemo<Array<[number, number]>>(() => {
    if (!activeItineraries) return [];
    const counts = new Map<number, number>();
    for (const it of activeItineraries) {
      const c = it.legs.length - 1;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [activeItineraries]);

  const dayCounts = useMemo<Array<[string, number]>>(() => {
    if (!activeItineraries) return [];
    const counts = new Map<string, number>();
    for (const it of activeItineraries) {
      const d = it.date ?? '';
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [activeItineraries]);

  const visibleItineraries = useMemo<Itinerary[] | null>(() => {
    if (!activeItineraries) return null;
    let filtered = activeItineraries;
    if (connectionTab !== 'all') {
      filtered = filtered.filter((it) => it.legs.length - 1 === connectionTab);
    }
    if (dayTab !== 'all') {
      filtered = filtered.filter((it) => (it.date ?? '') === dayTab);
    }
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
  }, [activeItineraries, connectionTab, dayTab, sort]);

  const visibleLegs = useMemo<Leg[] | null>(() => {
    if (!legs) return null;
    const range =
      timeFilter.kind === 'departure' ? timeFilter.departure : timeFilter.arrival;
    return legs.filter((leg) => {
      if (legDayTab !== 'all' && (leg.date ?? '') !== legDayTab) return false;
      const dep = toMinutes(leg.heure_depart);
      if (leg.date && isToday(leg.date) && dep < nowMinutes()) return false;
      const t =
        timeFilter.kind === 'departure' ? dep : toMinutes(leg.heure_arrivee);
      return t >= range.min && t <= range.max;
    });
  }, [legs, timeFilter, legDayTab]);

  useEffect(() => {
    setConnectionTab('all');
    setDayTab('all');
  }, [itineraries, returnItineraries]);

  useEffect(() => {
    setSelectedOutbound(null);
  }, [itineraries]);

  useEffect(() => {
    setSelectedReturn(null);
  }, [returnItineraries]);

  useEffect(() => {
    setLegDayTab('all');
  }, [legs]);

  const legDayCounts = useMemo<Array<[string, number]>>(() => {
    if (!legs) return [];
    const counts = new Map<string, number>();
    for (const leg of legs) {
      const d = leg.date ?? '';
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [legs]);

  const handleModeChange = useCallback((next: Mode) => {
    setMode(next);
    setLegs(null);
    setEdges(null);
    setFocus(null);
    setError(null);
    setTripKind('single');
    setDirectionTab('outbound');
    setSelectedOutbound(null);
    setSelectedReturn(null);
  }, []);

  const handleTripKindChange = useCallback((next: 'single' | 'return') => {
    setTripKind(next);
    setDirectionTab('outbound');
    setSelectedOutbound(null);
    setSelectedReturn(null);
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

  const togglePanel = useCallback(() => {
    setPanelOpen((current) => !current);
    window.setTimeout(() => setResizeToken((t) => t + 1), 300);
  }, []);

  const handleGeolocate = useCallback(
    (target: Exclude<GeoTarget, null>) => {
      setGeoTarget(target);
      geo.locate();
    },
    [geo.locate],
  );

  useEffect(() => {
    if (!geo.state.station || !geoTarget) return;
    const station = geo.state.station;
    const add = (list: Station[]): Station[] =>
      list.some((s) => s.code === station.code) ? list : [...list, station];
    if (geoTarget === 'origin') setOrigin(add);
    else if (geoTarget === 'from') setFrom(add);
    setGeoTarget(null);
    geo.reset();
  }, [geo.state.station, geoTarget, geo.reset]);

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
            count: list.length,
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
            count: list.length,
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
      const selected =
        directionTab === 'return' ? selectedReturn : selectedOutbound;
      const list =
        selected && visibleItineraries.includes(selected)
          ? [selected]
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
  }, [mode, origin, destination, visibleLegs, visibleItineraries, selectedOutbound, selectedReturn, directionTab]);

  return (
    <div className="app">
      <aside className={`sidebar${panelOpen ? ' open' : ''}`}>
        <div className="header-row">
          <h1>
            <span className="brand-dot" />
            TGV MAX Map
          </h1>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        <ModeTabs mode={mode} onChange={handleModeChange} />

        {mode === 'itinerary' && (
          <div className="field">
            <label>Type de recherche</label>
            <select
              value={tripKind}
              onChange={(e) =>
                handleTripKindChange(e.target.value as 'single' | 'return')
              }
            >
              <option value="single">Aller simple</option>
              <option value="return">Aller-retour</option>
            </select>
          </div>
        )}

        {range ? (
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            min={range.min}
            max={range.max}
            mode={tripKind === 'return' ? 'split' : 'range'}
            label="Dates"
            fromLabel="Aller"
            toLabel="Retour"
            onChange={({ from: f, to: t }) => {
              setDateFrom(f);
              setDateTo(t);
            }}
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
            onGeolocate={() => handleGeolocate('origin')}
            geolocating={geoTarget === 'origin' && geo.state.loading}
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
              onGeolocate={() => handleGeolocate('from')}
              geolocating={geoTarget === 'from' && geo.state.loading}
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
              {tripKind === 'return'
                ? 'Rechercher l’aller-retour'
                : 'Rechercher un itinéraire'}
            </button>
          </>
        )}

        {loading && <div className="hint">Chargement…</div>}
        {error && (
          <div className="hint" style={{ color: '#e3000f' }}>
            {error}
          </div>
        )}
        {geo.state.error && (
          <div className="hint" style={{ color: '#e3000f' }}>
            {geo.state.error}
          </div>
        )}

        {mode === 'origin' && visibleLegs != null && origin.length > 0 && (
          <>
            {legDayCounts.length > 1 && (
              <div className="tabs day-tabs">
                <button
                  type="button"
                  className={legDayTab === 'all' ? 'active' : undefined}
                  onClick={() => setLegDayTab('all')}
                >
                  Tous
                </button>
                {legDayCounts.map(([d, n]) => (
                  <button
                    type="button"
                    key={d}
                    className={legDayTab === d ? 'active' : undefined}
                    onClick={() => setLegDayTab(d)}
                  >
                    {formatDayLabel(d)} ({n})
                  </button>
                ))}
              </div>
            )}
            <LegList
              legs={visibleLegs}
              fixedName={origin.map((s) => s.name).join(', ')}
              mode="origin"
              onSelect={handleSelect}
            />
          </>
        )}
        {mode === 'destination' && visibleLegs != null && destination.length > 0 && (
          <>
            {legDayCounts.length > 1 && (
              <div className="tabs day-tabs">
                <button
                  type="button"
                  className={legDayTab === 'all' ? 'active' : undefined}
                  onClick={() => setLegDayTab('all')}
                >
                  Tous
                </button>
                {legDayCounts.map(([d, n]) => (
                  <button
                    type="button"
                    key={d}
                    className={legDayTab === d ? 'active' : undefined}
                    onClick={() => setLegDayTab(d)}
                  >
                    {formatDayLabel(d)} ({n})
                  </button>
                ))}
              </div>
            )}
            <LegList
              legs={visibleLegs}
              fixedName={destination.map((s) => s.name).join(', ')}
              mode="destination"
              onSelect={handleSelect}
            />
          </>
        )}
        {mode === 'itinerary' && activeItineraries != null && (
          <>
            {activeItineraries.length > 0 && (
              <>
                {tripKind === 'return' && (
                  <div className="tabs">
                    <button
                      type="button"
                      className={directionTab === 'outbound' ? 'active' : undefined}
                      onClick={() => setDirectionTab('outbound')}
                    >
                      Aller ({itineraries?.length ?? 0})
                    </button>
                    <button
                      type="button"
                      className={directionTab === 'return' ? 'active' : undefined}
                      onClick={() => setDirectionTab('return')}
                    >
                      Retour ({returnItineraries?.length ?? 0})
                    </button>
                  </div>
                )}
                <div className="tabs">
                  <button
                    type="button"
                    className={connectionTab === 'all' ? 'active' : undefined}
                    onClick={() => setConnectionTab('all')}
                  >
                    Tous ({activeItineraries.length})
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
                {dayCounts.length > 1 && (
                  <div className="field">
                    <label>Jour</label>
                    <select
                      value={dayTab}
                      onChange={(e) => setDayTab(e.target.value)}
                    >
                      <option value="all">Tous les jours</option>
                      {dayCounts.map(([d, n]) => (
                        <option key={d} value={d}>
                          {formatDate(d)} ({n})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
            {directionTab === 'return' && selectedOutbound && (
              <div className="hint">
                Retours après {formatDate(selectedOutbound.date ?? '')}{' '}
                {formatTime(selectedOutbound.arrivalTime)}
              </div>
            )}
            <ItineraryList
              itineraries={visibleItineraries ?? []}
              selected={
                directionTab === 'return' ? selectedReturn : selectedOutbound
              }
              onSelect={(it) => {
                if (directionTab === 'return') {
                  setSelectedReturn((cur) => (cur === it ? null : it));
                } else {
                  setSelectedOutbound((cur) => (cur === it ? null : it));
                }
              }}
            />
          </>
        )}

        {(mode === 'origin' || mode === 'destination') &&
          visibleLegs != null &&
          visibleLegs.length > 0 && (
            <div className="legend">
              <span>
                <span className="swatch" style={{ background: AVAILABLE }} />
                disponible
              </span>
              <span>taille = nombre de départs</span>
            </div>
          )}
      </aside>

      <div className="map-wrap">
        <StationMap
          points={mapPoints}
          lines={mapLines}
          focus={focus}
          fit
          dark={theme === 'dark'}
          resizeToken={resizeToken}
          onPointClick={handleSelect}
        />
        <button
          type="button"
          className="map-toggle"
          aria-label={panelOpen ? 'Fermer le panneau' : 'Ouvrir le panneau'}
          onClick={togglePanel}
        >
          {panelOpen ? '✕' : '☰'}
        </button>
        {panelOpen && <div className="map-backdrop" onClick={togglePanel} />}
      </div>
    </div>
  );
}
