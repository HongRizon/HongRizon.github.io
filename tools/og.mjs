// Renders og.png (1200×630), favicon-32.png and apple-touch-icon.png from the built page.
// One-off: node tools/og.mjs   (needs the playwright dev dependency)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const figure = html.match(/<div class="static-frame">([\s\S]*?)<\/div><\/div>\s*<canvas/)[1];
const lastObs = html.match(/id="last-obs" datetime="[^"]+">([^<]+)</)[1];
const favicon = decodeURIComponent(html.match(/href="data:image\/svg\+xml,([^"]+)"/)[1]);

const page = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>
:root{--paper:#fafaf8;--ink:#1f2933;--muted:#5a6670;--line:#d6dcdf;--strong:#8a97a0;--up:#aa454a;--down:#2b69a6;--band-a:.12;--band-b:.19}
html,body{margin:0;background:var(--paper);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.card{position:relative;width:1200px;height:630px;padding:64px 72px;box-sizing:border-box;display:grid;grid-template-columns:1fr 440px;gap:64px}
.role{font-size:20px;color:var(--muted);margin:0 0 14px}
h1{font-size:72px;line-height:1.02;letter-spacing:-.035em;font-weight:500;margin:0 0 6px}
.ko{display:block;font-size:24px;color:var(--muted);font-weight:400;letter-spacing:-.02em;margin-top:12px}
.thesis{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Charter,Georgia,serif;font-size:34px;line-height:1.3;letter-spacing:-.01em;margin:26px 0 0;max-width:600px}
.foot{position:absolute;left:72px;right:72px;bottom:56px;display:flex;justify-content:space-between;font-size:18px;color:var(--muted);border-top:1px solid var(--line);padding-top:18px}
.fig{position:relative;align-self:center;height:300px}
.fig .static-frame{position:absolute;left:0;right:60px;top:10px;bottom:30px}
.fig svg{width:100%;height:100%;display:block}
.static-y{position:absolute;left:calc(100% + 10px);transform:translateY(-50%);font-size:15px;color:var(--muted);white-space:nowrap}
.static-x{position:absolute;bottom:-26px;margin-left:3px;font-size:15px;color:var(--muted);white-space:nowrap}
.cap{position:absolute;left:0;right:0;top:-34px;font-size:16px;color:var(--muted);display:flex;justify-content:space-between}
</style></head><body><div class="card">
<div><p class="role">Quantitative researcher</p><h1>SeungBin Hong<span class="ko" lang="ko">홍승빈</span></h1>
<p class="thesis">I study what information a decision actually needs, and what a model actually uses.</p></div>
<div class="fig"><div class="cap"><span>USD/KRW, forecast as a range</span><span>Federal Reserve H.10</span></div><div class="static-frame">${figure}</div></div>
<div class="foot"><span>Financial machine learning and decision-making</span><span>hongrizon.github.io</span></div>
</div></body></html>`;

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.setContent(page);
await p.screenshot({ path: path.join(root, 'og.png'), type: 'png' });
for (const [size, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png']]) {
  const ip = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await ip.setContent(`<!DOCTYPE html><html><body style="margin:0;background:transparent">${favicon.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
  await ip.screenshot({ path: path.join(root, name), omitBackground: true, type: 'png' });
}
await browser.close();
console.log('wrote og.png, favicon-32.png, apple-touch-icon.png');
