import type { Itinerary } from '../types';
import { formatDuration } from './itinerary';
import { getStation } from './geo';

export type PostcardTheme = 'light' | 'dark';

export interface PostcardOptions {
  itinerary: Itinerary;
  theme: PostcardTheme;
}

interface Palette {
  bg: string;
  panel: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
}

const FIXED = '#e3000f';
const INTERMEDIATE = '#b26a00';

const PALETTES: Record<PostcardTheme, Palette> = {
  light: {
    bg: '#f4f5f7',
    panel: '#ffffff',
    text: '#1c2733',
    muted: '#6b7684',
    accent: '#e3000f',
    border: '#d8dde4',
  },
  dark: {
    bg: '#12161c',
    panel: '#1c232c',
    text: '#e6ebf0',
    muted: '#9aa7b4',
    accent: '#ff4d5e',
    border: '#2f3a47',
  },
};

const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

const W = 1080;
const H = 1350;
const CARD_X = 40;
const CARD_Y = 40;
const CARD_W = 1000;
const CARD_H = 1270;

const PAD = 48;
const LEFT = CARD_X + PAD;
const RIGHT = CARD_X + CARD_W - PAD;
const CENTER_X = CARD_X + CARD_W / 2;

const SCALE = 2;

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

function resolveName(code: string, fallback: string): string {
  return getStation(code)?.name ?? fallback;
}

function orderedStations(it: Itinerary): string[] {
  const names: string[] = [];
  for (const leg of it.legs) names.push(resolveName(leg.from, leg.fromName));
  const last = it.legs[it.legs.length - 1];
  if (last) names.push(resolveName(last.to, last.toName));
  return names;
}

export function drawPostcard(
  ctx: CanvasRenderingContext2D,
  options: PostcardOptions,
): void {
  const { itinerary, theme } = options;
  const legs = itinerary.legs;
  if (legs.length === 0) return;

  const p = PALETTES[theme];
  const stations = orderedStations(itinerary);
  const n = stations.length;
  const legCount = legs.length;

  ctx.save();
  ctx.textBaseline = 'middle';

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  roundedRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 28);
  ctx.fillStyle = p.panel;
  ctx.fill();

  ctx.fillStyle = p.accent;
  roundedRect(ctx, CARD_X, CARD_Y, CARD_W, 8, 8);
  ctx.fill();

  const headerY = CARD_Y + PAD + 24;

  ctx.beginPath();
  ctx.arc(LEFT + 16, headerY, 16, 0, Math.PI * 2);
  ctx.fillStyle = FIXED;
  ctx.fill();

  ctx.font = `700 52px ${FONT}`;
  ctx.fillStyle = p.text;
  ctx.textAlign = 'left';
  ctx.fillText('TGV MAX', LEFT + 48, headerY);

  ctx.font = `400 25px ${FONT}`;
  ctx.fillStyle = p.muted;
  ctx.fillText('Carte postale', LEFT + 48, headerY + 48);

  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT, CARD_Y + PAD + 108);
  ctx.lineTo(RIGHT, CARD_Y + PAD + 108);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `700 56px ${FONT}`;
  ctx.fillStyle = p.text;
  ctx.fillText(truncate(ctx, stations[0], RIGHT - LEFT), CENTER_X, 260);

  ctx.font = `400 34px ${FONT}`;
  ctx.fillStyle = p.accent;
  ctx.fillText('→', CENTER_X, 322);

  ctx.font = `700 56px ${FONT}`;
  ctx.fillStyle = p.text;
  ctx.fillText(truncate(ctx, stations[n - 1], RIGHT - LEFT), CENTER_X, 384);

  const date = formatDate(itinerary.date ?? legs[0].date ?? '');
  if (date) {
    ctx.font = `400 26px ${FONT}`;
    ctx.fillStyle = p.muted;
    ctx.fillText(date, CENTER_X, 434);
  }

  ctx.strokeStyle = p.border;
  ctx.beginPath();
  ctx.moveTo(LEFT, 476);
  ctx.lineTo(RIGHT, 476);
  ctx.stroke();

  const xLine = 210;
  const routeTop = 520;
  const routeMax = 940;
  const slot = n > 1 ? (routeMax - routeTop) / (n - 1) : 0;
  const nameSize = n >= 6 ? 28 : 34;
  const nameX = xLine + 40;
  const nameMaxWidth = RIGHT - nameX;
  const ys = stations.map((_, i) => routeTop + i * slot);

  ctx.strokeStyle = INTERMEDIATE;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(xLine, ys[0]);
  ctx.lineTo(xLine, ys[n - 1]);
  ctx.stroke();

  ctx.font = `600 ${nameSize}px ${FONT}`;
  for (let i = 0; i < n; i++) {
    const isEnd = i === 0 || i === n - 1;
    const radius = isEnd ? 13 : 9;

    ctx.beginPath();
    ctx.arc(xLine, ys[i], radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = p.panel;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(xLine, ys[i], radius, 0, Math.PI * 2);
    ctx.fillStyle = isEnd ? FIXED : INTERMEDIATE;
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = p.text;
    ctx.fillText(truncate(ctx, stations[i], nameMaxWidth), nameX, ys[i]);

    ctx.textAlign = 'right';
    if (i === 0) {
      ctx.font = `600 26px ${FONT}`;
      ctx.fillStyle = p.text;
      ctx.fillText(formatTime(legs[0].dep), xLine - 34, ys[i]);
    } else if (i === n - 1) {
      const lastLeg = legs[legCount - 1];
      const overnight = lastLeg.arr < lastLeg.dep;
      ctx.font = `600 26px ${FONT}`;
      ctx.fillStyle = p.text;
      ctx.fillText(
        formatTime(lastLeg.arr) + (overnight ? ' +1' : ''),
        xLine - 34,
        ys[i],
      );
    } else {
      ctx.font = `400 20px ${FONT}`;
      ctx.fillStyle = p.muted;
      ctx.fillText(formatTime(legs[i - 1].arr), xLine - 34, ys[i]);
    }
  }

  const rowH = legCount <= 3 ? 54 : legCount <= 5 ? 46 : 38;
  const segStart = routeMax + 48;

  ctx.strokeStyle = p.border;
  ctx.beginPath();
  ctx.moveTo(LEFT, routeMax + 24);
  ctx.lineTo(RIGHT, routeMax + 24);
  ctx.stroke();

  for (let j = 0; j < legCount; j++) {
    const leg = legs[j];
    const yRow = segStart + j * rowH;
    const overnight = leg.arr < leg.dep;

    ctx.textAlign = 'left';
    ctx.font = `600 26px ${FONT}`;
    ctx.fillStyle = p.text;
    ctx.fillText(
      `${formatTime(leg.dep)} → ${formatTime(leg.arr)}${overnight ? ' +1' : ''}`,
      LEFT,
      yRow,
    );

    ctx.textAlign = 'right';
    ctx.font = `400 24px ${FONT}`;
    ctx.fillStyle = p.muted;
    ctx.fillText(
      `train ${leg.trainNo} · ${formatDuration(leg.arr - leg.dep)}`,
      RIGHT,
      yRow,
    );
  }

  const segEnd = segStart + legCount * rowH;
  const footerTop = segEnd + 44;
  const connections = legCount - 1;
  const connectionLabel =
    connections === 0
      ? 'direct'
      : `${connections} correspondance${connections > 1 ? 's' : ''}`;

  ctx.strokeStyle = p.border;
  ctx.beginPath();
  ctx.moveTo(LEFT, segEnd + 20);
  ctx.lineTo(RIGHT, segEnd + 20);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillStyle = p.text;
  ctx.fillText(
    `${formatDuration(itinerary.arrivalTime - itinerary.departureTime)} · ${connectionLabel}`,
    CENTER_X,
    footerTop,
  );

  ctx.font = `400 22px ${FONT}`;
  ctx.fillStyle = p.muted;
  ctx.fillText('Généré avec TGV MAX Map', CENTER_X, footerTop + 34);

  ctx.restore();
}

function drawToCanvas(options: PostcardOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(SCALE, SCALE);
    drawPostcard(ctx, options);
  }
  return canvas;
}

export function renderPostcardDataUrl(options: PostcardOptions): string {
  return drawToCanvas(options).toDataURL('image/png');
}

export function postcardBlob(options: PostcardOptions): Promise<Blob | null> {
  return new Promise((resolve) => {
    drawToCanvas(options).toBlob((blob) => resolve(blob), 'image/png');
  });
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function postcardFileName(it: Itinerary): string {
  const first = it.legs[0];
  const last = it.legs[it.legs.length - 1];
  const orig = resolveName(first.from, first.fromName);
  const dest = resolveName(last.to, last.toName);
  const date = (it.date ?? first.date ?? '').replace(/-/g, '');
  return `tgv-max-${[slug(orig), slug(dest), date].filter(Boolean).join('-')}.png`;
}

export interface WeekendPostcard {
  destination: string;
  friday: string;
  sunday: string;
  outbound: Itinerary;
  inbound: Itinerary;
}

interface WeekendLeg {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  dep: number;
  arr: number;
  trainNo: string;
}

function drawWeekendLeg(
  ctx: CanvasRenderingContext2D,
  p: Palette,
  label: string,
  leg: WeekendLeg,
  top: number,
): number {
  ctx.textAlign = 'left';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = p.accent;
  ctx.fillText(label.toUpperCase(), LEFT, top);

  const route = `${resolveName(leg.from, leg.fromName)} → ${resolveName(leg.to, leg.toName)}`;
  ctx.font = `600 38px ${FONT}`;
  ctx.fillStyle = p.text;
  ctx.fillText(truncate(ctx, route, RIGHT - LEFT), LEFT, top + 44);

  ctx.font = `400 28px ${FONT}`;
  ctx.fillStyle = p.text;
  ctx.fillText(`${formatTime(leg.dep)} → ${formatTime(leg.arr)}`, LEFT, top + 92);

  ctx.textAlign = 'right';
  ctx.font = `400 26px ${FONT}`;
  ctx.fillStyle = p.muted;
  ctx.fillText(
    `train ${leg.trainNo} · ${formatDuration(leg.arr - leg.dep)}`,
    RIGHT,
    top + 92,
  );

  return top + 92 + 20;
}

export function drawWeekendPostcard(
  ctx: CanvasRenderingContext2D,
  options: { weekend: WeekendPostcard; theme: PostcardTheme },
): void {
  const { weekend, theme } = options;
  const out = weekend.outbound.legs[0];
  const inb = weekend.inbound.legs[0];
  if (!out || !inb) return;

  const p = PALETTES[theme];

  ctx.save();
  ctx.textBaseline = 'middle';

  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, W, H);

  roundedRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 28);
  ctx.fillStyle = p.panel;
  ctx.fill();

  ctx.fillStyle = p.accent;
  roundedRect(ctx, CARD_X, CARD_Y, CARD_W, 8, 8);
  ctx.fill();

  const headerY = CARD_Y + PAD + 24;
  ctx.beginPath();
  ctx.arc(LEFT + 16, headerY, 16, 0, Math.PI * 2);
  ctx.fillStyle = FIXED;
  ctx.fill();

  ctx.font = `700 52px ${FONT}`;
  ctx.fillStyle = p.text;
  ctx.textAlign = 'left';
  ctx.fillText('TGV MAX', LEFT + 48, headerY);

  ctx.font = `400 25px ${FONT}`;
  ctx.fillStyle = p.muted;
  ctx.fillText('Carte postale week-end', LEFT + 48, headerY + 48);

  ctx.strokeStyle = p.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT, CARD_Y + PAD + 108);
  ctx.lineTo(RIGHT, CARD_Y + PAD + 108);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `700 64px ${FONT}`;
  ctx.fillStyle = p.text;
  ctx.fillText(truncate(ctx, weekend.destination, RIGHT - LEFT), CENTER_X, 260);

  ctx.font = `400 28px ${FONT}`;
  ctx.fillStyle = p.muted;
  ctx.fillText(
    `${formatDate(weekend.friday)} → ${formatDate(weekend.sunday)}`,
    CENTER_X,
    322,
  );

  let y = 410;
  y = drawWeekendLeg(ctx, p, 'Aller', out, y);
  y += 40;
  y = drawWeekendLeg(ctx, p, 'Retour', inb, y);

  ctx.textAlign = 'center';
  ctx.font = `400 22px ${FONT}`;
  ctx.fillStyle = p.muted;
  ctx.fillText('Généré avec TGV MAX Map', CENTER_X, H - 60);

  ctx.restore();
}

function drawWeekendToCanvas(options: {
  weekend: WeekendPostcard;
  theme: PostcardTheme;
}): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(SCALE, SCALE);
    drawWeekendPostcard(ctx, options);
  }
  return canvas;
}

export function renderWeekendPostcardDataUrl(options: {
  weekend: WeekendPostcard;
  theme: PostcardTheme;
}): string {
  return drawWeekendToCanvas(options).toDataURL('image/png');
}

export function weekendPostcardBlob(options: {
  weekend: WeekendPostcard;
  theme: PostcardTheme;
}): Promise<Blob | null> {
  return new Promise((resolve) => {
    drawWeekendToCanvas(options).toBlob((blob) => resolve(blob), 'image/png');
  });
}

export function weekendPostcardFileName(weekend: WeekendPostcard): string {
  const date = weekend.friday.replace(/-/g, '');
  return `tgv-max-weekend-${[slug(weekend.destination), date].filter(Boolean).join('-')}.png`;
}
