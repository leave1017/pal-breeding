/**
 * Generates the static pages that carry the long tail:
 *
 *   /breeding/            hub — every Pal, by how many pairs produce it
 *   /breeding/<slug>/     one page per Pal: the pairs that make it, and what it
 *                         makes with everything else
 *   /pals/                the Paldex grid — element, rarity, work suitability
 *   /guides/              guide index
 *   /guides/<slug>/       the guides written in content/guides/
 *   sitemap.xml, robots.txt
 *
 * Run: node scripts/build-pages.mjs
 */

import { writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://palbreeding.net';

// Pages this long would be megabytes if every row were printed; the rest stay
// in the calculator, which is linked from every table.
const MAX_PARENT_ROWS = 150;
const MAX_CHILD_ROWS = 60;

const read = async (p) => JSON.parse(await readFile(resolve(ROOT, p), 'utf8'));
const [pals, passives, combos] = await Promise.all([
  read('data/pals.json'), read('data/passives.json'), read('data/combos.json'),
]);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dex = (p) => '#' + String(p.dex).padStart(3, '0');
const n = (x) => x.toLocaleString('en-US');

// ---- indexes --------------------------------------------------------------
const byChild = new Map();   // child -> [[a,b], ...]
const asParent = new Map();  // parent -> [[partner, child], ...]
const push = (map, key, val) => map.set(key, (map.get(key) ?? []).concat([val]));

for (const [a, b, c] of combos.combos) {
  push(byChild, c, [a, b]);
  push(asParent, a, [b, c]);
  if (b !== a) push(asParent, b, [a, c]);
}

const parentsOf = (i) => byChild.get(i) ?? [];
const childrenOf = (i) => asParent.get(i) ?? [];
const cost = ([a, b]) => pals[a].rarity + pals[b].rarity;
const easiestFirst = (pairs) => [...pairs].sort((x, y) => cost(x) - cost(y) || pals[x[0]].dex - pals[y[0]].dex);

const WORK_LABEL = {
  Kindling: 'Kindling', Watering: 'Watering', Planting: 'Planting',
  GenerateElectricity: 'Electricity', Handiwork: 'Handiwork', Gathering: 'Gathering',
  Lumbering: 'Lumbering', Mining: 'Mining', MedicineProduction: 'Medicine',
  Cooling: 'Cooling', Transporting: 'Transporting', Farming: 'Farming',
};

// ---- shared chrome --------------------------------------------------------
const NAV = [['/', 'Calculator'], ['/breeding/', 'Breeding Combos'], ['/pals/', 'All Pals'], ['/guides/', 'Guide']];

function layout({ title, description, path, crumbs, body, extraLd = [] }) {
  const url = `${SITE}${path}`;
  // The home link is only current on the home page; the section links are
  // current for anything beneath them.
  const isCurrent = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  const nav = NAV.map(([href, label]) =>
    `<a href="${href}"${isCurrent(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('');

  const trail = crumbs.map((c, i) => c.href
    ? `<a href="${c.href}">${esc(c.label)}</a><span class="sep" aria-hidden="true">/</span>`
    : `<span aria-current="page">${esc(c.label)}</span>`).join('');

  const breadcrumbLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.label,
      item: c.href ? `${SITE}${c.href}` : url,
    })),
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<link rel="manifest" href="/manifest.json">
<meta property="og:type" content="website">
<meta property="og:site_name" content="PalLineage">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<link rel="stylesheet" href="/assets/page.css">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="theme-color" content="#fceb55">
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <nav class="nav" aria-label="Main">
      <a class="brand" href="/">
        <img class="brand__mark" src="/android-chrome-192x192.png" alt="" width="34" height="34">
        <span>PalLineage</span>
      </a>
      <div class="nav__right"><div class="nav__links">${nav}</div></div>
    </nav>
  </div>
</header>

<main>
  <div class="wrap wrap--wide">
    <nav class="crumbs" aria-label="Breadcrumb">${trail}</nav>
${body}
  </div>
</main>

<footer class="site-footer">
  <div class="wrap wrap--wide">
    <div class="foot-grid">
      <div>
        <h4>Tools</h4>
        <ul>
          <li><a href="/">Breeding Calculator</a></li>
          <li><a href="/breeding/">Breeding Combos</a></li>
          <li><a href="/pals/">All Pals</a></li>
        </ul>
      </div>
      <div>
        <h4>Database</h4>
        <ul>
          <li><a href="/pals/">Pal List</a></li>
          <li><a href="/guides/palworld-breeding-formula/">Passive Skills</a></li>
          <li><a href="/#calculator">Mutations</a></li>
        </ul>
      </div>
      <div>
        <h4>PalLineage</h4>
        <ul>
          <li><a href="/about/">About</a></li>
          <li><a href="/guides/">Guide</a></li>
          <li><a href="/privacy/">Privacy</a></li>
          <li><a href="/contact/">Contact</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-note">
      <span>PalLineage &middot; Palworld 1.0 breeding data from game files &middot; &copy; 2026</span>
      <span>Unofficial fan-made tool. Not affiliated with or endorsed by Pocketpair, Inc.</span>
    </div>
  </div>
</footer>
${[breadcrumbLd, ...extraLd].map((ld) => `<script type="application/ld+json">\n${JSON.stringify(ld)}\n</script>`).join('\n')}
</body>
</html>
`;
}

// ---- components -----------------------------------------------------------
const icon = (p) => `<img class="p-icon" src="/assets/pals/${p.slug}.webp" alt="" width="40" height="40" loading="lazy">`;

const elChips = (p) => (p.elements ?? [])
  .map((e) => `<span class="chip chip--${e.toLowerCase()}">${e}</span>`).join('');

const workList = (p) => Object.entries(p.work)
  .map(([k, v]) => `<span class="work">${WORK_LABEL[k]} ${v}</span>`).join('');

/** Table rows repeat hundreds of times per page, so they carry name only —
 *  the Paldex number is in the link target and on the Pal's own page. */
const palCell = (p) => `<a class="p-cell" href="/breeding/${p.slug}/">${icon(p)}${esc(p.name)}</a>`;

// ---- /breeding/<slug>/ ----------------------------------------------------
function palPage(p, i) {
  const parents = easiestFirst(parentsOf(i));
  const children = childrenOf(i).sort((x, y) => pals[x[1]].dex - pals[y[1]].dex);
  const uniqueChildren = new Set(children.map(([, c]) => c)).size;
  const selfOnly = parents.length === 1 && parents[0][0] === i && parents[0][1] === i;

  const parentRows = parents.slice(0, MAX_PARENT_ROWS).map(([a, b]) =>
    `<tr><td>${palCell(pals[a])}</td><td class="op">+</td><td>${palCell(pals[b])}</td><td class="num">${cost([a, b])}</td></tr>`).join('\n');

  const childRows = children.slice(0, MAX_CHILD_ROWS).map(([partner, child]) =>
    `<tr><td>${palCell(pals[partner])}</td><td class="op">&rarr;</td><td>${palCell(pals[child])}</td><td class="num">${pals[child].rarity}</td></tr>`).join('\n');

  const related = pals
    .filter((q) => q !== p && (q.elements ?? []).some((e) => (p.elements ?? []).includes(e)))
    .sort((a, b) => parentsOf(pals.indexOf(b)).length - parentsOf(pals.indexOf(a)).length)
    .slice(0, 8);

  const intro = selfOnly
    ? `<strong>${esc(p.name)}</strong> cannot be bred from two different Pals. The only pair that produces it is ${esc(p.name)} with another ${esc(p.name)}, so the first one has to be caught in the wild — after that it breeds true.`
    : `${n(parents.length)} parent ${parents.length === 1 ? 'pair produces' : 'pairs produce'} <strong>${esc(p.name)}</strong> in Palworld 1.0. They are listed cheapest first, by the combined rarity of the two parents, so the easiest way to get one is at the top.`;

  const body = `    <h1>Palworld ${esc(p.name)} Breeding Combos</h1>
    <p class="lede">${intro}</p>

    <div class="factbar">
      <span class="fact"><small>Paldex</small>${dex(p)}</span>
      <span class="fact"><small>Rarity</small>${p.rarity}</span>
      <span class="fact"><small>Element</small>${elChips(p) || '&mdash;'}</span>
      <span class="fact"><small>Parent pairs</small>${n(parents.length)}</span>
      <span class="fact"><small>Can produce</small>${n(uniqueChildren)} Pals</span>
    </div>

    ${Object.keys(p.work).length ? `<p class="worklist"><span class="worklist__label">Work suitability</span>${workList(p)}</p>` : ''}

    <h2>How to breed ${esc(p.name)}</h2>
    <p>Pair the two Pals in a Breeding Farm with cake in the feed box. Parent order never matters — ${esc(pals[parents[0][0]].name)} + ${esc(pals[parents[0][1]].name)} and ${esc(pals[parents[0][1]].name)} + ${esc(pals[parents[0][0]].name)} both hatch ${esc(p.name)}.</p>

    <div class="table-scroll">
      <table class="combo-table">
        <caption>Parent pairs that produce ${esc(p.name)}${parents.length > MAX_PARENT_ROWS ? ` — showing the ${MAX_PARENT_ROWS} easiest of ${n(parents.length)}` : ''}</caption>
        <thead><tr><th>Parent 1</th><th></th><th>Parent 2</th><th class="num">Rarity cost</th></tr></thead>
        <tbody>
${parentRows}
        </tbody>
      </table>
    </div>
    ${parents.length > MAX_PARENT_ROWS ? `<p class="note">All ${n(parents.length)} pairs are searchable in the <a href="/#calculator">breeding calculator</a>.</p>` : ''}

    <h2>What ${esc(p.name)} breeds into</h2>
    <p>Pairing ${esc(p.name)} with other Pals produces ${n(uniqueChildren)} different offspring${children.length > MAX_CHILD_ROWS ? `; the first ${MAX_CHILD_ROWS} partners are listed below` : ''}.</p>
    <div class="table-scroll">
      <table class="combo-table">
        <caption>${esc(p.name)} paired with&hellip;</caption>
        <thead><tr><th>Partner</th><th></th><th>Offspring</th><th class="num">Rarity</th></tr></thead>
        <tbody>
${childRows}
        </tbody>
      </table>
    </div>

    ${related.length ? `<h2>Other ${esc((p.elements ?? ['similar'])[0])} Pals</h2>
    <div class="pal-grid pal-grid--compact">
      ${related.map((q) => `<a class="pal-card" href="/breeding/${q.slug}/">${icon(q)}<strong>${esc(q.name)}</strong><small>${n(parentsOf(pals.indexOf(q)).length)} pairs</small></a>`).join('\n      ')}
    </div>` : ''}
`;

  return layout({
    title: `Palworld ${p.name} Breeding Combos 1.0 — All ${n(parents.length)} Pairs`,
    description: `Every parent combination that produces ${p.name} in Palworld 1.0 (${dex(p)}), sorted easiest first, plus what ${p.name} breeds into. Built from game data.`,
    path: `/breeding/${p.slug}/`,
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Breeding', href: '/breeding/' }, { label: p.name }],
    body,
  });
}

// ---- /breeding/ -----------------------------------------------------------
function breedingIndex() {
  const ranked = pals.map((p, i) => ({ p, i, count: parentsOf(i).length }))
    .sort((a, b) => b.count - a.count);
  const rows = ranked.map(({ p, count }) =>
    `<tr><td>${palCell(p)}</td><td>${elChips(p)}</td><td class="num">${p.rarity}</td><td class="num">${n(count)}</td></tr>`).join('\n');

  const body = `    <h1>Palworld 1.0 Breeding Combinations</h1>
    <p class="lede">Every Pal in the v1.0 Paldeck with the number of parent pairs that produce it — ${n(combos.combos.length)} combinations in total, generated from the game's own breeding table. Open any Pal for its full list.</p>

    <div class="factbar">
      <span class="fact"><small>Pals</small>${pals.length}</span>
      <span class="fact"><small>Combinations</small>${n(combos.combos.length)}</span>
      <span class="fact"><small>Variant forms</small>${pals.filter((p) => p.variant).length}</span>
      <span class="fact"><small>Breed from one pair only</small>${ranked.filter((r) => r.count === 1).length}</span>
    </div>

    <p><a class="btn btn--primary" href="/#calculator">Open the calculator</a></p>

    <h2>All Pals by number of parent pairs</h2>
    <div class="table-scroll">
      <table class="combo-table">
        <thead><tr><th>Pal</th><th>Element</th><th class="num">Rarity</th><th class="num">Parent pairs</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
`;
  return layout({
    title: 'Palworld 1.0 Breeding Combinations — All 299 Pals',
    description: `All ${n(combos.combos.length)} Palworld 1.0 breeding combinations, one page per Pal, with the number of parent pairs for each. Built from game data.`,
    path: '/breeding/',
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Breeding' }],
    body,
  });
}

// ---- /pals/ ---------------------------------------------------------------
function palsIndex() {
  const cards = pals.map((p, i) => `<a class="pal-card" href="/breeding/${p.slug}/">
        ${icon(p)}<strong>${esc(p.name)}</strong><small>${dex(p)}</small>
        <span class="chips">${elChips(p)}</span>
        <span class="worklist worklist--card">${workList(p)}</span>
      </a>`).join('\n      ');

  const body = `    <h1>All Palworld Pals</h1>
    <p class="lede">All ${pals.length} Pals in the v1.0 Paldeck, including ${pals.filter((p) => p.variant).length} variant forms, with element and work suitability on the rebalanced 1.0 scale. Every card opens that Pal's breeding combinations.</p>
    <div class="pal-grid">
      ${cards}
    </div>
`;
  return layout({
    title: 'All 299 Palworld Pals — Elements & Work Suitability',
    description: 'Every Pal in the Palworld 1.0 Paldeck with its element and all twelve work suitabilities, linked to its breeding combinations.',
    path: '/pals/',
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Pals' }],
    body,
  });
}

// ---- /guides/ -------------------------------------------------------------
async function guides() {
  const dir = resolve(ROOT, 'content/guides');
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.json')); } catch { return []; }

  const written = [];
  const entries = [];
  for (const file of files) {
    const g = JSON.parse(await readFile(resolve(dir, file), 'utf8'));
    entries.push(g);
    written.push([`guides/${g.slug}/index.html`, layout({
      title: g.title,
      description: g.description,
      path: `/guides/${g.slug}/`,
      crumbs: [{ label: 'Home', href: '/' }, { label: 'Guides', href: '/guides/' }, { label: g.shortTitle ?? g.h1 }],
      body: `    <h1>${esc(g.h1)}</h1>\n    <p class="lede">${g.lede}</p>\n${g.body}\n`,
      extraLd: [{
        '@context': 'https://schema.org', '@type': 'Article',
        headline: g.h1, description: g.description,
        mainEntityOfPage: `${SITE}/guides/${g.slug}/`,
      }],
    })]);
  }

  written.push(['guides/index.html', layout({
    title: 'Palworld Breeding Guides',
    description: 'How breeding works in Palworld 1.0: the formula behind the calculator, and how to plan a breeding project.',
    path: '/guides/',
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Guides' }],
    body: `    <h1>Palworld Breeding Guides</h1>
    <p class="lede">What is actually going on underneath the calculator, and how to use it without wasting eggs.</p>
    <div class="card-list">
      ${entries.map((g) => `<a class="guide-card" href="/guides/${g.slug}/"><strong>${esc(g.h1)}</strong><span>${esc(g.description)}</span></a>`).join('\n      ')}
    </div>`,
  })]);
  return written;
}

// ---- write ----------------------------------------------------------------
const files = [
  ['breeding/index.html', breedingIndex()],
  ['pals/index.html', palsIndex()],
  ...pals.map((p, i) => [`breeding/${p.slug}/index.html`, palPage(p, i)]),
  ...(await guides()),
];

const urls = [
  ['/', '1.0', 'daily'],
  ['/breeding/', '0.9', 'weekly'],
  ['/pals/', '0.8', 'weekly'],
  ['/guides/', '0.7', 'monthly'],
  ...files.filter(([f]) => f.startsWith('breeding/') && f !== 'breeding/index.html')
    .map(([f]) => ['/' + f.replace('index.html', ''), '0.7', 'monthly']),
  ...files.filter(([f]) => f.startsWith('guides/') && f !== 'guides/index.html')
    .map(([f]) => ['/' + f.replace('index.html', ''), '0.6', 'monthly']),
  ['/about/', '0.4', 'yearly'], ['/contact/', '0.3', 'yearly'],
  ['/privacy/', '0.3', 'yearly'], ['/terms/', '0.3', 'yearly'],
];

files.push(['sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([loc, priority, freq]) =>
  `  <url><loc>${SITE}${loc}</loc><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`).join('\n')}
</urlset>
`]);

files.push(['robots.txt', `User-agent: *
Allow: /

# The calculator is embedded in the homepage; indexing it separately would put a
# chrome-less copy of the tool in competition with the page it belongs to.
Disallow: /tool/

Sitemap: ${SITE}/sitemap.xml
`]);

for (const [path, contents] of files) {
  const out = resolve(ROOT, path);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, contents);
}

const bytes = files.reduce((sum, [, c]) => sum + Buffer.byteLength(c), 0);
console.log(`${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`  ${pals.length} Pal pages · ${urls.length} URLs in the sitemap`);
