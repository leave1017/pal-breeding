/**
 * Generates the static pages that carry the long tail:
 *
 *   /breeding/            hub — every Pal, by how many pairs produce it
 *   /breeding/<slug>/     one page per Pal: the pairs that make it, and what it
 *                         makes with everything else
 *   /pals/                the Paldex grid — element, rarity, work suitability
 *   /passives/            the passives a species always hatches with
 *   /passives/<slug>/     one page per passive: which Pals carry it
 *   /mutations/           the 85 variant forms, by family
 *   /mutations/<family>/  Cryst, Ignis, Noct, Lux, Terra, Primo, Botan, Aqua
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
const pairs = (k) => `${n(k)} pair${k === 1 ? '' : 's'}`;

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
<script src="/assets/theme.js"></script>
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
      <div class="nav__right"><div class="nav__links">${nav}</div>
        <button class="icon-btn" id="themeToggle" type="button" aria-label="Switch color theme">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
        </button>
      </div>
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
          <li><a href="/passives/">Passive Skills</a></li>
          <li><a href="/mutations/">Mutations</a></li>
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

    ${(p.passives ?? []).length ? `<p class="worklist"><span class="worklist__label">Always hatches with</span>${(p.passives ?? []).map((x) => `<a class="work" href="/passives/${passiveIndex[x].slug}/">${esc(passiveIndex[x].name)}</a>`).join('')}</p>` : ''}
    ${p.variant ? (() => {
      const f = families.find((x) => x.members.some(([q]) => q === p));
      return f && f.members.length >= FAMILY_MIN
        ? `<p class="note"><strong>${esc(p.name)}</strong> is a variant form. See <a href="/mutations/${f.slug}/">all ${f.members.length} ${esc(f.name)} Pals</a> or the <a href="/mutations/">full list of ${variants.length} variants</a>.</p>`
        : `<p class="note"><strong>${esc(p.name)}</strong> is a variant form — see the <a href="/mutations/">full list of ${variants.length} variants</a>.</p>`;
    })() : ''}

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
      ${related.map((q) => `<a class="pal-card" href="/breeding/${q.slug}/">${icon(q)}<strong>${esc(q.name)}</strong><small>${pairs(parentsOf(pals.indexOf(q)).length)}</small></a>`).join('\n      ')}
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
    <div class="card-list" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-bottom:26px">
      <a class="guide-card" href="/mutations/"><strong>Variant Pals</strong><span>All ${variants.length} mutations, by family</span></a>
      <a class="guide-card" href="/passives/"><strong>Passive Skills</strong><span>The ${passiveIndex.length} passives guaranteed by species</span></a>
    </div>
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

// ---- /passives/ -----------------------------------------------------------
// Only the passives a species always hatches with are in the dataset — the
// full in-game passive list is much longer, and the rest are rolled at random
// rather than tied to a Pal, so they cannot be looked up this way.

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const passiveIndex = passives.map((skill, i) => ({
  ...skill,
  slug: slugify(skill.name),
  carriers: pals.map((p, pi) => [p, pi]).filter(([p]) => (p.passives ?? []).includes(i)),
}));

{
  const dupes = passiveIndex.map((s) => s.slug).filter((s, i, a) => a.indexOf(s) !== i);
  if (dupes.length) throw new Error(`duplicate passive slug: ${dupes.join(', ')}`);
}

const RANK_LABEL = {
  4: 'Rank 4 — highest tier',
  3: 'Rank 3',
  2: 'Rank 2',
  1: 'Rank 1',
  '-1': 'Rank −1 — negative trait',
};
const rankLabel = (r) => RANK_LABEL[r] ?? `Rank ${r}`;

const palCardWithPairs = (p) =>
  `<a class="pal-card" href="/breeding/${p.slug}/">${icon(p)}<strong>${esc(p.name)}</strong><small>${pairs(parentsOf(pals.indexOf(p)).length)}</small></a>`;

function passivePage(skill) {
  const carriers = [...skill.carriers].sort((a, b) => a[0].dex - b[0].dex);
  const cheapest = [...carriers].sort((a, b) =>
    parentsOf(b[1]).length - parentsOf(a[1]).length || a[0].rarity - b[0].rarity)[0];
  const negative = skill.rank < 0;
  const siblings = passiveIndex.filter((s) => s.rank === skill.rank && s !== skill).slice(0, 8);

  const many = carriers.length > 1;
  const lede = negative
    ? `${esc(skill.name)} is a negative passive: ${many ? `the ${carriers.length} Pals below always hatch with it` : `${esc(carriers[0][0].name)} always hatches with it`}, so it travels into the egg whenever one of them is a parent. Worth knowing before you put one in the Breeding Farm.`
    : `${many ? `${carriers.length} Pals always hatch with` : `${esc(carriers[0][0].name)} always hatches with`} <strong>${esc(skill.name)}</strong> in Palworld 1.0. Breeding from one of them is the reliable way to get the skill onto a line, because it is on the parent already instead of being rolled at random.`;

  const body = `    <h1>Palworld ${esc(skill.name)} Passive Skill</h1>
    <p class="lede">${lede}</p>

    <div class="factbar">
      <span class="fact"><small>Tier</small>${rankLabel(skill.rank)}</span>
      <span class="fact"><small>Pals with it</small>${carriers.length}</span>
      <span class="fact"><small>Most breedable carrier</small>${esc(cheapest[0].name)}</span>
    </div>

    <h2>${many ? `Pals that always have ${esc(skill.name)}` : `The Pal that always has ${esc(skill.name)}`}</h2>
    <p>Every Pal below hatches with ${esc(skill.name)} attached, whether you catch it or breed it. The number on each card is how many parent pairs produce that Pal.</p>
    <div class="pal-grid pal-grid--compact">
      ${carriers.map(([p]) => palCardWithPairs(p)).join('\n      ')}
    </div>

    <h2>${negative ? `How to avoid passing on ${esc(skill.name)}` : `How to breed ${esc(skill.name)} into a line`}</h2>
    ${negative
      ? `<p>A passive on a parent goes into the pool the egg draws from, so the surest way to keep ${esc(skill.name)} out of a line is to keep its carriers out of the Breeding Farm. If one of them is the only route to the Pal you want, plan an extra generation: breed the child you need, then pair that child onward and keep the egg that came out clean.</p>`
      : `<p>Start from a carrier. ${esc(cheapest[0].name)} is the one most pairs lead to — ${n(parentsOf(cheapest[1]).length)} parent ${parentsOf(cheapest[1]).length === 1 ? 'pair produces' : 'pairs produce'} it — so it is usually the cheapest way to get ${esc(skill.name)} into your ranch. From there, pair the carrier with the Pal you are building and keep the eggs that inherit the skill.</p>
    <p>Both parents contribute to the pool, so two carriers are better than one when you are stacking several passives at once. The <a href="/#calculator">Passives tab in the calculator</a> filters the whole Paldeck down to the Pals that guarantee the skills you pick.</p>`}

    <div class="callout">
      <p><strong>What this list covers.</strong> These are the passives tied to a species — a Pal of this kind always hatches with the skill. Palworld also rolls other passives at random on any egg; those are not attached to a Pal and so cannot be looked up here.</p>
    </div>

    ${siblings.length ? `<h2>Other ${rankLabel(skill.rank).toLowerCase().startsWith('rank') ? rankLabel(skill.rank).split(' —')[0].toLowerCase() : 'similar'} passives</h2>
    <div class="card-list">
      ${siblings.map((s) => `<a class="guide-card" href="/passives/${s.slug}/"><strong>${esc(s.name)}</strong><span>${s.carriers.length} ${s.carriers.length === 1 ? 'Pal always hatches' : 'Pals always hatch'} with it</span></a>`).join('\n      ')}
    </div>` : ''}
`;

  return layout({
    title: `Palworld ${skill.name} Passive — Which Pals Always Have It`,
    description: `Every Palworld 1.0 Pal that always hatches with the ${skill.name} passive skill, and how to breed the skill into a line. Built from game data.`,
    path: `/passives/${skill.slug}/`,
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Passives', href: '/passives/' }, { label: skill.name }],
    body,
  });
}

function passivesIndex() {
  const ranks = [...new Set(passiveIndex.map((s) => s.rank))].sort((a, b) => b - a);
  const carrierCount = new Set(passiveIndex.flatMap((s) => s.carriers.map(([, i]) => i))).size;

  const sections = ranks.map((r) => {
    const group = passiveIndex.filter((s) => s.rank === r).sort((a, b) => b.carriers.length - a.carriers.length);
    return `    <h2>${rankLabel(r)}</h2>
    <div class="table-scroll">
      <table class="combo-table">
        <thead><tr><th>Passive skill</th><th>Pals that always have it</th><th class="num">Count</th></tr></thead>
        <tbody>
${group.map((s) => `          <tr><td><a href="/passives/${s.slug}/">${esc(s.name)}</a></td><td>${s.carriers.slice(0, 4).map(([p]) => `<a href="/breeding/${p.slug}/">${esc(p.name)}</a>`).join(', ')}${s.carriers.length > 4 ? ` <span style="color:var(--fg-muted)">+${s.carriers.length - 4} more</span>` : ''}</td><td class="num">${s.carriers.length}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>`;
  }).join('\n\n');

  const body = `    <h1>Palworld Passive Skills by Pal</h1>
    <p class="lede">${passiveIndex.length} passive skills in Palworld 1.0 are tied to a species: a Pal of that kind always hatches with the skill attached. ${carrierCount} Pals carry one. Those are the skills you can plan a breeding project around, because they are guaranteed rather than rolled.</p>

    <div class="factbar">
      <span class="fact"><small>Species passives</small>${passiveIndex.length}</span>
      <span class="fact"><small>Pals carrying one</small>${carrierCount}</span>
      <span class="fact"><small>Top-tier passives</small>${passiveIndex.filter((x) => x.rank === 4).length}</span>
    </div>

    <h2>How passive skills are inherited</h2>
    <p>Both parents contribute their passives to the pool an egg draws from, and the egg can also roll skills neither parent had. Nothing here is guaranteed on the child — what is guaranteed is the <em>parent</em>: a Kingpaca always hatches with Heavyweight, so pairing one puts Heavyweight in the pool every single time instead of hoping for a roll.</p>
    <p>That is why a four-passive project usually starts by breeding the carriers rather than the target. Pick the skills you want, find the Pals that guarantee them, and work the target species in last.</p>

${sections}

    <div class="callout">
      <p><strong>Not the full passive list.</strong> Palworld has many more passives than the ${passiveIndex.length} here. The rest are rolled at random on the egg and are not attached to any species, so there is no Pal to breed for — this page covers only the ones you can plan around.</p>
    </div>

    <h2>Breed for a passive</h2>
    <p>The <a href="/#calculator">Passives tab in the breeding calculator</a> takes the skills you want and returns the Pals that guarantee them, with the parent pairs that produce each one.</p>
`;

  return layout({
    title: 'Palworld Passive Skills — Which Pals Always Have Them',
    description: `All ${passiveIndex.length} Palworld 1.0 passive skills that are guaranteed by species, the ${carrierCount} Pals that carry them, and how to breed a skill into a line.`,
    path: '/passives/',
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Passives' }],
    body,
  });
}

// ---- /mutations/ ----------------------------------------------------------
// Variant forms are separate Paldeck entries with their own breeding pairs.
// They are grouped by the suffix the game gives them, and the element list of
// each family is read off the data rather than assumed.

const variants = pals.map((p, i) => [p, i]).filter(([p]) => p.variant);

const FAMILY_MIN = 4;   // below this a family is a footnote, not a page
const familyOf = ([p]) => (p.name.includes(' ') ? p.name.split(' ').pop() : 'Other');

const families = [...new Map(variants.map((v) => [familyOf(v), null])).keys()]
  .map((name) => {
    const members = variants.filter((v) => familyOf(v) === name)
      .sort((a, b) => a[0].dex - b[0].dex);
    const elements = [...new Set(members.flatMap(([p]) => p.elements ?? []))];
    // The element the whole family shares is the one every member has.
    const shared = elements.filter((e) => members.every(([p]) => (p.elements ?? []).includes(e)));
    return { name, slug: slugify(name), members, elements, shared };
  })
  .sort((a, b) => b.members.length - a.members.length);

const familyLede = (f) => f.shared.length
  ? `Every ${esc(f.name)} form is ${f.shared.map((e) => esc(e)).join(' and ')}-type`
  : `The ${esc(f.name)} forms cover ${f.elements.map((e) => esc(e)).join(', ')}`;

function familyPage(f) {
  const cards = f.members.map(([p, i]) =>
    `<a class="pal-card" href="/breeding/${p.slug}/">${icon(p)}<strong>${esc(p.name)}</strong><small>${pairs(parentsOf(i).length)}</small></a>`).join('\n      ');

  const easiest = [...f.members].sort((a, b) => parentsOf(b[1]).length - parentsOf(a[1]).length)[0];
  const hardest = [...f.members].sort((a, b) => parentsOf(a[1]).length - parentsOf(b[1]).length)[0];
  // Some families are produced by fixed recipes, so every member has the same
  // number of pairs — printing "easiest" and "hardest" would name the same Pal.
  const uniformPairs = parentsOf(easiest[1]).length === parentsOf(hardest[1]).length;

  const rows = f.members.map(([p, i]) => {
    const base = pals.find((q) => !q.variant && q.dex === p.dex);
    return `          <tr><td>${palCell(p)}</td><td>${base ? palCell(base) : '<span style="color:var(--fg-muted)">&mdash;</span>'}</td><td><span class="chips">${elChips(p)}</span></td><td class="num">${p.rarity}</td><td class="num">${n(parentsOf(i).length)}</td></tr>`;
  }).join('\n');

  const body = `    <h1>Palworld ${esc(f.name)} Pals — All ${f.members.length} Variants</h1>
    <p class="lede">${familyLede(f)}. All ${f.members.length} are separate Paldeck entries with their own breeding pairs, so you breed for the variant directly rather than transforming the base Pal.</p>

    <div class="factbar">
      <span class="fact"><small>Variants</small>${f.members.length}</span>
      <span class="fact"><small>${f.shared.length ? 'Shared element' : 'Elements'}</small>${f.shared.length ? f.shared.map((e) => esc(e)).join(' / ') : f.elements.length}</span>
      ${uniformPairs
        ? `<span class="fact"><small>Parent pairs each</small>${n(parentsOf(easiest[1]).length)}</span>`
        : `<span class="fact"><small>Easiest to breed</small>${esc(easiest[0].name)}</span>
      <span class="fact"><small>Hardest to breed</small>${esc(hardest[0].name)}</span>`}
    </div>

    <div class="pal-grid pal-grid--compact">
      ${cards}
    </div>

    <h2>Every ${esc(f.name)} variant and its base form</h2>
    <div class="table-scroll">
      <table class="combo-table">
        <thead><tr><th>Variant</th><th>Base Pal</th><th>Element</th><th class="num">Rarity</th><th class="num">Parent pairs</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>

    <h2>How to breed a ${esc(f.name)} Pal</h2>
    <p>A variant is bred like any other Pal: pick it as the target and the calculator returns the pairs that produce it. The pairs belong to the variant, not to the base Pal. ${uniformPairs
      ? `Every ${esc(f.name)} form comes from the same small set — ${pairs(parentsOf(easiest[1]).length)} each — which is what a fixed recipe looks like in the data.`
      : `${esc(easiest[0].name)} comes from ${pairs(parentsOf(easiest[1]).length)}, while ${esc(hardest[0].name)} comes from ${n(parentsOf(hardest[1]).length)}.`} Open any Pal above to see them listed cheapest first.</p>

    <h2>Other variant families</h2>
    <div class="card-list">
      ${families.filter((x) => x !== f && x.members.length >= FAMILY_MIN)
        .map((x) => `<a class="guide-card" href="/mutations/${x.slug}/"><strong>${esc(x.name)} Pals</strong><span>${x.members.length} variants · ${x.shared.length ? x.shared.join(' and ') + '-type' : x.elements.join(', ')}</span></a>`).join('\n      ')}
    </div>
`;

  return layout({
    title: `Palworld ${f.name} Pals — All ${f.members.length} Variants & How to Breed Them`,
    description: `Every ${f.name} variant in Palworld 1.0, its base Pal, element and rarity, with the number of parent pairs that produce each one.`,
    path: `/mutations/${f.slug}/`,
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Mutations', href: '/mutations/' }, { label: `${f.name} Pals` }],
    body,
  });
}

// The extremes are worth stating on the hub page, and they have to come from
// the data rather than from an assumption about which family is common.
const mostPairs = [...variants].sort((a, b) => parentsOf(b[1]).length - parentsOf(a[1]).length)[0];
const selfOnly = variants.filter(([, i]) => {
  const ps = parentsOf(i);
  return ps.length === 1 && ps[0][0] === i && ps[0][1] === i;
});

function mutationsIndex() {
  const big = families.filter((f) => f.members.length >= FAMILY_MIN);
  const small = families.filter((f) => f.members.length < FAMILY_MIN);

  const section = (f) => `    <h2 id="${f.slug}">${esc(f.name)} — ${f.members.length} variant${f.members.length === 1 ? '' : 's'}</h2>
    <p>${familyLede(f)}.${f.members.length >= FAMILY_MIN ? ` <a href="/mutations/${f.slug}/">All ${f.members.length} ${esc(f.name)} Pals &rarr;</a>` : ''}</p>
    <div class="pal-grid pal-grid--compact">
      ${f.members.map(([p, i]) => `<a class="pal-card" href="/breeding/${p.slug}/">${icon(p)}<strong>${esc(p.name)}</strong><small>${pairs(parentsOf(i).length)}</small></a>`).join('\n      ')}
    </div>`;

  const body = `    <h1>Palworld Variant Pals — All ${variants.length} Mutations</h1>
    <p class="lede">Palworld 1.0 has ${variants.length} variant forms across ${families.length} families. Each one is its own Paldeck entry with its own element, stats and breeding pairs — a Cryst form is not an Ice-coated version of the base Pal, it is a different Pal that you breed for directly.</p>

    <div class="factbar">
      <span class="fact"><small>Variant Pals</small>${variants.length}</span>
      <span class="fact"><small>Families</small>${families.length}</span>
      <span class="fact"><small>Share of the Paldeck</small>${Math.round((variants.length / pals.length) * 100)}%</span>
    </div>

    <h2>What a variant actually is</h2>
    <p>There is no mutation step and no item that converts a Pal. The variant sits in the Paldeck next to its base form, usually with a different element and a different rarity, and it is produced by its own set of parent pairs. How reachable they are varies enormously: ${esc(mostPairs[0].name)} comes from ${pairs(parentsOf(mostPairs[1]).length)}, while ${selfOnly.length} variants — ${selfOnly.map(([q]) => esc(q.name)).join(', ')} — breed only from themselves, so the first one has to be caught in the wild.</p>
    <p>Because the pairs belong to the variant rather than to the base Pal, looking up "Jormuntide" tells you nothing about Jormuntide Ignis. Open the variant itself.</p>

${big.map(section).join('\n\n')}

    <h2>Smaller variant families</h2>
    <p>${small.every((f) => f.members.length === 1) ? 'These families have a single member each.' : `Families with fewer than ${FAMILY_MIN} members, listed together.`}</p>
    <div class="pal-grid pal-grid--compact">
      ${small.flatMap((f) => f.members).sort((a, b) => a[0].dex - b[0].dex)
        .map(([p, i]) => `<a class="pal-card" href="/breeding/${p.slug}/">${icon(p)}<strong>${esc(p.name)}</strong><small>${pairs(parentsOf(i).length)}</small></a>`).join('\n      ')}
    </div>

    <h2>Breed a variant</h2>
    <p>Pick the variant as your target in the <a href="/#calculator">breeding calculator</a> and it returns every pair that produces it, cheapest first. The Mutations tab lists the variant forms on their own if you would rather browse than search.</p>
`;

  return layout({
    title: `Palworld Variant Pals — All ${variants.length} Mutations in 1.0`,
    description: `Every variant Pal in Palworld 1.0 — Cryst, Ignis, Noct, Lux, Terra and the rest — with its element, rarity and how many parent pairs produce it.`,
    path: '/mutations/',
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Mutations' }],
    body,
  });
}

// ---- write ----------------------------------------------------------------
const files = [
  ['breeding/index.html', breedingIndex()],
  ['pals/index.html', palsIndex()],
  ...pals.map((p, i) => [`breeding/${p.slug}/index.html`, palPage(p, i)]),
  ['passives/index.html', passivesIndex()],
  ...passiveIndex.map((s) => [`passives/${s.slug}/index.html`, passivePage(s)]),
  ['mutations/index.html', mutationsIndex()],
  ...families.filter((f) => f.members.length >= FAMILY_MIN)
    .map((f) => [`mutations/${f.slug}/index.html`, familyPage(f)]),
  ...(await guides()),
];

const urls = [
  ['/', '1.0', 'daily'],
  ['/breeding/', '0.9', 'weekly'],
  ['/pals/', '0.8', 'weekly'],
  ['/guides/', '0.7', 'monthly'],
  ['/passives/', '0.8', 'weekly'],
  ['/mutations/', '0.8', 'weekly'],
  ...files.filter(([f]) => f.startsWith('passives/') && f !== 'passives/index.html')
    .map(([f]) => ['/' + f.replace('index.html', ''), '0.6', 'monthly']),
  ...files.filter(([f]) => f.startsWith('mutations/') && f !== 'mutations/index.html')
    .map(([f]) => ['/' + f.replace('index.html', ''), '0.6', 'monthly']),
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
