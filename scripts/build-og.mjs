/**
 * Renders the social share card to /og-image.png (1200×630).
 *
 * The card is brand-only on purpose: no Pal artwork. In-page icons sit next to
 * an attribution line, but a share card gets reposted stripped of its context,
 * so it stays text and logo.
 *
 * Run: node scripts/build-og.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright is only needed to rasterise this one card, so it is not a
// dependency of the site. Point PLAYWRIGHT_MODULE at an install if the plain
// import cannot find one:
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node scripts/build-og.mjs
const { chromium } = await (async () => {
  try {
    return await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  } catch {
    return createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
  }
})();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const [logo, meta, combos] = await Promise.all([
  readFile(resolve(ROOT, 'android-chrome-512x512.png')),
  readFile(resolve(ROOT, 'data/meta.json'), 'utf8').then(JSON.parse),
  readFile(resolve(ROOT, 'data/combos.json'), 'utf8').then(JSON.parse),
]);

const n = (x) => x.toLocaleString('en-US');

const card = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{
    width:1200px;height:630px;overflow:hidden;position:relative;background:#ffffff;
    font-family:'Plus Jakarta Sans',Inter,-apple-system,'Segoe UI',Roboto,sans-serif;
    color:#1e293b;-webkit-font-smoothing:antialiased;
  }
  .wash{
    position:absolute;inset:0;
    background:
      radial-gradient(760px 460px at 4% -8%,rgba(252,235,85,.85),transparent 68%),
      radial-gradient(820px 500px at 98% 4%,rgba(125,220,245,.72),transparent 68%),
      radial-gradient(560px 380px at 60% 118%,rgba(252,248,230,.9),transparent 70%);
  }
  .inner{position:relative;height:100%;padding:70px 78px;display:flex;flex-direction:column}
  .brand{display:flex;align-items:center;gap:18px}
  .brand img{width:64px;height:64px;display:block}
  .brand span{font-size:34px;font-weight:800;letter-spacing:-.02em}
  h1{
    margin-top:auto;font-size:80px;line-height:1.04;letter-spacing:-.035em;font-weight:800;
    max-width:19ch;
  }
  .mark{
    background:linear-gradient(#fceb55,#fceb55) 0 100% / 100% 14px no-repeat;
    padding-bottom:6px;
    -webkit-box-decoration-break:clone;box-decoration-break:clone;
  }
  p.sub{margin-top:24px;font-size:31px;color:#475569;font-weight:600;max-width:34ch;line-height:1.35}
  .stats{margin-top:auto;display:flex;gap:14px;padding-top:34px}
  .stat{
    background:#fdf8e6;border:1px solid rgba(30,41,59,.07);border-radius:18px;padding:14px 24px;
    display:flex;flex-direction:column;gap:2px;
  }
  .stat b{font-size:32px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
  .stat small{font-size:14px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b}
  .free{
    margin-left:auto;align-self:flex-end;background:#fceb55;border-radius:999px;
    padding:14px 30px;font-size:24px;font-weight:800;letter-spacing:-.01em;
  }
</style></head><body>
  <div class="wash"></div>
  <div class="inner">
    <div class="brand">
      <img src="data:image/png;base64,${logo.toString('base64')}" alt="">
      <span>PalLineage</span>
    </div>
    <h1>Palworld 1.0 <span class="mark">Breeding Calculator</span></h1>
    <p class="sub">Find any child, every parent combo, and the shortest breeding path.</p>
    <div class="stats">
      <div class="stat"><b>${n(combos.combos.length)}</b><small>Combinations</small></div>
      <div class="stat"><b>${meta.pals}</b><small>Pals</small></div>
      <div class="stat"><b>${meta.variants}</b><small>Variants</small></div>
      <div class="free">Free · palbreeding.net</div>
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(card, { waitUntil: 'load' });
const png = await page.screenshot({ type: 'png' });
await browser.close();

const out = resolve(ROOT, 'og-image.png');
await writeFile(out, png);
console.log(`${out} — ${(png.length / 1024).toFixed(0)} KB, 1200×630`);
