// Static (no-JS) values must equal the JS-rendered baseline, byte for byte.
const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(__dirname, '..', 'index.html');
const extract = () => ({
  selectedDate: document.getElementById('selected-date').textContent,
  selectedISO: document.getElementById('selected-date').getAttribute('datetime'),
  rate: document.getElementById('fx-rate').textContent,
  range: document.getElementById('fx-range').textContent,
  rangePct: document.getElementById('fx-range-pct').textContent,
  vol: document.getElementById('fx-vol').textContent,
  start: document.getElementById('fx-start').textContent,
  end: document.getElementById('fx-end').textContent,
  missRate: document.getElementById('miss-rate').textContent,
  nDays: document.getElementById('n-days').textContent,
  calib50: document.getElementById('calib50').textContent,
  summary: document.getElementById('fx-summary').textContent,
  caption: document.getElementById('forecast-caption').textContent,
  outcome: document.getElementById('fx-outcome').textContent,
  sliderMax: document.getElementById('forecast-date').getAttribute('max'),
  sliderValue: document.getElementById('forecast-date').value,
  valuetext: document.getElementById('forecast-date').getAttribute('aria-valuetext'),
  rows: [...document.querySelectorAll('#forecast-body tr')].map(tr => [...tr.cells].map(c => c.textContent).join('|')).join('\n'),
});
(async () => {
  const browser = await chromium.launch();
  const a = await browser.newContext({ javaScriptEnabled: false });
  const pa = await a.newPage(); await pa.goto(file);
  const staticValues = await pa.evaluate(extract);
  await a.close();
  const b = await browser.newContext({ reducedMotion: 'reduce' });
  const pb = await b.newPage();
  const errors = [];
  pb.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  pb.on('pageerror', e => errors.push(e.message));
  await pb.goto(file);
  await pb.locator('#forecast-data summary').click(); // forces the table to update
  await pb.waitForFunction(() => document.getElementById('financial-lab').classList.contains('chart-ready'));
  await pb.waitForTimeout(400);
  const liveValues = await pb.evaluate(extract);
  await b.close(); await browser.close();
  let ok = true;
  for (const k of Object.keys(staticValues)) {
    if (staticValues[k] !== liveValues[k]) { ok = false; console.log(`MISMATCH ${k}\n  static: ${JSON.stringify(staticValues[k]).slice(0, 300)}\n  live:   ${JSON.stringify(liveValues[k]).slice(0, 300)}`); }
  }
  console.log(ok ? 'PARITY OK: ' + Object.keys(staticValues).length + ' fields identical' : 'PARITY FAILED');
  console.log('console errors:', errors);
  console.log(JSON.stringify({ selectedDate: liveValues.selectedDate, rate: liveValues.rate, range: liveValues.range, rangePct: liveValues.rangePct, vol: liveValues.vol, missRate: liveValues.missRate, nDays: liveValues.nDays }));
  process.exit(ok && !errors.length ? 0 : 1);
})();
