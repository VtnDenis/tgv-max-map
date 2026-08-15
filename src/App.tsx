import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type {
  ChallengeResult,
  DateRange,
  DayAggregate,
  Edge,
  Itinerary,
  Leg,
  MapPoint,
  Mode,
  RadiusCircle,
  Station,
} from './types';
import {
  getDateRange,
  getDestinations,
  getHeatmapEdges,
  getOrigins,
  getRangeEdges,
} from './api/tgvmax';
import {
  canonicalCode,
  getAllStations,
  getStation,
  haversineKm,
} from './lib/geo';
import {
  findItineraries,
  findMaxConnectionItineraries,
  formatDuration,
  toMinutes,
} from './lib/itinerary';
import { computeChallenges, computeLongestItinerary } from './lib/challenges';
import StationMap, { type MapLine } from './components/StationMap';
import { ItineraryList, LegList } from './components/ResultsList';
import RayonList, { type RayonDestination } from './components/RayonList';
import ChallengeList from './components/ChallengeList';
import RadiusSlider from './components/RadiusSlider';
import DateRangePicker from './components/DateRangePicker';
import StationMultiSelect from './components/StationMultiSelect';
import ModeTabs from './components/ModeTabs';
import HeatmapScrubber, {
  HEATMAP_SPEED_MS,
  type HeatmapSpeed,
} from './components/HeatmapScrubber';
import ItineraryControls, {
  type ItineraryConstraints,
} from './components/ItineraryControls';
import TimeFilter, { type TimeFilterValue } from './components/TimeFilter';
import ThemeToggle from './components/ThemeToggle';
import PostcardModal from './components/PostcardModal';
import { useGeolocation } from './hooks/useGeolocation';
import { useConfetti } from './hooks/useConfetti';
import { useSameDayCelebration } from './hooks/useSameDayCelebration';
import { useKonamiCode } from './hooks/useKonamiCode';

const FIXED = '#e3000f';
const AVAILABLE = '#0f9d58';
const INTERMEDIATE = '#b26a00';
const HIGHLIGHT = '#f9ab00';
const CHALLENGE_GOLD = '#f2b705';

/** Gradient vert → orange → rouge pour l'intensité d'une carte de chauffe. */
function heatColor(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const green = [15, 157, 88]; // #0f9d58
  const orange = [178, 106, 0]; // #b26a00
  const red = [227, 0, 15]; // #e3000f
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const from = c < 0.5 ? green : orange;
  const to = c < 0.5 ? orange : red;
  const k = c < 0.5 ? c / 0.5 : (c - 0.5) / 0.5;
  return `rgb(${Math.round(lerp(from[0], to[0], k))},${Math.round(
    lerp(from[1], to[1], k),
  )},${Math.round(lerp(from[2], to[2], k))})`;
}

const HEATMAP_LINK_LIMIT = 800;

const MAX_ITINERARIES = 500;

const RAYON_MIN = 25;
const RAYON_MAX = 500;
const RAYON_STEP = 25;
const RAYON_DEFAULT = 200;

const SIDEBAR_DEFAULT = 340;
const SIDEBAR_MIN = 280;
const SIDEBAR_MAX = 720;
const SIDEBAR_STORAGE_KEY = 'tgvmax-sidebar-width';

function clampSidebarWidth(width: number): number {
  const max = Math.max(
    SIDEBAR_MIN,
    Math.min(SIDEBAR_MAX, window.innerWidth - 120),
  );
  return Math.min(Math.max(width, SIDEBAR_MIN), max);
}

function getInitialSidebarWidth(): number {
  const saved = Number(localStorage.getItem(SIDEBAR_STORAGE_KEY));
  return clampSidebarWidth(Number.isFinite(saved) ? saved : SIDEBAR_DEFAULT);
}

type SortKey = 'departure' | 'arrival' | 'duration' | 'connections';
type SortDir = 'asc' | 'desc';

type GeoTarget = 'origin' | 'from' | 'rayon' | null;

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
    maxDuration?: number;
  },
  searchKind: 'normal' | 'record' = 'normal',
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
    const dayResults =
      searchKind === 'record'
        ? findMaxConnectionItineraries(usable, fromCodes, toCodes, options)
        : findItineraries(usable, fromCodes, toCodes, options);
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

function challengePopup(result: ChallengeResult): string {
  if (result.legs && result.legs.length > 0) return buildPopup(result.legs);
  if (result.itinerary) {
    return result.itinerary.legs
      .map(
        (leg) =>
          `${formatTime(leg.dep)} → ${formatTime(leg.arr)} (${formatDuration(leg.arr - leg.dep)})`,
      )
      .join('<br/>');
  }
  return result.detail ?? '';
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
  const [rayonOrigin, setRayonOrigin] = useState<Station[]>([]);
  const [rayonRadius, setRayonRadius] = useState(RAYON_DEFAULT);
  const [rayonLegs, setRayonLegs] = useState<Leg[] | null>(null);
  const [legs, setLegs] = useState<Leg[] | null>(null);
  const [edges, setEdges] = useState<Edge[] | null>(null);
  const [challengeEdges, setChallengeEdges] = useState<Edge[] | null>(null);
  const [challengeItineraryLoading, setChallengeItineraryLoading] = useState(false);
  const [heatmapOrigin, setHeatmapOrigin] = useState<Station[]>([]);
  const [heatmapEdges, setHeatmapEdges] = useState<Edge[] | null>(null);
  const [heatmapIndex, setHeatmapIndex] = useState(0);
  const [heatmapPlaying, setHeatmapPlaying] = useState(false);
  const [heatmapSpeed, setHeatmapSpeed] = useState<HeatmapSpeed>('normal');
  const [heatmapCumulative, setHeatmapCumulative] = useState(true);
  const [constraints, setConstraints] = useState<ItineraryConstraints>({
    maxConnections: 2,
    minConnection: 15,
    maxConnection: 180,
    maxDuration: 14 * 60,
  });
  const [timeFilter, setTimeFilter] = useState<TimeFilterValue>({
    departure: { min: 0, max: 24 * 60 - 1 },
    arrival: { min: 0, max: 24 * 60 - 1 },
    kind: 'departure',
  });
  const [returnTimeFilter, setReturnTimeFilter] = useState<TimeFilterValue>({
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
  const [searchKind, setSearchKind] = useState<'normal' | 'record'>('normal');
  const [directionTab, setDirectionTab] = useState<'outbound' | 'return'>('outbound');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'arrival',
    dir: 'asc',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapPoint | null>(null);
  const [roulettePick, setRoulettePick] = useState<string | null>(null);
  const [rouletteLegs, setRouletteLegs] = useState<Leg[] | null>(null);
  const [postcardOpen, setPostcardOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [resizeToken, setResizeToken] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const sidebarDrag = useRef<{
    startX: number;
    startWidth: number;
    width: number;
  } | null>(null);
  const sidebarRaf = useRef<number | null>(null);
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
  const heatmapCache = useRef<Map<string, Edge[]>>(new Map());

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
      mode === 'origin' || mode === 'challenges'
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
      mode === 'destination'
        ? getOrigins(dateFrom, dateTo, codes)
        : getDestinations(dateFrom, dateTo, codes);

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
    if (mode !== 'rayon' || rayonOrigin.length === 0 || !dateFrom) {
      setRayonLegs(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const codes = rayonOrigin.flatMap((s) => s.codes);

    getDestinations(dateFrom, dateFrom, codes)
      .then((next) => {
        if (cancelled) return;
        setRayonLegs(next.map(canonicalizeLeg));
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
  }, [mode, rayonOrigin, dateFrom]);

  useEffect(() => {
    if (mode !== 'heatmap' || !range) return;

    const key = `${range.min}..${range.max}`;
    const cached = heatmapCache.current.get(key);
    if (cached) {
      setHeatmapEdges(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getHeatmapEdges(range.min, range.max)
      .then((next) => {
        if (cancelled) return;
        const canonical = canonicalizeEdges(next);
        heatmapCache.current.set(key, canonical);
        setHeatmapEdges(canonical);
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
  }, [mode, range]);

  useEffect(() => {
    setEdges(null);
    setChallengeEdges(null);
    setFocus(null);
    setRoulettePick(null);
    setRouletteLegs(null);
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

  const loadLongestItinerary = useCallback(async () => {
    if (origin.length === 0 || !dateFrom || !dateTo) return;
    setChallengeItineraryLoading(true);
    setError(null);
    try {
      const key = `${dateFrom}..${dateTo}`;
      let cached = edgesCache.current.get(key);
      if (!cached) {
        cached = canonicalizeEdges(await getRangeEdges(dateFrom, dateTo));
        edgesCache.current.set(key, cached);
      }
      setChallengeEdges(cached);
    } catch (err: unknown) {
      setError(toErrorMessage(err));
    } finally {
      setChallengeItineraryLoading(false);
    }
  }, [origin, dateFrom, dateTo]);

  const itineraries = useMemo<Itinerary[] | null>(() => {
    if (!edges || from.length === 0 || to.length === 0) return null;

    const options = {
      maxLegs: constraints.maxConnections + 1,
      minConnection: constraints.minConnection,
      maxConnection: constraints.maxConnection,
      maxDuration: constraints.maxDuration,
    };

    const found = computeDayItineraries(
      edges,
      from.map((s) => s.code),
      to.map((s) => s.code),
      tripKind === 'return' ? [dateFrom] : null,
      options,
      searchKind,
    );

    const filtered = found.filter((it) => {
      return (
        it.departureTime >= timeFilter.departure.min &&
        it.departureTime <= timeFilter.departure.max &&
        it.arrivalTime >= timeFilter.arrival.min &&
        it.arrivalTime <= timeFilter.arrival.max
      );
    });

    if (searchKind === 'record') {
      filtered.sort(
        (a, b) =>
          b.legs.length - a.legs.length ||
          a.arrivalTime -
            a.departureTime -
            (b.arrivalTime - b.departureTime) ||
          (a.date ?? '').localeCompare(b.date ?? '') ||
          a.arrivalTime - b.arrivalTime,
      );
    } else {
      filtered.sort(
        (a, b) =>
          (a.date ?? '').localeCompare(b.date ?? '') || a.arrivalTime - b.arrivalTime,
      );
    }
    return filtered.slice(0, MAX_ITINERARIES);
  }, [edges, from, to, constraints, timeFilter, tripKind, dateFrom, searchKind]);

  const returnItineraries = useMemo<Itinerary[] | null>(() => {
    if (!edges || tripKind !== 'return' || from.length === 0 || to.length === 0) {
      return null;
    }

    const options = {
      maxLegs: constraints.maxConnections + 1,
      minConnection: constraints.minConnection,
      maxConnection: constraints.maxConnection,
      maxDuration: constraints.maxDuration,
    };

    const found = computeDayItineraries(
      edges,
      to.map((s) => s.code),
      from.map((s) => s.code),
      [dateTo],
      options,
      searchKind,
    );

    let filtered = found.filter((it) => {
      return (
        it.departureTime >= returnTimeFilter.departure.min &&
        it.departureTime <= returnTimeFilter.departure.max &&
        it.arrivalTime >= returnTimeFilter.arrival.min &&
        it.arrivalTime <= returnTimeFilter.arrival.max
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

    if (searchKind === 'record') {
      filtered.sort(
        (a, b) =>
          b.legs.length - a.legs.length ||
          a.arrivalTime -
            a.departureTime -
            (b.arrivalTime - b.departureTime) ||
          a.arrivalTime - b.arrivalTime,
      );
    } else {
      filtered.sort((a, b) => a.arrivalTime - b.arrivalTime);
    }
    return filtered.slice(0, MAX_ITINERARIES);
  }, [edges, from, to, constraints, returnTimeFilter, tripKind, dateTo, selectedOutbound, searchKind]);

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

  const visibleRayonDestinations = useMemo<RayonDestination[]>(() => {
    if (!rayonLegs || rayonOrigin.length === 0) return [];
    const origin = rayonOrigin[0];
    const byDestination = new Map<string, Leg[]>();
    for (const leg of rayonLegs) {
      if (leg.date && isToday(leg.date) && toMinutes(leg.heure_depart) < nowMinutes()) {
        continue;
      }
      const list = byDestination.get(leg.destination_iata);
      if (list) list.push(leg);
      else byDestination.set(leg.destination_iata, [leg]);
    }
    const result: RayonDestination[] = [];
    for (const [code, list] of byDestination) {
      const station = getStation(code);
      if (!station) continue;
      const distanceKm = haversineKm(
        origin.lat,
        origin.lon,
        station.lat,
        station.lon,
      );
      if (distanceKm > rayonRadius) continue;
      result.push({ code: station.code, name: station.name, distanceKm, legs: list });
    }
    result.sort((a, b) => a.distanceKm - b.distanceKm);
    return result;
  }, [rayonLegs, rayonOrigin, rayonRadius]);

  const challengeResults = useMemo<ChallengeResult[]>(() => {
    const originStation = origin[0] ?? null;
    const direct = computeChallenges(legs, originStation);
    const itinerary = computeLongestItinerary(challengeEdges, originStation);
    return [...direct, itinerary];
  }, [legs, origin, challengeEdges]);

  const heatmapDates = useMemo<string[]>(() => {
    if (!heatmapEdges) return [];
    const set = new Set<string>();
    for (const edge of heatmapEdges) {
      if (edge.date) set.add(edge.date);
    }
    return [...set].sort();
  }, [heatmapEdges]);

  const heatmapByDay = useMemo<Map<string, DayAggregate>>(() => {
    const byDay = new Map<string, DayAggregate>();
    if (!heatmapEdges) return byDay;

    const originCodes = new Set(heatmapOrigin.map((s) => s.code));
    const filtered =
      originCodes.size === 0
        ? heatmapEdges
        : heatmapEdges.filter((e) => originCodes.has(e.from));

    for (const edge of filtered) {
      const date = edge.date ?? '';
      if (!date) continue;
      let agg = byDay.get(date);
      if (!agg) {
        agg = { origins: new Map(), destinations: new Map(), links: new Map() };
        byDay.set(date, agg);
      }
      const from = canonicalCode(edge.from);
      const to = canonicalCode(edge.to);
      agg.origins.set(from, (agg.origins.get(from) ?? 0) + 1);
      agg.destinations.set(to, (agg.destinations.get(to) ?? 0) + 1);
      const key = `${from}→${to}`;
      const existing = agg.links.get(key);
      if (existing) existing.count += 1;
      else agg.links.set(key, { from, to, count: 1 });
    }
    return byDay;
  }, [heatmapEdges, heatmapOrigin]);

  const visibleHeatmap = useMemo<DayAggregate | null>(() => {
    if (!heatmapEdges || heatmapDates.length === 0) return null;
    const current = heatmapDates[Math.min(heatmapIndex, heatmapDates.length - 1)];
    if (!heatmapCumulative) {
      return heatmapByDay.get(current) ?? null;
    }

    const agg: DayAggregate = {
      origins: new Map(),
      destinations: new Map(),
      links: new Map(),
    };
    const stop = Math.min(heatmapIndex, heatmapDates.length - 1);
    for (let i = 0; i <= stop; i++) {
      const day = heatmapByDay.get(heatmapDates[i]);
      if (!day) continue;
      for (const [code, n] of day.origins) {
        agg.origins.set(code, (agg.origins.get(code) ?? 0) + n);
      }
      for (const [code, n] of day.destinations) {
        agg.destinations.set(code, (agg.destinations.get(code) ?? 0) + n);
      }
      for (const link of day.links.values()) {
        const key = `${link.from}→${link.to}`;
        const existing = agg.links.get(key);
        if (existing) existing.count += link.count;
        else agg.links.set(key, { ...link });
      }
    }
    return agg;
  }, [heatmapByDay, heatmapDates, heatmapIndex, heatmapCumulative, heatmapEdges]);

  useEffect(() => {
    setHeatmapIndex(0);
    setHeatmapPlaying(false);
  }, [heatmapOrigin]);

  useEffect(() => {
    if (!heatmapPlaying || heatmapDates.length === 0) return;
    const ms = HEATMAP_SPEED_MS[heatmapSpeed];
    const id = window.setInterval(() => {
      setHeatmapIndex((i) => (i >= heatmapDates.length - 1 ? 0 : i + 1));
    }, ms);
    return () => window.clearInterval(id);
  }, [heatmapPlaying, heatmapSpeed, heatmapDates.length]);

  const { fire } = useConfetti();
  useSameDayCelebration({
    mode,
    legs: visibleLegs,
    itineraries: activeItineraries,
    fire,
  });
  useKonamiCode(() => fire('max'));

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
    setRoulettePick(null);
    setRouletteLegs(null);
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
    setRayonLegs(null);
    setChallengeEdges(null);
    setFocus(null);
    setRoulettePick(null);
    setRouletteLegs(null);
    setError(null);
    setTripKind('single');
    setSearchKind('normal');
    setDirectionTab('outbound');
    setSelectedOutbound(null);
    setSelectedReturn(null);
    setHeatmapIndex(0);
    setHeatmapPlaying(false);
  }, []);

  const handleTripKindChange = useCallback((next: 'single' | 'return') => {
    setTripKind(next);
    setDirectionTab('outbound');
    setSelectedOutbound(null);
    setSelectedReturn(null);
  }, []);

  const handleSearchKindChange = useCallback((next: 'normal' | 'record') => {
    setSearchKind(next);
    setSelectedOutbound(null);
    setSelectedReturn(null);
    if (next === 'record') {
      setSort({ key: 'connections', dir: 'desc' });
      setConstraints((c) => ({
        ...c,
        maxConnections: Math.max(c.maxConnections, 6),
      }));
    } else {
      setSort({ key: 'arrival', dir: 'asc' });
      setConstraints((c) => ({
        ...c,
        maxConnections: Math.min(c.maxConnections, 2),
      }));
    }
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

  const rollRoulette = useCallback(() => {
    if (!visibleLegs || visibleLegs.length === 0) return;

    const byDestination = new Map<string, Leg[]>();
    for (const leg of visibleLegs) {
      const list = byDestination.get(leg.destination_iata);
      if (list) list.push(leg);
      else byDestination.set(leg.destination_iata, [leg]);
    }

    const codes = [...byDestination.keys()];
    if (codes.length === 0) return;

    const code = codes[Math.floor(Math.random() * codes.length)];
    const station = getStation(code);
    if (!station) return;

    setRoulettePick(code);
    setRouletteLegs(byDestination.get(code) ?? []);
    setFocus({
      code: station.code,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
    });
  }, [visibleLegs]);

  const togglePanel = useCallback(() => {
    setPanelOpen((current) => !current);
    window.setTimeout(() => setResizeToken((t) => t + 1), 300);
  }, []);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      sidebarDrag.current = {
        startX: e.clientX,
        startWidth: sidebarWidth,
        width: sidebarWidth,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
    },
    [sidebarWidth],
  );

  const handleResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = sidebarDrag.current;
      if (!drag) return;
      drag.width = clampSidebarWidth(drag.startWidth + (e.clientX - drag.startX));
      setSidebarWidth(drag.width);
      if (sidebarRaf.current == null) {
        sidebarRaf.current = window.requestAnimationFrame(() => {
          sidebarRaf.current = null;
          setResizeToken((t) => t + 1);
        });
      }
    },
    [],
  );

  const handleResizeEnd = useCallback(() => {
    const width = sidebarDrag.current?.width ?? sidebarWidth;
    sidebarDrag.current = null;
    document.body.classList.remove('resizing');
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
    setResizeToken((t) => t + 1);
  }, [sidebarWidth]);

  const handleResizeReset = useCallback(() => {
    setSidebarWidth(SIDEBAR_DEFAULT);
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(SIDEBAR_DEFAULT));
    setResizeToken((t) => t + 1);
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
    else if (geoTarget === 'rayon') setRayonOrigin([station]);
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
            color: station.code === roulettePick ? HIGHLIGHT : AVAILABLE,
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

    if (mode === 'rayon' && rayonOrigin.length > 0) {
      const points: MapPoint[] = rayonOrigin.map((s) => ({
        code: s.code,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        color: FIXED,
      }));
      for (const dest of visibleRayonDestinations) {
        const station = getStation(dest.code);
        if (!station) continue;
        points.push({
          code: station.code,
          name: station.name,
          lat: station.lat,
          lon: station.lon,
          color: AVAILABLE,
          popup: buildPopup(dest.legs),
          count: dest.legs.length,
        });
      }
      return points;
    }

    if (mode === 'challenges' && origin.length > 0) {
      const points: MapPoint[] = origin.map((s) => ({
        code: s.code,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        color: FIXED,
      }));
      const seen = new Set<string>(origin.map((s) => s.code));
      for (const result of challengeResults) {
        if (!result.winner || seen.has(result.winner.code)) continue;
        seen.add(result.winner.code);
        points.push({
          code: result.winner.code,
          name: result.winner.name,
          lat: result.winner.lat,
          lon: result.winner.lon,
          color: CHALLENGE_GOLD,
          popup: challengePopup(result),
        });
      }
      return points;
    }

    if (mode === 'heatmap' && visibleHeatmap) {
      const codes = new Set<string>([
        ...visibleHeatmap.origins.keys(),
        ...visibleHeatmap.destinations.keys(),
      ]);
      let maxCount = 1;
      for (const n of visibleHeatmap.origins.values()) {
        maxCount = Math.max(maxCount, n);
      }
      const points: MapPoint[] = [];
      for (const code of codes) {
        const station = getStation(code);
        if (!station) continue;
        const count = visibleHeatmap.origins.get(code) ?? 0;
        const intensity = count / maxCount;
        points.push({
          code: station.code,
          name: station.name,
          lat: station.lat,
          lon: station.lon,
          color: heatColor(intensity),
          count,
          opacity: 0.35 + 0.65 * intensity,
          intensity,
        });
      }
      return points;
    }

    return [];
  }, [mode, origin, destination, from, to, rayonOrigin, visibleLegs, visibleItineraries, visibleRayonDestinations, roulettePick, challengeResults, visibleHeatmap]);

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

    if (mode === 'rayon' && rayonOrigin.length > 0) {
      const lines: MapLine[] = [];
      for (const o of rayonOrigin) {
        for (const dest of visibleRayonDestinations) {
          const d = getStation(dest.code);
          if (!d) continue;
          lines.push({
            points: [
              [o.lat, o.lon],
              [d.lat, d.lon],
            ],
            color: '#9aa4b2',
          });
        }
      }
      return lines;
    }

    if (mode === 'challenges' && origin.length > 0) {
      const lines: MapLine[] = [];
      const seen = new Set<string>();
      for (const o of origin) {
        for (const result of challengeResults) {
          if (!result.winner) continue;
          const key = `${o.code}:${result.winner.code}`;
          if (seen.has(key)) continue;
          seen.add(key);
          lines.push({
            points: [
              [o.lat, o.lon],
              [result.winner.lat, result.winner.lon],
            ],
            color: CHALLENGE_GOLD,
          });
        }
      }
      return lines;
    }

    if (mode === 'heatmap' && visibleHeatmap) {
      const links = [...visibleHeatmap.links.values()];
      links.sort((a, b) => b.count - a.count);
      const capped = links.slice(0, HEATMAP_LINK_LIMIT);
      let maxCount = 1;
      for (const link of capped) maxCount = Math.max(maxCount, link.count);
      const lines: MapLine[] = [];
      for (const link of capped) {
        const a = getStation(link.from);
        const b = getStation(link.to);
        if (!a || !b) continue;
        lines.push({
          points: [
            [a.lat, a.lon],
            [b.lat, b.lon],
          ],
          color: '#9aa4b2',
          opacity: 0.2 + 0.6 * (link.count / maxCount),
        });
      }
      return lines;
    }

    return [];
  }, [mode, origin, destination, visibleLegs, visibleItineraries, rayonOrigin, visibleRayonDestinations, selectedOutbound, selectedReturn, directionTab, challengeResults, visibleHeatmap]);

  const currentPostcard = directionTab === 'return' ? selectedReturn : selectedOutbound;

  const radiusCircle = useMemo<RadiusCircle | null>(() => {
    if (mode !== 'rayon' || rayonOrigin.length === 0) return null;
    const o = rayonOrigin[0];
    return { lat: o.lat, lon: o.lon, radiusKm: rayonRadius };
  }, [mode, rayonOrigin, rayonRadius]);

  return (
    <div
      className="app"
      style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
    >
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

        {mode === 'itinerary' && (
          <div className="field">
            <label>Objectif</label>
            <select
              value={searchKind}
              onChange={(e) =>
                handleSearchKindChange(e.target.value as 'normal' | 'record')
              }
            >
              <option value="normal">Arrivée au plus tôt</option>
              <option value="record">Le plus absurde (record de connexions)</option>
            </select>
          </div>
        )}

        {mode !== 'heatmap' &&
          (range ? (
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
          ))}

        {mode !== 'rayon' &&
          mode !== 'challenges' &&
          mode !== 'heatmap' &&
          !(mode === 'itinerary' && tripKind === 'return') && (
            <TimeFilter
              value={timeFilter}
              onChange={setTimeFilter}
              showKind={mode !== 'itinerary'}
            />
          )}

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

        {mode === 'origin' && origin.length > 0 && (
          <button
            className="roulette"
            type="button"
            disabled={!visibleLegs || visibleLegs.length === 0}
            onClick={rollRoulette}
          >
            Surprends-moi 🎲
          </button>
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

        {mode === 'rayon' && (
          <StationMultiSelect
            label="Gare d'origine"
            stations={stations}
            value={rayonOrigin}
            onChange={(value) => setRayonOrigin(value.slice(-1))}
            placeholder="Rechercher une gare…"
            onGeolocate={() => handleGeolocate('rayon')}
            geolocating={geoTarget === 'rayon' && geo.state.loading}
          />
        )}

        {mode === 'rayon' && rayonOrigin.length > 0 && (
          <RadiusSlider
            label="Rayon"
            min={RAYON_MIN}
            max={RAYON_MAX}
            step={RAYON_STEP}
            value={rayonRadius}
            onChange={setRayonRadius}
          />
        )}

        {mode === 'challenges' && (
          <StationMultiSelect
            label="Gare de départ"
            stations={stations}
            value={origin}
            onChange={(value) => setOrigin(value.slice(-1))}
            placeholder="Rechercher une gare…"
            onGeolocate={() => handleGeolocate('origin')}
            geolocating={geoTarget === 'origin' && geo.state.loading}
          />
        )}

        {mode === 'challenges' && (
          <ChallengeList
            results={challengeResults}
            originSelected={origin.length > 0}
            loading={loading}
            itineraryComputing={challengeItineraryLoading}
            onSelect={handleSelect}
            onComputeItinerary={() => {
              void loadLongestItinerary();
            }}
          />
        )}

        {mode === 'heatmap' && (
          <StationMultiSelect
            label="Gares de départ (optionnel)"
            stations={stations}
            value={heatmapOrigin}
            onChange={setHeatmapOrigin}
            placeholder="Tout le réseau…"
          />
        )}

        {mode === 'heatmap' &&
          (heatmapEdges != null && heatmapDates.length > 0 ? (
            <HeatmapScrubber
              dates={heatmapDates}
              index={heatmapIndex}
              playing={heatmapPlaying}
              speed={heatmapSpeed}
              cumulative={heatmapCumulative}
              dateLabel={
                heatmapDates[heatmapIndex]
                  ? formatDayLabel(heatmapDates[heatmapIndex])
                  : ''
              }
              onPlayToggle={() => setHeatmapPlaying((p) => !p)}
              onIndexChange={(i) => {
                setHeatmapPlaying(false);
                setHeatmapIndex(i);
              }}
              onSpeedChange={setHeatmapSpeed}
              onCumulativeChange={setHeatmapCumulative}
            />
          ) : (
            <div className="hint">Chargement du réseau…</div>
          ))}

        {mode === 'heatmap' && heatmapEdges != null && heatmapDates.length > 0 && (
          <div className="legend">
            <span>
              <span className="swatch" style={{ background: AVAILABLE }} />
              peu de départs
            </span>
            <span>
              <span className="swatch" style={{ background: INTERMEDIATE }} />
            </span>
            <span>
              <span className="swatch" style={{ background: FIXED }} />
              beaucoup de départs
            </span>
            <span>{heatmapCumulative ? 'cumulatif' : 'jour par jour'}</span>
          </div>
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
            <ItineraryControls
              value={constraints}
              onChange={setConstraints}
              record={searchKind === 'record'}
            />
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
            {tripKind === 'return' && (
              <>
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
                <TimeFilter
                  value={directionTab === 'return' ? returnTimeFilter : timeFilter}
                  onChange={
                    directionTab === 'return' ? setReturnTimeFilter : setTimeFilter
                  }
                  showKind={false}
                />
              </>
            )}
            {activeItineraries.length > 0 && (
              <>
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
                    <option value="connections:desc">Correspondances (max)</option>
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
              recordMode={searchKind === 'record'}
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
            <button
              type="button"
              className="secondary"
              disabled={!currentPostcard}
              onClick={() => setPostcardOpen(true)}
            >
              Générer une carte postale
            </button>
          </>
        )}

        {mode === 'rayon' && rayonOrigin.length > 0 && rayonLegs != null && (
          <RayonList
            destinations={visibleRayonDestinations}
            onSelect={handleSelect}
          />
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

        {mode === 'origin' && roulettePick != null && rouletteLegs != null && (
          <div className="roulette-result">
            Direction : <strong>{rouletteLegs[0]?.destination ?? roulettePick}</strong> —{' '}
            {rouletteLegs.length} départ{rouletteLegs.length > 1 ? 's' : ''} dispo
          </div>
        )}
      </aside>

      <div
        className="resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner le panneau"
        onPointerDown={handleResizeStart}
        onPointerMove={handleResizeMove}
        onPointerUp={handleResizeEnd}
        onPointerCancel={handleResizeEnd}
        onDoubleClick={handleResizeReset}
      />

      <div className="map-wrap">
        <StationMap
          points={mapPoints}
          lines={mapLines}
          focus={focus}
          focusZoom={10}
          focusDuration={1.2}
          fit
          dark={theme === 'dark'}
          resizeToken={resizeToken}
          radiusCircle={radiusCircle}
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

      {postcardOpen && (
        <PostcardModal
          itinerary={currentPostcard}
          theme={theme}
          onClose={() => setPostcardOpen(false)}
        />
      )}
    </div>
  );
}
