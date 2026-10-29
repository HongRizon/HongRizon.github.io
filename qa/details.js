const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(__dirname, '..', 'index.html');
const out = path.resolve(__dirname, 'out');
(async () => {
  const browser = await chromium.launch();
  for (const [w, scheme] of [[1440, 'light'], [390, 'dark']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(file);
    await page.locator('#plot').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.getElementById('financial-lab').classList.contains('chart-ready'));
    await page.click('#method summary'); await page.click('#forecast-data summary'); await page.click('#implementation summary');
    await page.waitForTimeout(200);
    const box = await page.evaluate(() => { const r = document.querySelector('.disclosures').getBoundingClientRect(); return { y: r.top + scrollY, height: r.height }; });
    await page.screenshot({ path: path.join(out, `details-${w}.png`), fullPage: true, clip: { x: 0, y: box.y - 10, width: w, height: Math.min(box.height + 20, 2600) } });
    // focus on segmented
    await page.focus('input[name="window"][value="130"]');
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
    const seg = await page.locator('#fx-window').boundingBox();
    await page.screenshot({ path: path.join(out, `focus-segmented-${w}.png`), clip: { x: Math.max(0, seg.x - 200), y: seg.y - 10, width: Math.min(w, seg.width + 220), height: seg.height + 20 } });
    await ctx.close();
  }
  await browser.close();
})();
