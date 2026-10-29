const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const file = 'file://' + path.resolve(__dirname, '..', 'index.html');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch();
  let total = 0;
  for (const scheme of ['light', 'dark']) {
    for (const js of [true]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme, javaScriptEnabled: js, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(file);
      if (js) { await page.locator('#plot').scrollIntoViewIfNeeded(); await page.waitForTimeout(500); await page.click('#forecast-data summary'); await page.click('#method summary'); await page.click('#implementation summary'); }
      await page.addScriptTag({ content: axeSrc });
      const res = await page.evaluate(async () => await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
      console.log(`${scheme} js=${js}: violations=${res.violations.length} passes=${res.passes.length} incomplete=${res.incomplete.length}`);
      for (const v of res.violations) { total++; console.log(`  - [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0].target.join(' ')}`); }
      for (const v of res.incomplete) console.log(`  ? ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0].target.join(' ')}`);
      await ctx.close();
    }
  }
  await browser.close();
  process.exit(total ? 1 : 0);
})();
