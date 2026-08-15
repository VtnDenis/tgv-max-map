import type { MapPoint } from '../types';
import { CITY_BY_NAME } from '../data/cities';

export interface CityImage {
  src: string;
  href: string;
}

const SUMMARY_API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const WIKI_API = 'https://en.wikipedia.org/w/api.php';

const MAX_IMAGES = 3;
const THUMB_WIDTH = 500;

/** Keywords of non-photographic or railway-related files (maps, blasons, trains…). */
const BAD_KEYWORDS =
  /coat of arms|coat-of-arms|blason|armoiries|flag of|map of|logo|seal|emblem|crest|nadar|portrait|signature|autograph|diagram|chart|plan of|train|locomotive|railway|railroad|station|gare|sncf|tgv|rolling stock|platform/i;

const PHOTO_MIMES = new Set(['image/jpeg', 'image/webp']);

interface SummaryResponse {
  type?: string;
  title?: string;
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
}

interface ImageInfoPage {
  title?: string;
  imageinfo?: Array<{
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    width?: number;
    height?: number;
  }>;
}

function resolveCity(point: MapPoint): string | undefined {
  return CITY_BY_NAME[point.name];
}

/** SVG-derived images are maps/coats of arms, not photos. */
function isSvg(url: string): boolean {
  return /\.svg/i.test(url);
}

async function fetchSummary(city: string): Promise<SummaryResponse> {
  const url = `${SUMMARY_API}${encodeURIComponent(city)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Wikipedia summary ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SummaryResponse;
}

/** Landscape photos embedded in the city's Wikipedia article. */
async function fetchArticleImages(
  title: string,
  excludeSrc: string | undefined,
): Promise<CityImage[]> {
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    generator: 'images',
    gimlimit: '30',
    prop: 'imageinfo',
    iiprop: 'url|mime|size',
    iiurlwidth: String(THUMB_WIDTH),
    format: 'json',
    origin: '*',
  });
  const res = await fetch(`${WIKI_API}?${params.toString()}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { query?: { pages?: Record<string, ImageInfoPage> } };
  const pages = data.query?.pages;
  if (!pages) return [];

  const out: CityImage[] = [];
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl || info.thumburl === excludeSrc) continue;
    if (info.mime !== undefined && !PHOTO_MIMES.has(info.mime)) continue;
    if (BAD_KEYWORDS.test(page.title ?? '')) continue;
    const width = info.width ?? 0;
    const height = info.height ?? 0;
    if (height > 0 && width < height) continue; // skip portraits
    out.push({
      src: info.thumburl,
      href: info.descriptionurl ?? 'https://commons.wikimedia.org/',
    });
    if (out.length >= MAX_IMAGES - 1) break;
  }
  return out;
}

async function load(point: MapPoint): Promise<CityImage[]> {
  const city = resolveCity(point);
  if (!city) return [];

  const summary = await fetchSummary(city);
  const leadSource = summary.thumbnail?.source ?? summary.originalimage?.source;
  const lead = leadSource && !isSvg(leadSource) ? leadSource : undefined;
  const article = summary.content_urls?.desktop?.page;
  const title = summary.title ?? city;

  const images: CityImage[] = [];
  if (lead) {
    images.push({
      src: lead,
      href: article ?? 'https://commons.wikimedia.org/',
    });
  }

  const extras = await fetchArticleImages(title, lead);
  images.push(...extras);
  return images.slice(0, MAX_IMAGES);
}

const cache = new Map<string, Promise<CityImage[]>>();

/** Resolve city photos for a station, cached in memory (one request per station). */
export function getCityImages(point: MapPoint): Promise<CityImage[]> {
  const key = point.code;
  let pending = cache.get(key);
  if (!pending) {
    pending = load(point).catch(() => []);
    cache.set(key, pending);
  }
  return pending;
}
