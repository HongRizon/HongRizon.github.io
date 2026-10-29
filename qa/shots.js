const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const file = 'file://' + path.resolve(__dirname, '..', 'index.html');
const out = path.resolve(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
const { PNG } = (() => { try { return require('pngjs'); } catch { return {}; } })();

(async () => {
  const browser = await chromium.launch();
  const widths = [320, 360, 390, 600, 820, 1024, 1280, 1440, 1920];
  const summary = [];
  for (const w of widths) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      page.on('pageerror', e => errs.push(e.message));
      await page.goto(file);
      await page.locator('#plot').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.getElementById('financial-lab').classList.contains('chart-ready'));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, h: document.documentElement.scrollHeight }));
      summary.push(`${w}px ${scheme}: scrollWidth=${m.sw} (overflow ${m.sw > m.iw ? 'YES' : 'no'}), height=${m.h}, errors=${errs.length}`);
      if ((w === 1440 || w === 390 || w === 820 || w === 320) ) {
        await page.screenshot({ path: path.join(out, `full-${w}-${scheme}.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
  // forced colors
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: 'active', reducedMotion: 'reduce' });
    const page = await ctx.newPage(); await page.goto(file);
    await page.locator('#plot').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getElementById('financial-lab').classList.contains('chart-ready'));
    await page.waitForTimeout(300);
    await page.locator('#work').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, 'forced-colors.png'), fullPage: false });
    await ctx.close();
  }
  // no JS
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
    const page = await ctx.newPage(); await page.goto(file);
    const box = await page.locator('#financial-lab').boundingBox();
    await page.screenshot({ path: path.join(out, 'nojs-figure.png'), fullPage: true, clip: { x: 0, y: box.y - 60, width: 1280, height: 1000 } });
    await page.screenshot({ path: path.join(out, 'nojs-top.png'), fullPage: false });
    await ctx.close();
  }
  console.log(summary.join('\n'));
  await browser.close();
})();
