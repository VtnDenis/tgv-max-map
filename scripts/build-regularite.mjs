#!/usr/bin/env node
// Build src/data/regularite.json: for each INOUI axis, take the most recent
// month's `regularite_composite` and `ponctualite_origine` from the SNCF
// "regularite-mensuelle-tgv-axes" dataset.
//
// No npm dependencies: uses the global `fetch` available in Node 18+.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_PATH = join(REPO_ROOT, 'src', 'data', 'regularite.json');

const REGULARITE_CSV =
  'https://data.sncf.com/api/explore/v2.1/catalog/datasets/regularite-mensuelle-tgv-axes/exports/csv?select=date,axe,regularite_composite,ponctualite_origine';

const INOUI_AXES = ['Atlantique', 'Est', 'Europe', 'Nord', 'Sud-Est'];

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

async function main() {
  const text = await fetchText(REGULARITE_CSV);
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r?\n/);

  const latest = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const [date, axe, regularite, ponctualite] = line.split(';');
    if (!INOUI_AXES.includes(axe)) continue;
    if (!latest[axe] || date > latest[axe].date) {
      latest[axe] = { date, regularite, ponctualite };
    }
  }

  const regularite = {};
  for (const axe of INOUI_AXES) {
    const row = latest[axe];
    regularite[axe] = {
      regularite: Math.round(Number.parseFloat(row.regularite) * 10) / 10,
      ponctualite: Math.round(Number.parseFloat(row.ponctualite) * 10) / 10,
    };
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(regularite, null, 2)}\n`, 'utf8');

  const months = INOUI_AXES.map((axe) => latest[axe].date);
  console.log(`latest month: ${months.sort().pop()}`);
  for (const axe of INOUI_AXES) {
    console.log(
      `${axe}: regularite=${regularite[axe].regularite} ponctualite=${regularite[axe].ponctualite}`,
    );
  }
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
