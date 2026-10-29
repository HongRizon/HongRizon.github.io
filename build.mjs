// Build: regenerates the static figure, baseline table, metrics and labels from the
// dataset, then fills src/index.template.html → index.html.
// Run: node build.mjs [data/usdkrw.json | an older index.html carrying the dataset]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] || path.join(here, 'data', 'usdkrw.json');
const template = fs.readFileSync(path.join(here, 'src', 'index.template.html'), 'utf8');

// ---- data -------------------------------------------------------------------
const src = fs.readFileSync(source, 'utf8');
let dataJson;
if (source.endsWith('.json')) dataJson = src.trim();
else {
  const dataTag = src.match(/<script type="application\/json" id="usdkrw">([\s\S]*?)<\/script>/);
  if (!dataTag) throw new Error('No embedded dataset found in ' + source);
  dataJson = dataTag[1].trim();
}
const raw = JSON.parse(dataJson);
if (raw.encoding !== 'cents-delta36-v1') throw new Error('Unexpected encoding ' + raw.encoding);
if (JSON.stringify(raw) !== dataJson) dataJson = JSON.stringify(raw); // one canonical line
if (/<\/script/i.test(dataJson)) throw new Error('Dataset must not contain a closing script tag');
const dataTag = [`<script type="application/json" id="usdkrw">${dataJson}</script>`];

const delta = raw.deltaCents36.split(','), N = delta.length + 1, END = N - 1;
const price = new Float64Array(N), date = new Float64Array(N);
let cents = raw.firstCents; price[0] = cents / 100; date[0] = Date.parse(raw.start + 'T00:00:00Z');
for (let i = 1; i < N; i++) {
  cents += parseInt(delta[i - 1], 36); price[i] = cents / 100;
  date[i] = date[i - 1] + parseInt(raw.gaps[i - 1], 36) * 86400000;
}

// ---- model (identical to the page script) -----------------------------------
const WARM = 20, H = 20, L = .94, Z90 = 1.6448536, Z50 = .6744898, ANNUAL = Math.sqrt(252), HISTORY = 130;
const sigma = new Float64Array(N), miss = new Int8Array(N);
let variance = 0, count = 0, in90 = 0, in50 = 0;
for (let i = 1; i <= WARM; i++) variance += Math.log(price[i] / price[i - 1]) ** 2;
variance /= WARM;
for (let i = 0; i <= WARM; i++) sigma[i] = Math.sqrt(variance);
for (let i = WARM + 1; i < N; i++) {
  const r = Math.log(price[i] / price[i - 1]);
  variance = L * variance + (1 - L) * r * r; sigma[i] = Math.sqrt(variance);
  if (i < WARM + 2) continue;
  if (r > Z90 * sigma[i - 1]) miss[i] = 1; else if (r < -Z90 * sigma[i - 1]) miss[i] = -1;
  if (date[i] >= Date.UTC(2000, 0, 1)) { count++; if (!miss[i]) in90++; if (Math.abs(r) <= Z50 * sigma[i - 1]) in50++; }
}
const interval = (a, k, z = Z90) => { const w = z * sigma[a] * Math.sqrt(k); return [price[a] * Math.exp(-w), price[a] * Math.exp(w)]; };

const f2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const signed = x => (x < 0 ? '−' : '+') + f1.format(Math.abs(x * 100)) + '%';
const fmt = i => { const d = new Date(date[i]); return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const iso = i => new Date(date[i]).toISOString().slice(0, 10);
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const anchor = END, s = Math.max(WARM + 1, END - HISTORY);
const [lo, hi] = interval(anchor, H);

// ---- static figure (same geometry as the canvas; viewBox 1000×300, stretched) -----
let low = Infinity, high = -Infinity;
for (let i = s; i <= END; i++) { const [a, b] = interval(i, H); low = Math.min(low, a); high = Math.max(high, b); }
const pad = (high - low) * .055 || 1; low -= pad; high += pad;
const X = i => (i - s) / (END + H - s) * 1000, Y = p => (1 - (p - low) / (high - low)) * 300;
const r2 = v => Math.round(v * 100) / 100;
const niceStep = v => { const mag = 10 ** Math.floor(Math.log10(v)), x = v / mag; return (x < 1.5 ? 1 : x < 3.5 ? 2 : x < 7.5 ? 5 : 10) * mag; };
const step = niceStep((high - low) / 5);
const svg = [], yLabels = [], xLabels = [];
const line = (d, attrs) => svg.push(`<path d="${d}" ${attrs} vector-effect="non-scaling-stroke"/>`);
for (let v = Math.ceil(low / step) * step; v < high; v += step) {
  line(`M0 ${r2(Y(v))}H1000`, 'fill="none" stroke="var(--line)"');
  yLabels.push(`<span class="static-y" style="top:${r2(Y(v) / 3)}%">${f0.format(v)}</span>`);
}
const pa = price[anchor], sa = sigma[anchor];
function band(z, color, opacity) {
  const pts = [`M${r2(X(anchor))} ${r2(Y(pa))}`];
  for (let k = 1; k <= H * 4; k++) pts.push(`L${r2(X(anchor + k / 4))} ${r2(Y(pa * Math.exp(z * sa * Math.sqrt(k / 4))))}`);
  pts.push(`L${r2(X(anchor + H))} ${r2(Y(pa))}Z`);
  svg.push(`<path d="${pts.join('')}" fill="var(--${color})" style="opacity:var(--${opacity})"/>`);
}
band(Z90, 'up', 'band-a'); band(Z50, 'up', 'band-b'); band(-Z90, 'down', 'band-a'); band(-Z50, 'down', 'band-b');
{
  const pts = [`M${r2(X(s))} ${r2(Y(price[s]))}`];
  for (let i = s + 1; i <= anchor; i++) pts.push(`L${r2(X(i))} ${r2(Y(price[i]))}`);
  line(pts.join(''), 'fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round"');
}
for (const dir of [1, -1]) {
  const d = [];
  for (let i = s + 1; i <= END; i++) if (miss[i] === dir) d.push(`M${r2(X(i))} ${r2(Y(price[i]))}l0 0`);
  if (!d.length) continue;
  line(d.join(''), `stroke="var(--${dir > 0 ? 'up' : 'down'})" stroke-width="8.5" stroke-linecap="round"`);
  line(d.join(''), 'stroke="var(--paper)" stroke-width="5.5" stroke-linecap="round"');
}
line(`M${r2(X(anchor))} 0V300`, 'stroke="var(--strong)" stroke-dasharray="2 4"');
line(`M${r2(X(anchor))} ${r2(Y(pa))}H1000`, 'stroke="var(--strong)"');
line(`M${r2(X(anchor))} ${r2(Y(pa))}l0 0`, 'stroke="var(--paper)" stroke-width="11" stroke-linecap="round"');
line(`M${r2(X(anchor))} ${r2(Y(pa))}l0 0`, 'stroke="var(--ink)" stroke-width="8" stroke-linecap="round"');
{
  let lastMonth = -1, lastX = -100;
  for (let i = s; i <= END; i++) {
    const d = new Date(date[i]), m = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (lastMonth === m) continue;
    const initial = lastMonth === -1; lastMonth = m;
    if (initial) continue;
    const x = X(i) / 10, label = d.getUTCMonth() ? MONTH[d.getUTCMonth()] : String(d.getUTCFullYear());
    if (x - lastX < 6 || x > 95.8) continue;
    lastX = x;
    xLabels.push(`<span class="static-x" style="left:${r2(x)}%">${label}</span>`);
  }
}
const staticSvg = `<svg viewBox="0 0 1000 300" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${svg.join('')}</svg>${yLabels.join('')}${xLabels.join('')}`;

// ---- baseline table -----------------------------------------------------------
const rows = [];
for (let k = 1; k <= H; k++) {
  const r = interval(anchor, k), q = interval(anchor, k, Z50);
  rows.push(`<tr><th scope="row">+${k}</th><td>${f2.format(r[0])}</td><td>${f2.format(q[0])}</td><td>${f2.format(q[1])}</td><td>${f2.format(r[1])}</td><td>${anchor + k <= END ? f2.format(price[anchor + k]) : 'Not observed'}</td></tr>`);
}

// ---- text ---------------------------------------------------------------------
const outcome = 'Latest stored observation. The next 20 observations are not in this snapshot.';
const summary = `Visible observations run from ${fmt(s)} to ${fmt(END)}, moving from ${f2.format(price[s])} to ${f2.format(price[END])} KRW per USD. Forecast origin: ${fmt(anchor)} at ${f2.format(price[anchor])}. The pointwise 20-step 90% interval is ${f2.format(lo)} to ${f2.format(hi)}. ${outcome}`;
const values = {
  DATA: dataTag[0],
  STATIC_SVG: staticSvg,
  TABLE_ROWS: rows.join(''),
  LAST_ISO: iso(END),
  LAST_OBS: fmt(END),
  START: fmt(s),
  RATE: f2.format(price[anchor]),
  RANGE: `${f0.format(lo)}–${f0.format(hi)}`,
  RANGE_PCT: `${signed(lo / pa - 1)} to ${signed(hi / pa - 1)}`,
  VOL: f1.format(sa * ANNUAL * 100) + '%',
  SLIDER_MAX: String(END - s),
  VALUETEXT: esc(`${fmt(anchor)}, ${f2.format(pa)} KRW per USD. 20-step 90 percent interval ${f2.format(lo)} to ${f2.format(hi)}.`),
  MISS_RATE: ((1 - in90 / count) * 100).toFixed(1) + '%',
  N_DAYS: f0.format(count),
  CALIB50: `The 50% interval contained ${(100 * in50 / count).toFixed(1)}% of the evaluated observations. These are descriptive coverage rates, not a guarantee of future calibration.`,
  SUMMARY: summary,
  CAPTION: `Forecast from ${fmt(anchor)}. Units: KRW per USD. Each interval applies separately at its step.`,
};

let out = template;
for (const [k, v] of Object.entries(values)) out = out.split(`{{${k}}}`).join(v);
const left = out.match(/{{[A-Z_]+}}/g);
if (left) throw new Error('Unfilled placeholders: ' + left.join(', '));
fs.writeFileSync(path.join(here, 'index.html'), out);
console.log(`index.html written: ${out.length} bytes, ${N} observations, latest ${iso(END)}, window ${s}..${END}`);
