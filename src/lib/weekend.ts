import type { DateRange } from '../types';

/** Départs considérés comme « en soirée » (vendredi/dimanche). */
export const WEEKEND_EVENING_MIN = 16 * 60;

/** Arrivée limite le samedi matin (midi). */
export const WEEKEND_ARRIVAL_NOON = 12 * 60;

export interface WeekendDates {
  friday: string;
  saturday: string;
  sunday: string;
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, days: number): string {
  const date = parseIso(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

function dayOfWeek(iso: string): number {
  return parseIso(iso).getUTCDay(); // 0 = dimanche, 5 = vendredi
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Prochain week-end complet (vendredi → dimanche) inclus dans la fenêtre de données. */
export function findNextWeekend(range: DateRange): WeekendDates | null {
  const today = todayIso();
  const add = (5 - dayOfWeek(today) + 7) % 7;
  const friday = addDays(today, add);
  const saturday = addDays(friday, 1);
  const sunday = addDays(friday, 2);
  if (friday > range.max || sunday > range.max) return null;
  return { friday, saturday, sunday };
}
