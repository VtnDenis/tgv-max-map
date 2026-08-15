#!/usr/bin/env node
// Build src/data/frequentation.json: map each SNCF UIC code to its 2024
// passenger count, from the "frequentation-gares" Opendatasoft dataset.
//
// No npm dependencies: uses the global `fetch` available in Node 18+.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const OUT_PATH = join(REPO_ROOT, 'src', 'data', 'frequentation.json');

const FREQUENTATION_CSV =
  'https://data.sncf.com/api/explore/v2.1/catalog/datasets/frequentation-gares/exports/csv?select=code_uic_complet,total_voyageurs_2024';

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return res.text();
}

async function main() {
  const text = await fetchText(FREQUENTATION_CSV);
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = body.split(/\r?\n/);

  const frequentation = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const [uic, countRaw] = line.split(';');
    if (!uic || !countRaw) continue;
    const count = Number(countRaw);
    if (Number.isNaN(count)) continue;
    frequentation[uic] = count;
  }

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(frequentation, null, 2)}\n`, 'utf8');

  console.log(`wrote ${Object.keys(frequentation).length} entries to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
