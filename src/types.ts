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
}

/** A scheduled journey leg (origin -> destination) with times. */
export interface Leg {
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
}

/** A connected multi-leg itinerary. */
export interface Itinerary {
  legs: Edge[];
  departureTime: number; // minutes since midnight
  arrivalTime: number; // minutes since midnight
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
}

export type Mode = 'origin' | 'destination' | 'itinerary';
