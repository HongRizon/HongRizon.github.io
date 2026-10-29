// Fetch the latest USD/KRW observations (Federal Reserve H.10 noon buying rates),
// validate them, and write data/usdkrw.csv + data/usdkrw.json in the page's
// lossless "cents-delta36-v1" encoding. Refuses to shrink or rewrite history.
//
//   node tools/fetch-data.mjs            # fetch and update data/
//   node tools/fetch-data.mjs --dry-run  # fetch and report only
//
// Primary source: the datasets/exchange-rates mirror of H.10 on GitHub.
// Fallback: FRED series DEXKOUS (the same H.10 series, published by the St. Louis Fed).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
const START = process.env.FX_START || '1999-01-04';
const dryRun = process.argv.includes('--dry-run');
const SOURCES = [
  { name: 'Federal Reserve H.10 via github.com/datasets/exchange-rates',
    url: 'https://raw.githubusercontent.com/datasets/exchange-rates/main/data/daily.csv',
    parse: text => text.split(/\r?\n/).filter(l => l.includes(',South Korea,')).map(l => { const c = l.split(',').map(s => s.trim()); return [c[0], c[2]]; }) },
  { name: 'Federal Reserve H.10 via FRED series DEXKOUS',
    url: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXKOUS',
    parse: text => text.split(/\r?\n/).slice(1).map(l => l.split(',').map(s => s.trim())).filter(c => c.length >= 2).map(c => [c[0], c[1]]) },
];

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'hongrizon.github.io data refresh' }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function clean(rows) {
  const out = [];
  let last = '';
  for (const [date, value] of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < START) continue;
    if (!/^\d+(\.\d+)?$/.test(value)) continue; // holidays are published as empty or "."
    const cents = Math.round(parseFloat(value) * 100);
    if (!Number.isSafeInteger(cents) || cents < 50000 || cents > 300000) throw new Error(`Implausible value ${value} on ${date}`);
    if (date <= last) throw new Error(`Dates not strictly increasing at ${date}`);
    last = date;
    out.push([date, cents]);
  }
  return out;
}

function encode(obs, source) {
  const day = d => Date.parse(d + 'T00:00:00Z') / 86400000;
  const gaps = [], deltas = [];
  for (let i = 1; i < obs.length; i++) {
    const g = day(obs[i][0]) - day(obs[i - 1][0]);
    if (!Number.isInteger(g) || g < 1 || g > 35) throw new Error(`Gap of ${g} days before ${obs[i][0]} cannot be encoded`);
    gaps.push(g.toString(36));
    deltas.push((obs[i][1] - obs[i - 1][1]).toString(36));
  }
  return { encoding: 'cents-delta36-v1', source, start: obs[0][0], gaps: gaps.join(''), firstCents: obs[0][1], deltaCents36: deltas.join(',') };
}

function decode(raw) {
  const delta = raw.deltaCents36.split(',');
  const out = []; let cents = raw.firstCents, t = Date.parse(raw.start + 'T00:00:00Z');
  out.push([raw.start, cents]);
  for (let i = 0; i < delta.length; i++) { cents += parseInt(delta[i], 36); t += parseInt(raw.gaps[i], 36) * 86400000; out.push([new Date(t).toISOString().slice(0, 10), cents]); }
  return out;
}

let obs = null, used = null, errors = [];
for (const s of SOURCES) {
  try {
    const rows = clean(s.parse(await fetchText(s.url)));
    if (rows.length < 6000) throw new Error(`Only ${rows.length} rows`);
    obs = rows; used = s; break;
  } catch (e) { errors.push(`${s.name}: ${e.message}`); }
}
if (!obs) { console.error('No source succeeded:\n  ' + errors.join('\n  ')); process.exit(2); }

const jsonPath = path.join(dataDir, 'usdkrw.json'), csvPath = path.join(dataDir, 'usdkrw.csv');
let previous = null;
if (fs.existsSync(jsonPath)) previous = decode(JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
if (previous) {
  const lastPrev = previous[previous.length - 1], lastNew = obs[obs.length - 1];
  if (lastNew[0] < lastPrev[0]) { console.error(`Refusing to go backwards: have ${lastPrev[0]}, fetched ${lastNew[0]}`); process.exit(3); }
  let changed = 0;
  for (let i = 0; i < previous.length; i++) if (!obs[i] || obs[i][0] !== previous[i][0] || obs[i][1] !== previous[i][1]) changed++;
  if (changed) { console.error(`Refusing to rewrite ${changed} historical observations (source revised?). Review manually.`); process.exit(4); }
  if (lastNew[0] === lastPrev[0] && obs.length === previous.length) { console.log(`No new observations (through ${lastPrev[0]}).`); process.exit(0); }
}
const encoded = encode(obs, used.name);
if (JSON.stringify(decode(encoded)) !== JSON.stringify(obs)) throw new Error('Round-trip check failed');
const summary = `${obs.length} observations, ${obs[0][0]} to ${obs[obs.length - 1][0]}, ${previous ? obs.length - previous.length : obs.length} new, source: ${used.name}`;
if (dryRun) { console.log('Dry run: ' + summary); process.exit(0); }
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(csvPath, 'date,krw_per_usd\n' + obs.map(([d, c]) => `${d},${(c / 100).toFixed(2)}`).join('\n') + '\n');
fs.writeFileSync(jsonPath, JSON.stringify(encoded) + '\n');
console.log('Updated data/: ' + summary);
