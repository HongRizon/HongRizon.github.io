const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const file = 'file://' + path.resolve(__dirname, '..', 'index.html');
const out = path.resolve(__dirname, 'out');
(async () => {
  const browser = await chromium.launch();
  const lines = [];
  for (const [scheme, explicit] of [['light', null], ['dark', null], ['light', 'dark'], ['dark', 'light']]) {
    for (const format of ['A4', 'Letter']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(file);
      if (explicit) await page.check(`input[name="theme"][value="${explicit}"]`);
      await page.emulateMedia({ media: 'print' });
      const vars = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return { paper: s.getPropertyValue('--paper').trim(), ink: s.getPropertyValue('--ink').trim(), htmlBg: getComputedStyle(document.documentElement).backgroundColor, h1: getComputedStyle(document.querySelector('h1')).color, scheme: s.colorScheme }; });
      const name = `print-${scheme}${explicit ? '-' + explicit : ''}-${format}`;
      const pdf = path.join(out, name + '.pdf');
      await page.pdf({ path: pdf, format, printBackground: true });
      const pages = parseInt(execSync(`pdfinfo "${pdf}" | awk '/^Pages:/{print $2}'`).toString().trim(), 10);
      const ok = vars.paper === '#fff' && vars.ink === '#000' && vars.htmlBg === 'rgb(255, 255, 255)' && vars.h1 === 'rgb(0, 0, 0)' && pages === 1;
      lines.push(`${ok ? 'PASS' : 'FAIL'} ${name}: pages=${pages} paper=${vars.paper} ink=${vars.ink} htmlBg=${vars.htmlBg} h1=${vars.h1}`);
      if (scheme === 'dark' && explicit === null && format === 'A4') execSync(`pdftoppm -r 80 -png "${pdf}" "${path.join(out, name)}"`);
      if (scheme === 'light' && explicit === null && format === 'Letter') execSync(`pdftoppm -r 80 -png "${pdf}" "${path.join(out, name)}"`);
      await ctx.close();
    }
  }
  await browser.close();
  console.log(lines.join('\n'));
  process.exit(lines.some(l => l.startsWith('FAIL')) ? 1 : 0);
})();
