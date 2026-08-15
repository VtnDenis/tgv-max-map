// Shared domain types for the TGV MAX map app.
// All modules import from here to keep a single source of truth.

/** Raw record shape returned by the Opendatasoft Explore API. */
export interface ApiRecord {
  date: string;
  train_no: string;
  entity: string;
  axe: string;
  origine_iata: string;
  destination_iata: string;
  origine: string;
  destination: string;
  heure_depart: string;
  heure_arrivee: string;
  od_happy_card: string;
}

/** A single geocoded station (grouped by display name). */
export interface Station {
  /** Canonical IATA-ish code (representative of the group). */
  code: string;
  /** All IATA-ish codes sharing this display name (>= 1). */
  codes: string[];
  /** Human readable name, e.g. "PERPIGNAN" or "PARIS (intramuros)". */
  name: string;
  lat: number;
  lon: number;
  /** SNCF UIC code, present for stations matched via the gares list. */
  uic?: string;
  /** Multiple UIC codes, present for "(intramuros)" city aggregates. */
  uics?: string[];
}

/** A scheduled journey leg (origin -> destination) with times. */
export interface Leg {
  date?: string; // "YYYY-MM-DD"
  origine: string;
  origine_iata: string;
  destination: string;
  destination_iata: string;
  heure_depart: string; // "HH:MM"
  heure_arrivee: string; // "HH:MM"
  train_no?: string;
}

/** Normalized edge used by the itinerary graph. */
export interface Edge {
  from: string; // iata code
  to: string; // iata code
  fromName: string;
  toName: string;
  dep: number; // minutes since midnight
  arr: number; // minutes since midnight
  trainNo: string;
  date?: string; // "YYYY-MM-DD"
}

/** A connected multi-leg itinerary. */
export interface Itinerary {
  legs: Edge[];
  departureTime: number; // minutes since midnight
  arrivalTime: number; // minutes since midnight
  date?: string; // "YYYY-MM-DD"
}

/** Date range covered by the dataset (30-day rolling window). */
export interface DateRange {
  min: string; // "YYYY-MM-DD"
  max: string; // "YYYY-MM-DD"
}

/** A point to render on the map. */
export interface MapPoint {
  code: string;
  name: string;
  lat: number;
  lon: number;
  color?: string; // CSS color for the marker
  popup?: string; // HTML content for the Leaflet popup
  count?: number; // number of departures (drives marker size)
  opacity?: number; // fill opacity override (heat intensity)
  intensity?: number; // 0..1 heat intensity (drives color/size)
}

export type Mode =
  | 'origin'
  | 'destination'
  | 'itinerary'
  | 'rayon'
  | 'challenges'
  | 'heatmap';

/** A distinct origin→destination pair with its aggregated trip count. */
export interface HeatmapLink {
  from: string;
  to: string;
  count: number;
}

/** Aggregated availability for a single day of the heatmap. */
export interface DayAggregate {
  origins: Map<string, number>;
  destinations: Map<string, number>;
  links: Map<string, HeatmapLink>;
}

/** A circle overlay drawn around an origin station (radius map mode). */
export interface RadiusCircle {
  lat: number;
  lon: number;
  radiusKm: number;
}

/** A decorative concentric isochrone ring (time-halo map mode). */
export interface HaloCircle {
  lat: number;
  lon: number;
  radiusKm: number;
  color: string;
}

/** A generated weekend trip: direct outbound (Friday) + direct inbound (Sunday). */
export interface WeekendProgram {
  friday: string;
  sunday: string;
  destination: Station;
  outbound: Edge;
  inbound: Edge;
}

/** Identifier of a predefined challenge in the treasure-hunt mode. */
export type ChallengeKind =
  | 'far-direct'
  | 'longest-under-3h'
  | 'most-departures'
  | 'earliest-departure'
  | 'most-days'
  | 'longest-itinerary';

/** Lifecycle state of a challenge card in the sidebar. */
export type ChallengeStatus = 'pending' | 'solved' | 'empty';

/** The computed answer to a single challenge. */
export interface ChallengeResult {
  kind: ChallengeKind;
  title: string;
  description: string;
  status: ChallengeStatus;
  /** Winning station (pinnable on the map), null when unsolved/unavailable. */
  winner: Station | null;
  winnerCode?: string;
  /** Numeric value shown in the answer (km, minutes, departures, days...). */
  metric?: number;
  /** Human-readable label describing the winning metric. */
  detail?: string;
  /** Direct legs justifying the answer (for popup content). */
  legs?: Leg[];
  /** Last edge of the winning itinerary (longest-itinerary challenge). */
  edge?: Edge;
  /** Full winning itinerary (longest-itinerary challenge). */
  itinerary?: Itinerary;
}
