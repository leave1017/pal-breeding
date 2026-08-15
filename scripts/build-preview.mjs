/**
 * Stitches index.html, tool/calculator.html and data/*.json into one standalone
 * file for sharing a preview. The site itself stays split — this output is only
 * for review links and is not deployed.
 *
 * Run: node scripts/build-preview.mjs [outfile]
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] ?? resolve(ROOT, 'preview.html');
const read = (p) => readFile(resolve(ROOT, p), 'utf8');

const [page, tool, pals, passives, combos] = await Promise.all([
  read('index.html'),
  read('tool/calculator.html'),
  read('data/pals.json'),
  read('data/passives.json'),
  read('data/combos.json'),
]);

const between = (src, open, close, label) => {
  const a = src.indexOf(open);
  const b = src.indexOf(close, a);
  if (a < 0 || b < 0) throw new Error(`Could not find ${label} in the tool file`);
  return src.slice(a + open.length, b);
};

// The host page already defines the palette and body styles; keeping the tool's
// copies would fight with them once both live in one document.
const toolCss = between(tool, '<style>', '</style>', 'styles')
  .replace(/:root\{[^}]*\}/, '')
  .replace(/html\[data-theme="dark"\]\{[^}]*\}/, '')
  .replace(/body\{[^}]*\}/, '')
  .replace(/\*,\*::before,\*::after\{[^}]*\}/, '');

const toolMarkup = between(tool, '<body>\n', '<script>', 'markup');
const toolJs = between(tool, '<script>', '</script>', 'script');

const frameOpen = page.indexOf('    <div class="calc-frame">');
const frameClose = page.indexOf('</div>', page.indexOf('</noscript>')) + '</div>'.length;
if (frameOpen < 0 || frameClose < 0) throw new Error('Could not find the calculator embed in index.html');

const inlined = page.slice(0, frameOpen) + toolMarkup + page.slice(frameClose);

// A single file cannot fetch sibling images, so Pal art is inlined as data URIs.
const iconDir = resolve(ROOT, 'assets/pals');
const iconFiles = (await readdir(iconDir)).filter((f) => f.endsWith('.webp'));
const icons = Object.fromEntries(await Promise.all(iconFiles.map(async (f) => [
  f.replace('.webp', ''),
  `data:image/webp;base64,${(await readFile(resolve(iconDir, f))).toString('base64')}`,
])));

const withAssets = inlined
  .replace('</head>', `<style>\n/* --- inlined from tool/calculator.html --- */\n${toolCss}\n</style>\n</head>`)
  .replace('</body>', [
    '<script id="paldata" type="application/json">',
    JSON.stringify({ pals: JSON.parse(pals), passives: JSON.parse(passives), combos: JSON.parse(combos) }),
    '</script>',
    '<script id="palicons" type="application/json">',
    JSON.stringify(icons),
    '</script>',
    '<script>',
    'window.__PALDATA__ = JSON.parse(document.getElementById("paldata").textContent);',
    'window.__PALICONS__ = JSON.parse(document.getElementById("palicons").textContent);',
    '</script>',
    `<script>\n${toolJs}\n</script>`,
    '</body>',
  ].join('\n'));

await writeFile(out, withAssets);
console.log(`${out} — ${(withAssets.length / 1024 / 1024).toFixed(2)} MB`);
