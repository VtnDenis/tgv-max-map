#!/usr/bin/env node
// Build src/data/stations.json: map each distinct TGV MAX station code to
// lat/lon by (1) name-matching against the SNCF "liste-des-gares" dataset and
// (2) falling back to a hardcoded manual table for stations that cannot be
// matched by name (foreign stations, airport/TGV-only stations, etc.).
//
// No npm dependencies: uses the global `fetch` available in Node 18+.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_PATH = join(REPO_ROOT, 'src', 'data', 'stations.json');

const TGVMAX_API =
  'https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records';
const GARES_CSV =
  'https://data.sncf.com/api/explore/v2.1/catalog/datasets/liste-des-gares/exports/csv?select=libelle,x_wgs84,y_wgs84,code_uic&where=voyageurs%3D%22O%22';

// ---------------------------------------------------------------------------
// Manual fallback: code -> [lat, lon].
// Only used when a station cannot be uniquely name-matched against the gares
// list. Foreign stations use city-centroid coordinates; French stations use
// their real station coordinates.
// ---------------------------------------------------------------------------
const MANUAL = {
  FRMLW: [49.0038, 2.5708], // AEROPORT ROISSY CDG 2 TGV
  FRAFJ: [43.9227, 2.1376], // ALBI VILLE
  FRACL: [47.4649, -0.5570], // ANGERS SAINT LAUD
  FRANG: [45.6537, 0.1652], // ANGOULEME
  FRXAC: [44.6587, -1.1655], // ARCACHON
  DEAGB: [48.3655, 10.8861], // AUGSBURG HBF
  DEZCC: [48.7906, 8.1905], // BADEN BADEN
  ESBST: [41.3795, 2.1398], // BARCELONA SANTS
  CHAJP: [47.5474, 7.5895], // BASEL SBB
  FRXBF: [46.1114, 5.8239], // BELLEGARDE SUR VALSERINE GARE
  FRFAC: [44.6346, -0.935], // BIGANOS FACTURE
  FRUTM: [45.843, -1.133], // BOURCEFRANC LE CHAPUS
  FRQBM: [45.618, 6.7715], // BOURG SAINT MAURICE
  BEBMI: [50.836, 4.336], // BRUXELLES MIDI
  FRFTA: [44.163, 1.538], // CAUSSADE (TARN ET GARONNE)
  FRHTZ: [46.06, 6.58], // CLUSES (HAUTE SAVOIE)
  FRKGD: [48.76, 5.59], // COMMERCY ZONE DU SEUGNON
  FRACE: [47.096, 5.489], // DOLE VILLE
  FRDOB: [45.9, -1.27], // DOLUS D'OLERON
  DEEAA: [48.739, 9.304], // ESSLINGEN(NECKAR)
  ESFIR: [42.265, 2.943], // FIGUERES VILAFANT
  DEFRH: [50.106, 8.663], // FRANKFURT AM MAIN HBF
  DEFGB: [47.997, 7.842], // FREIBURG (BREISGAU) HBF
  FRSHZ: [48.85, 5.44], // FRESNES AU MONT
  CHGVA: [46.21, 6.142], // GENEVE CORNAVIN
  ESGRO: [41.978, 2.816], // GIRONA
  DEKLT: [49.436, 7.768], // KAISERSLAUTERN HBF
  DEQKA: [48.993, 8.401], // KARLSRUHE HBF
  FRFQG: [42.588, 1.801], // L'HOSPITALET PRES L'AND.
  FRLFN: [45.1, -1.15], // LA NOUE
  FRFCJ: [44.634, -1.145], // LA TESTE
  FRLCO: [44.867, -1.179], // LACANAU OCEAN
  DEANL: [48.339, 7.84], // LAHR SCHWARZW
  FRGBG: [44.968, 2.192], // LAROQUEBROU BATIMENT VOYAGEURS
  CHAJF: [46.517, 6.629], // LAUSANNE
  FRPFJ: [48.793, 5.544], // LEROUVILLE CENTRE
  FRPOR: [46.25, -1.5], // LES PORTES EN RE
  FRLLE: [50.636, 3.063], // LILLE (intramuros)
  FRUTL: [46.23, -1.43], // LOIX
  FREAM: [48.947, 6.17], // LORRAINE TGV
  LULUX: [49.6, 6.134], // LUXEMBOURG
  FRLPE: [45.76, 4.86], // LYON (intramuros)
  FRJDQ: [45.721, 5.076], // LYON ST EXUPERY TGV.
  DEMHG: [49.479, 8.469], // MANNHEIM HBF
  FRUTN: [45.823, -1.107], // MARENNES
  FRMLV: [48.87, 2.783], // MARNE LA VALLEE CHESSY
  FRHMY: [45.25, 3.2], // MASSIAC BLESLE
  ITMPG: [45.485, 9.187], // MILANO PORTA GARIBALDI
  FRXMK: [44.559, 4.744], // MONTELIMAR GARE SNCF
  FRMPL: [43.604, 3.88], // MONTPELLIER SAINT ROCH
  DEBEG: [48.14, 11.558], // MUNCHEN HBF
  FRENC: [48.69, 6.174], // NANCY
  FRFNI: [43.832, 4.366], // NIMES CENTRE
  FRHQN: [46.23, 5.66], // NURIEUX GARE
  DEZPA: [48.476, 7.946], // OFFENBURG
  ITOCS: [44.949, 6.806], // OUX CESANA CLAV SESTRIERE
  FRPST: [48.853, 2.348], // PARIS (intramuros)
  FRPFH: [48.96, 5.33], // PIERREFITTE SUR AIRE
  FRXPV: [42.519, 3.109], // PORT VENDRES VILLE
  FRCVU: [50.407, 1.593], // RANG DU FLIERS VERTON BERCK
  DERSH: [48.249, 7.78], // RINGSHEIM EUROPA PARK
  FRRPJ: [46.16, -1.28], // RIVEDOUX PLAGE
  DESBK: [49.241, 6.99], // SAARBRUECKEN/SARREBRUCK
  FRHOJ: [45.36, 6.3], // SAINT AVRE LA CHAMBRE
  FRINB: [44.804, 3.276], // SAINT CHELY D'APCHER
  FRHHD: [45.438, 4.398], // SAINT ETIENNE CHATEAUCREUX
  FRINM: [44.066, 3.02], // SAINT GEORGES DE LUZENCON
  FRSGF: [46.2, 3.43], // SAINT GERMAIN DES FOSSES
  FRPFI: [48.889, 5.54], // SAINT MIHIEL
  FRSHY: [48.889, 5.54], // SAINT MIHIEL DETENTION
  FRXSJ: [49.84, 3.297], // SAINT QUENTIN
  FRINN: [44.01, 2.97], // SAINT ROME DE CERNON
  FRSIA: [48.83, 5.67], // SAMPIGNY CENTRE
  FRLPZ: [49.03, 5.28], // SOUILLY
  FRXTD: [48.284, 6.95], // ST DIE
  FRHPN: [45.2, 6.37], // ST JEAN DE MAURIENNE ARVAN
  FREJC: [46.41, -0.21], // ST MAIXENT (DEUX SEVRES)
  FRSME: [46.2, -1.36], // ST MARTIN DE RE
  FRPOE: [45.94, -1.31], // ST PIERRE D'OLERON
  FRSMR: [46.15, -1.31], // STE MARIE DE RE
  FRAEG: [48.585, 7.735], // STRASBOURG
  DESGT: [48.784, 9.182], // STUTTGART HBF
  ITTRS: [45.073, 7.666], // TORINO PORTA SUSA
  DEQUL: [48.399, 9.982], // ULM HBF
  DEQLI: [48.933, 8.958], // VAIHINGEN (ENZ)
  FRVLA: [44.989, 4.978], // VALENCE TGV AUVERGNE RHONE ALPES
  FRVAF: [44.928, 4.893], // VALENCE VILLE
  CHAGL: [46.713, 6.377], // VALLORBE
  FRXVZ: [47.222, 2.068], // VIERZON
  CHAJD: [47.378, 8.541], // ZURICH HB

  // The "XXX (intramuros)" label is shared by several distinct IATA codes in
  // the tgvmax dataset; give each of them the city's intramuros coordinates.
  FRADJ: [50.636, 3.063], // LILLE (intramuros)
  FRLPD: [45.76, 4.86], // LYON (intramuros)
  FRPAZ: [48.853, 2.348], // PARIS (intramuros)
  FRPBE: [48.853, 2.348], // PARIS (intramuros)
  FRPLY: [48.853, 2.348], // PARIS (intramuros)
  FRPMO: [48.853, 2.348], // PARIS (intramuros)
  FRPNO: [48.853, 2.348], // PARIS (intramuros)
};

// Explicit fixes for names that cannot be recovered by generic sanitization.
// The tgvmax dataset contains the corrupted name "ANGOULA\u008aME".
const NAME_FIXES = { ANGOULAME: 'ANGOULEME' };

// Remaining non-ASCII letters that survive accent stripping -> ASCII.
const TRANSLITERATE = [
  [/\u00df/g, 'SS'],
  [/\u0152/g, 'OE'],
  [/\u0153/g, 'OE'],
  [/\u00c6/g, 'AE'],
  [/\u00e6/g, 'AE'],
  [/\u00d8/g, 'O'],
  [/\u00f8/g, 'O'],
  [/\u00d0/g, 'D'],
  [/\u00f0/g, 'D'],
  [/\u00de/g, 'TH'],
  [/\u00fe/g, 'TH'],
  [/\u0141/g, 'L'],
  [/\u0142/g, 'L'],
];

const SUFFIX_TOKEN = /(TGV|VILLE|GARE|SNCF)/;

/**
 * Normalize a station name for comparison. Applied identically to the tgvmax
 * names and the gares `libelle`.
 *   1. uppercase
 *   2. strip accents (NFD, drop combining marks)
 *   3. "SAINT" -> "ST"
 *   4. drop trailing standalone "TGV" / "VILLE" / "GARE" / "SNCF" tokens
 *      (repeated, to handle e.g. "MONTELIMAR GARE SNCF"). Trailing punctuation
 *      after the token is tolerated. Tokens are only stripped at word level,
 *      so "ALBERTVILLE"/"LUNEVILLE" are left intact.
 *   5. remove spaces, "-", "'", ".", "(", ")", "/"
 *   6. transliterate remaining non-ASCII letters, drop any leftover control /
 *      non-ASCII chars
 *   7. apply explicit fixes (e.g. "ANGOULAME" -> "ANGOULEME")
 */
function normalize(name) {
  let s = String(name).toUpperCase();
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/SAINT/g, 'ST');

  let previous;
  do {
    previous = s;
    s = s.replace(/(?:^|[\s\-'.()/]+)(TGV|VILLE|GARE|SNCF)(?=$|[\s\-'.()/]+$)/, '');
  } while (s !== previous);

  s = s.replace(/[\s\-'.()/]/g, '');

  for (const [pattern, replacement] of TRANSLITERATE) {
    s = s.replace(pattern, replacement);
  }
  s = s.replace(/[^\x20-\x7e]/g, '');

  return NAME_FIXES[s] ?? s;
}

/** Display name: the tgvmax `origine` with control / corrupted bytes removed. */
function cleanDisplayName(name) {
  return String(name).replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

/**
 * Fetch the distinct (origine, origine_iata) pairs from the tgvmax dataset.
 * The API caps `total_count` to whatever `limit` is set to, so the true count
 * is read from a single unbounded request and pagination is defensive.
 */
async function fetchDistinctStations() {
  const params = 'select=origine,origine_iata&group_by=origine,origine_iata';
  const first = await fetchJson(`${TGVMAX_API}?${params}`);
  const totalCount = first.total_count;
  const rows = [...(first.results ?? [])];

  const LIMIT = 100;
  let offset = LIMIT;
  while (rows.length < totalCount) {
    const data = await fetchJson(
      `${TGVMAX_API}?${params}&limit=${LIMIT}&offset=${offset}`,
    );
    const page = data.results ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    offset += LIMIT;
  }

  return { rows, totalCount };
}

/** Fetch and parse the gares list (CSV, ';' delimiter, BOM + CRLF). */
async function fetchGares() {
  const text = await fetchText(GARES_CSV);
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r?\n/);
  const gares = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const [libelle, x, y, codeUic] = line.split(';');
    gares.push({
      libelle,
      lon: Number.parseFloat(x),
      lat: Number.parseFloat(y),
      codeUic,
    });
  }
  return gares;
}

/**
 * Collapse duplicate rows in the gares list. The dataset lists some stations
 * several times (same `libelle`, same UIC code, near-identical coordinates).
 * Group by UIC code and average coordinates: same station -> one entry, while
 * genuine homonyms (e.g. two different "Cernay") keep their own UIC codes and
 * stay distinct.
 */
function dedupeGares(gares) {
  const byUic = new Map();
  for (const g of gares) {
    if (!byUic.has(g.codeUic)) byUic.set(g.codeUic, []);
    byUic.get(g.codeUic).push(g);
  }
  const out = [];
  for (const group of byUic.values()) {
    out.push({
      libelle: group[0].libelle,
      lat: group.reduce((sum, g) => sum + g.lat, 0) / group.length,
      lon: group.reduce((sum, g) => sum + g.lon, 0) / group.length,
    });
  }
  return out;
}

/**
 * Resolve a set of candidate gares that all share the same normalized name.
 * Returns a single gare, or null if the candidates represent genuinely
 * different stations that cannot be told apart by suffix alone.
 */
function resolveAmbiguous(tgvName, candidates) {
  const first = candidates[0];
  const samePlace = candidates.every(
    (c) => Math.abs(c.lat - first.lat) < 0.01 && Math.abs(c.lon - first.lon) < 0.01,
  );
  if (samePlace) return first;

  const upper = tgvName.toUpperCase();
  if (/TGV/.test(upper)) {
    const tgv = candidates.filter((c) => /TGV/i.test(c.libelle));
    if (tgv.length === 1) return tgv[0];
  }
  if (/(?:^|[^A-Z])VILLE(?:$|[^A-Z])/.test(upper)) {
    const ville = candidates.filter((c) => /VILLE/i.test(c.libelle));
    if (ville.length === 1) return ville[0];
    const nonTgv = candidates.filter((c) => !/TGV/i.test(c.libelle));
    if (nonTgv.length === 1) return nonTgv[0];
  }
  return null;
}

async function main() {
  const { rows, totalCount } = await fetchDistinctStations();
  console.log(`tgvmax: ${totalCount} distinct (origine, origine_iata) rows`);

  const gares = await fetchGares();
  console.log(`gares: ${gares.length} rows fetched`);

  const uniqueGares = dedupeGares(gares);
  const garesByNorm = new Map();
  for (const g of uniqueGares) {
    const key = normalize(g.libelle);
    if (!garesByNorm.has(key)) garesByNorm.set(key, []);
    garesByNorm.get(key).push(g);
  }

  // Group tgvmax rows by IATA code (FRANG appears twice: a corrupted spelling
  // "ANGOULA\u008aME" and a clean "ANGOULEME").
  const rowsByCode = new Map();
  for (const row of rows) {
    if (!rowsByCode.has(row.origine_iata)) rowsByCode.set(row.origine_iata, []);
    rowsByCode.get(row.origine_iata).push(row.origine);
  }

  const stations = {};
  let viaGares = 0;
  let viaManual = 0;
  const manualCodes = [];
  const ambiguousResolved = [];

  for (const code of [...rowsByCode.keys()].sort()) {
    const names = rowsByCode.get(code);
    const displayName = cleanDisplayName(
      names.find((n) => /^[\x20-\x7e]*$/.test(n)) ?? names[0],
    );
    const normalized = normalize(displayName);

    const candidates = garesByNorm.get(normalized) ?? [];
    let resolved = null;
    if (candidates.length === 1) {
      resolved = candidates[0];
    } else if (candidates.length > 1) {
      resolved = resolveAmbiguous(displayName, candidates);
      if (resolved) ambiguousResolved.push(code);
    }

    if (resolved) {
      stations[code] = { name: displayName, lat: resolved.lat, lon: resolved.lon };
      viaGares += 1;
    } else if (MANUAL[code]) {
      stations[code] = {
        name: displayName,
        lat: MANUAL[code][0],
        lon: MANUAL[code][1],
      };
      viaManual += 1;
      manualCodes.push(code);
    }
  }

  // Verification: every distinct code must have an entry with plausible coords.
  const codes = [...rowsByCode.keys()];
  const missing = codes.filter((code) => !(code in stations));
  if (missing.length > 0) {
    console.error(`ERROR: missing coordinates for ${missing.length} codes:`);
    for (const code of missing) {
      console.error(`  ${code} ${rowsByCode.get(code).join(' / ')}`);
    }
    process.exit(1);
  }

  for (const [code, s] of Object.entries(stations)) {
    if (
      !Number.isFinite(s.lat) ||
      !Number.isFinite(s.lon) ||
      s.lat < 40 ||
      s.lat > 53 ||
      s.lon < -8 ||
      s.lon > 15
    ) {
      console.error(
        `ERROR: implausible coordinates for ${code}: ${JSON.stringify(s)}`,
      );
      process.exit(1);
    }
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(stations, null, 2)}\n`, 'utf8');

  console.log(`distinct codes: ${codes.length}`);
  console.log(`matched via gares: ${viaGares}`);
  console.log(`matched via manual: ${viaManual}`);
  console.log(`total: ${Object.keys(stations).length}`);
  if (ambiguousResolved.length > 0) {
    console.log(
      `ambiguous (resolved by TGV/VILLE suffix): ${ambiguousResolved.join(', ')}`,
    );
  }
  if (rowsByCode.get('FRANG')?.length > 1) {
    console.log(
      `note: FRANG appears twice (corrupted "ANGOULA<0x8A>ME" + "ANGOULEME"), merged into one entry`,
    );
  }
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
