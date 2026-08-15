import { useEffect, useMemo, useRef } from 'react';
import type { Itinerary, Leg, Mode } from '../types';
import { getStation, haversineKm } from '../lib/geo';
import { toMinutes } from '../lib/itinerary';
import type { FireIntensity } from './useConfetti';

const LONG_DISTANCE_KM = 800;

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

function distanceKm(fromCode: string, toCode: string): number {
  const from = getStation(fromCode);
  const to = getStation(toCode);
  if (!from || !to) return 0;
  return haversineKm(from.lat, from.lon, to.lat, to.lon);
}

interface CelebrationOptions {
  mode: Mode;
  legs: Leg[] | null;
  itineraries: Itinerary[] | null;
  fire: (intensity?: FireIntensity) => boolean;
}

/**
 * Celebrate same-day direct trains with a single confetti burst per distinct
 * set of results, with a boosted burst for long-distance destinations.
 */
export function useSameDayCelebration({
  mode,
  legs,
  itineraries,
  fire,
}: CelebrationOptions): void {
  const lastSignatureRef = useRef<string>('');

  const { signature, intensity } = useMemo(() => {
    const now = nowMinutes();
    const entries: string[] = [];
    let distant = false;

    if (mode === 'itinerary') {
      for (const it of itineraries ?? []) {
        if (it.legs.length !== 1) continue;
        if (!it.date || !isToday(it.date)) continue;
        if (it.departureTime < now) continue;
        const leg = it.legs[0];
        entries.push(`${it.date}|${leg.from}|${leg.to}|${leg.dep}`);
        if (distanceKm(leg.from, leg.to) > LONG_DISTANCE_KM) distant = true;
      }
    } else if (legs) {
      for (const leg of legs) {
        if (!leg.date || !isToday(leg.date)) continue;
        const dep = toMinutes(leg.heure_depart);
        if (dep < now) continue;
        entries.push(`${leg.date}|${leg.origine_iata}|${leg.destination_iata}|${dep}`);
        if (distanceKm(leg.origine_iata, leg.destination_iata) > LONG_DISTANCE_KM) {
          distant = true;
        }
      }
    }

    entries.sort();
    const signature = entries.join('#');
    const intensity: FireIntensity = distant ? 'high' : 'normal';
    return { signature, intensity };
  }, [mode, legs, itineraries]);

  useEffect(() => {
    if (signature === '') {
      lastSignatureRef.current = '';
      return;
    }
    if (lastSignatureRef.current === signature) return;
    lastSignatureRef.current = signature;
    fire(intensity);
    return () => {
      lastSignatureRef.current = '';
    };
  }, [signature, intensity, fire]);
}
