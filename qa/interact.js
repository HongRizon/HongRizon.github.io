const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(__dirname, '..', 'index.html');
const out = path.resolve(__dirname, 'out');
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
const sel = p => p.evaluate(() => document.getElementById('selected-date').textContent);
const hoverText = p => p.evaluate(() => ({ t: document.getElementById('fx-hover').textContent, live: document.getElementById('fx-hover').classList.contains('is-live') }));

(async () => {
  const browser = await chromium.launch();
  // ---------- desktop, reduced motion (deterministic) ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(file);
    await page.locator('#plot').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getElementById('financial-lab').classList.contains('chart-ready'));
    await page.waitForTimeout(300);
    const plot = await page.locator('#plot').boundingBox();
    const y = plot.y + plot.height / 2;
    const LATEST = await page.evaluate(() => document.getElementById('last-obs').textContent);
    const LATEST_ISO = await page.evaluate(() => document.getElementById('last-obs').getAttribute('datetime'));
    const N = JSON.parse(require('fs').readFileSync(path.resolve(__dirname, '..', 'data', 'usdkrw.json'), 'utf8')).gaps.length + 1;
    // hover on observations
    await page.mouse.move(plot.x + plot.width * 0.4, y); await page.waitForTimeout(120);
    const h1 = await hoverText(page);
    check('hover readout on observed region', h1.live && /\d{2} \w{3} 2026: [\d,]+\.\d{2}, [−+]\d+\.\d%/.test(h1.t), h1.t);
    // hover on the fan (right of the origin)
    await page.mouse.move(plot.x + plot.width * 0.93, y); await page.waitForTimeout(120);
    const h2 = await hoverText(page);
    check('hover readout on forecast steps', h2.live && /^\+\d+: 90% [\d,]+\.\d{2}–[\d,]+\.\d{2}, 50% /.test(h2.t), h2.t);
    await page.screenshot({ path: path.join(out, 'hover-fan.png'), clip: { x: 0, y: plot.y - 60, width: 1280, height: plot.height + 120 } });
    await page.mouse.move(plot.x + plot.width * 0.4, y); await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(out, 'hover-obs.png'), clip: { x: 0, y: plot.y - 60, width: 1280, height: plot.height + 120 } });
    // leave
    await page.mouse.move(plot.x + plot.width / 2, plot.y - 120); await page.waitForTimeout(120);
    const h3 = await hoverText(page);
    check('hover cleared on leave', !h3.live && h3.t === '20-step forecast horizon', h3.t);
    // click selects origin
    const d0 = await sel(page);
    await page.mouse.click(plot.x + plot.width * 0.3, y); await page.waitForTimeout(150);
    const d1 = await sel(page);
    check('click selects an origin', d1 !== d0, `${d0} → ${d1}`);
    const dashedOutcome = await page.evaluate(() => document.getElementById('fx-outcome').textContent);
    check('outcome describes the 20-step result', /After 20 observations: [\d,]+\.\d{2} KRW per USD, (inside|above|below)/.test(dashedOutcome), dashedOutcome);
    await page.screenshot({ path: path.join(out, 'selected-origin.png'), clip: { x: 0, y: plot.y - 420, width: 1280, height: plot.height + 760 } });
    // drag
    await page.mouse.move(plot.x + plot.width * 0.5, y); await page.mouse.down();
    await page.mouse.move(plot.x + plot.width * 0.7, y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(150);
    const d2 = await sel(page);
    check('drag scrubs the origin', d2 !== d1, `${d1} → ${d2}`);
    // Latest button
    const latestEnabled = await page.evaluate(() => !document.getElementById('fx-latest').disabled);
    check('Latest enabled after moving', latestEnabled);
    await page.click('#fx-latest'); await page.waitForTimeout(150);
    check('Latest returns to the last observation', (await sel(page)) === LATEST);
    // keyboard on slider
    await page.focus('#forecast-date');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const k1 = await page.evaluate(() => ({ d: document.getElementById('selected-date').textContent, v: document.getElementById('forecast-date').value, vt: document.getElementById('forecast-date').getAttribute('aria-valuetext') }));
    check('ArrowLeft ×5 moves five observations', k1.v === '125' && k1.d !== LATEST, `${k1.d}, value=${k1.v}`);
    check('aria-valuetext follows the selection', k1.vt.startsWith(k1.d), k1.vt);
    await page.keyboard.press('PageDown'); await page.waitForTimeout(150);
    const k2 = await page.evaluate(() => document.getElementById('forecast-date').value);
    check('PageDown moves 20 observations', k2 === '105', `value=${k2}`);
    await page.keyboard.press('Home'); await page.waitForTimeout(150);
    const k3 = await page.evaluate(() => ({ v: document.getElementById('forecast-date').value, d: document.getElementById('selected-date').textContent, s: document.getElementById('fx-start').textContent }));
    check('Home selects the first visible observation', k3.v === '0' && k3.d === k3.s, `${k3.d}`);
    await page.keyboard.press('End'); await page.waitForTimeout(150);
    check('End selects the latest', (await sel(page)) === LATEST);
    await page.screenshot({ path: path.join(out, 'focus-slider.png'), clip: { x: 0, y: (await page.locator('.range-row').boundingBox()).y - 10, width: 1280, height: 70 } });
    // window radios
    await page.check('input[name="window"][value="260"]'); await page.waitForTimeout(200);
    const w = await page.evaluate(() => ({ max: document.getElementById('forecast-date').max, start: document.getElementById('fx-start').textContent }));
    check('Window 260 widens the view', w.max === '260' && w.start !== '23 Mar 2026', `max=${w.max}, start=${w.start}`);
    await page.check('input[name="window"][value="65"]'); await page.waitForTimeout(200);
    const w2 = await page.evaluate(() => document.getElementById('forecast-date').max);
    check('Window 65 narrows the view', w2 === '65', `max=${w2}`);
    await page.screenshot({ path: path.join(out, 'window-65.png'), clip: { x: 0, y: plot.y - 60, width: 1280, height: plot.height + 120 } });
    // prev/next buttons
    await page.click('#fx-prev'); await page.waitForTimeout(120);
    const p1 = await page.evaluate(() => document.getElementById('forecast-date').value);
    await page.click('#fx-next'); await page.waitForTimeout(120);
    const p2 = await page.evaluate(() => document.getElementById('forecast-date').value);
    check('Previous/Next step one observation', p1 === '64' && p2 === '65', `${p1} → ${p2}`);
    // details + table update
    await page.click('#forecast-data summary'); await page.waitForTimeout(100);
    await page.click('#fx-prev'); await page.waitForTimeout(150);
    const tbl = await page.evaluate(() => ({ cap: document.getElementById('forecast-caption').textContent, cells: document.querySelector('#forecast-body tr').cells.length, last: document.querySelector('#forecast-body tr').cells[5].textContent }));
    const prevDate = await sel(page);
    check('table has 6 columns and tracks the origin', tbl.cells === 6 && tbl.cap.startsWith('Forecast from ' + prevDate) && prevDate !== LATEST && /^[\d,]+\.\d{2}$/.test(tbl.last), `${tbl.cap} | observed(+1)=${tbl.last}`);
    const prevISO = await page.evaluate(() => document.getElementById('selected-date').getAttribute('datetime'));
    // CSV downloads
    const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('#download-forecast')]);
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#download-data')]);
    const fs = require('fs');
    const csv1 = fs.readFileSync(await dl1.path(), 'utf8').split('\n');
    const csv2 = fs.readFileSync(await dl2.path(), 'utf8');
    check('forecast CSV has 50% and 90% columns', dl1.suggestedFilename() === `usdkrw-forecast-${prevISO}.csv` && csv1[0].includes('lower_50,upper_50,lower_90,upper_90') && csv1.length === 21, `${dl1.suggestedFilename()} ${csv1.length - 1} rows`);
    check('observations CSV is complete', dl2.suggestedFilename() === 'usdkrw-observations.csv' && csv2.trim().split('\n').length === N + 1, `${csv2.trim().split('\n').length - 1} rows (expected ${N})`);
    // theme radios
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.check('input[name="theme"][value="dark"]'); await page.waitForTimeout(250);
    const th = await page.evaluate(() => ({ ds: document.documentElement.dataset.theme, ls: localStorage.getItem('sbh-theme'), bg: getComputedStyle(document.body).backgroundColor, meta: document.querySelector('meta[name="theme-color"]').content }));
    check('Dark theme applies and persists', th.ds === 'dark' && th.ls === 'dark' && th.bg === 'rgb(20, 26, 32)' && th.meta === '#141a20', JSON.stringify(th));
    await page.locator('#plot').scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
    const px = await page.evaluate(() => { const c = document.getElementById('plot-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let lightInk = 0, lightModeInk = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 200) { const s = d[i] + d[i + 1] + d[i + 2]; if (s > 690) lightInk++; else if (d[i] === 31 && d[i + 1] === 41 && d[i + 2] === 51) lightModeInk++; } } return { lightInk, lightModeInk }; });
    check('canvas recolors for dark theme (ink #e8edf0, no #1f2933 left)', px.lightInk > 500 && px.lightModeInk === 0, JSON.stringify(px));
    await page.check('input[name="theme"][value="system"]'); await page.waitForTimeout(150);
    const th2 = await page.evaluate(() => ({ ds: document.documentElement.dataset.theme, ls: localStorage.getItem('sbh-theme') }));
    check('System restores the default', th2.ds === undefined && th2.ls === 'system', JSON.stringify(th2));
    // cross-tab storage sync (simulated)
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'sbh-theme', newValue: 'light' })));
    await page.waitForTimeout(100);
    const th3 = await page.evaluate(() => ({ ds: document.documentElement.dataset.theme, checked: document.querySelector('input[name="theme"]:checked').value }));
    check('storage event syncs theme across tabs', th3.ds === 'light' && th3.checked === 'light', JSON.stringify(th3));
    await page.check('input[name="theme"][value="system"]');
    // copy
    await page.locator('#copy-email').scrollIntoViewIfNeeded();
    await page.click('#copy-email'); await page.waitForTimeout(150);
    const cp = await page.evaluate(() => ({ toast: document.getElementById('toast').textContent, hidden: document.getElementById('toast').hidden, label: document.querySelector('#copy-email span').textContent }));
    check('copy shows toast and relabels the button', !cp.hidden && cp.toast === 'Email address copied.' && cp.label === 'Copied', JSON.stringify(cp));
    await page.waitForTimeout(2200);
    const cp2 = await page.evaluate(() => document.querySelector('#copy-email span').textContent);
    check('copy label returns to Copy', cp2 === 'Copy');
    await page.keyboard.press('Escape');
    check('Escape hides the toast', await page.evaluate(() => document.getElementById('toast').hidden));
    // nav current
    await page.locator('#papers').scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
    const cur = await page.evaluate(() => (document.querySelector('.nav-links a[aria-current]') || {}).hash);
    check('nav marks the current section', cur === '#papers' || cur === '#research', `current=${cur}`);
    // focus ring on nav
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(out, 'focus-nav.png'), clip: { x: 0, y: 0, width: 1280, height: 80 } });
    // skip link (fresh load: the sequential focus start point must be the document start)
    await page.goto(file); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
    const skipVisible = await page.evaluate(() => { const s = document.querySelector('.skip'); return document.activeElement === s && getComputedStyle(s).transform === 'none'; });
    check('skip link appears on first Tab', skipVisible);
    await page.keyboard.press('Enter'); await page.waitForTimeout(100);
    check('skip link moves focus to main', await page.evaluate(() => document.activeElement && document.activeElement.id === 'main'));
    check('no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // ---------- reveal animation ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    const page = await ctx.newPage();
    await page.goto(file);
    await page.locator('#plot').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getElementById('financial-lab').classList.contains('chart-ready'));
    await page.waitForTimeout(350);
    const LATEST2 = await page.evaluate(() => document.getElementById('last-obs').textContent);
    const mid = await sel(page);
    await page.waitForTimeout(1600);
    const end = await sel(page);
    check('reveal walks the origin forward then rests on the latest', mid !== LATEST2 && end === LATEST2, `mid=${mid}, end=${end}`);
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    const page2 = await ctx2.newPage();
    await page2.goto(file);
    await page2.locator('#plot').scrollIntoViewIfNeeded();
    await page2.waitForFunction(() => document.getElementById('financial-lab').classList.contains('chart-ready'));
    await page2.waitForTimeout(300);
    await page2.focus('#forecast-date'); await page2.keyboard.press('ArrowLeft'); await page2.waitForTimeout(100);
    const afterKey = await sel(page2); await page2.waitForTimeout(1500);
    const later = await sel(page2);
    check('user input cancels the reveal', afterKey === later, `${afterKey} stays ${later}`);
    await ctx2.close();
    const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const page3 = await ctx3.newPage();
    await page3.goto(file);
    await page3.locator('#plot').scrollIntoViewIfNeeded();
    await page3.waitForFunction(() => document.getElementById('financial-lab').classList.contains('chart-ready'));
    await page3.waitForTimeout(350);
    check('reduced motion: no reveal', (await sel(page3)) === (await page3.evaluate(() => document.getElementById('last-obs').textContent)));
    await ctx3.close();
  }
  // ---------- touch ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(file);
    await page.locator('#plot').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getElementById('financial-lab').classList.contains('chart-ready'));
    await page.waitForTimeout(300);
    const plot = await page.locator('#plot').boundingBox();
    const before = await sel(page);
    await page.touchscreen.tap(plot.x + plot.width * 0.3, plot.y + plot.height / 2); await page.waitForTimeout(200);
    const after = await sel(page);
    check('touch tap selects an origin', after !== before, `${before} → ${after}`);
    const hv = await hoverText(page);
    check('touch leaves no hover readout', !hv.live, hv.t);
    await page.screenshot({ path: path.join(out, 'touch-selected.png'), fullPage: false });
    await ctx.close();
  }
  await browser.close();
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
