#!/usr/bin/env node
// Build src/data/fares.json: the cheapest representative TGV INOUI fare range
// (min/max) for every directed origin->destination UIC pair in the SNCF
// "tarifs-tgv-inoui-ouigo" dataset. This lets the app estimate how much a
// trip would cost without a TGV MAX pass.
//
// No npm dependencies: uses the global `fetch` available in Node 18+.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_PATH = join(REPO_ROOT, 'src', 'data', 'fares.json');

const FARES_CSV =
  'https://data.sncf.com/api/explore/v2.1/catalog/datasets/tarifs-tgv-inoui-ouigo/exports/csv?select=gare_origine_code_uic,gare_destination_code_uic,classe,profil_tarifaire,prix_minimum,prix_maximum&where=transporteur%3D%22TGV%20INOUI%22';

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

async function main() {
  const text = await fetchText(FARES_CSV);
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r?\n/);

  // Pair key -> rows grouped by profil_tarifaire.
  const byPair = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const [orig, dest, classe, profil, minRaw, maxRaw] = line.split(';');
    if (classe !== '2') continue;
    if (!orig || !dest) continue;

    const min = Number.parseFloat(minRaw);
    const max = Number.parseFloat(maxRaw);
    if (Number.isNaN(min) || Number.isNaN(max)) continue;

    const key = `${orig}>${dest}`;
    let group = byPair.get(key);
    if (!group) {
      group = { normal: null, reglemente: [], autres: [] };
      byPair.set(key, group);
    }
    if (profil === 'Tarif Normal') group.normal = { min, max };
    else if (profil === 'Tarif Réglementé') group.reglemente.push({ min, max });
    else group.autres.push({ min, max });
  }

  const fares = {};
  for (const [key, group] of byPair) {
    let min;
    let max;
    if (group.normal) {
      min = group.normal.min;
      max = group.normal.max;
    } else if (group.reglemente.length > 0) {
      min = Math.min(...group.reglemente.map((r) => r.min));
      max = Math.max(...group.reglemente.map((r) => r.max));
    } else {
      const rows = group.autres;
      min = Math.min(...rows.map((r) => r.min));
      max = Math.max(...rows.map((r) => r.max));
    }
    fares[key] = { min, max };
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(fares, null, 2)}\n`, 'utf8');

  console.log(`fare pairs written: ${Object.keys(fares).length}`);
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
