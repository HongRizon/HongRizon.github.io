const { chromium } = require('playwright');
const path = require('path');
const file = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const browser = await chromium.launch();
  for (const [scheme, contrast] of [['light', 'no-preference'], ['light', 'more'], ['dark', 'more']]) {
    const ctx = await browser.newContext({ colorScheme: scheme, contrast });
    const page = await ctx.newPage(); await page.goto(file);
    const v = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return { muted: s.getPropertyValue('--muted').trim(), line: s.getPropertyValue('--line').trim() }; });
    console.log(scheme, contrast, JSON.stringify(v));
    await ctx.close();
  }
  await browser.close();
})();
