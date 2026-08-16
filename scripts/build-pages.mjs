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

// Inlined rather than referenced: a <use href="file.svg#id"> costs an extra
// round trip and is inconsistent across browsers for same-document sprites.
const SPRITE = await readFile(resolve(ROOT, 'assets/sprite.svg'), 'utf8');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dex = (p) => '#' + String(p.dex).padStart(3, '0');

/* Two Paldeck entries can share a name: Gumoss and its flower form are both
   called "Gumoss" and both sit at #012, so a template keyed on the name alone
   gives the two pages the same <title> and the same description — Google reads
   that as one page duplicated and keeps whichever it likes. The slug is the
   only thing that distinguishes them, so borrow the suffix from it. */
const nameUses = pals.reduce((m, p) => m.set(p.name, (m.get(p.name) ?? 0) + 1), new Map());
const slugOf = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const label = (p) => {
  if (nameUses.get(p.name) === 1) return p.name;
  const stem = slugOf(p.name);
  const extra = p.slug.startsWith(`${stem}-`) ? p.slug.slice(stem.length + 1) : '';
  return extra
    ? `${p.name} (${extra.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')})`
    : p.name;
};
const n = (x) => x.toLocaleString('en-US');
const pairs = (k) => `${n(k)} pair${k === 1 ? '' : 's'}`;
/** First candidate that fits in a search result, or the shortest one. */
const fit60 = (candidates) => candidates.find((t) => t.length <= 60) ?? candidates[candidates.length - 1];

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

/* These pages run long — a dozen <h2>s of prose under the table — and written
   as one flat column they read as a wall: the only thing separating one topic
   from the next is a slightly larger line of text, so nothing tells the eye
   where a section starts or gives it permission to skip one.

   Rather than hand-wrap every template, take each <h2> and everything up to
   the next one and put it in its own <section>. The CSS turns that into a
   card, which is what actually makes the page skimmable.

   Anything before the first <h2> — the h1, the lede, the fact bar — is page
   header and stays out. A body can opt its tail out too, for a closing button
   or a row of links that belongs to the page rather than to the last topic. */
const SECTION_END = '<!--/sections-->';

function sections(body) {
  const [main, tail = ''] = body.split(SECTION_END);

  /* Split on the newline before an indented <h2>, not on the heading itself:
     anchoring `^\s*` matches both the blank line above the heading and the
     heading's own line, which yields an empty chunk between every pair.
     Requiring a literal newline and then only horizontal space gives exactly
     one split point per heading. Staying line-anchored also leaves the <h2>s
     that sit inside a card on /guides/ alone — those are link titles, not
     sections of the page. */
  const parts = main.split(/\n(?=[ \t]*<h2[\s>])/);
  let lead = /^[ \t]*<h2[\s>]/.test(parts[0]) ? '' : parts.shift();

  /* On the two hub pages, the lead also carried the search box and filter
     hub — the thing a visitor actually came to use — after the h1/lede/fact
     bar but templated ahead of an explanatory "How to search" heading. Boxed
     into .page-head's reading-width column and sitting below a screen of
     prose either way, it took a full scroll to reach. Pulling it out here
     and placing it before the first section is what actually puts the tool
     on the first screen; the explanatory text follows as normal sections. */
  let tool = '';
  const toolStart = lead.search(/<div data-table-filter/);
  if (toolStart !== -1) {
    tool = `${lead.slice(toolStart).trimEnd()}\n`;
    lead = lead.slice(0, toolStart);
  }

  /* The h1 carries its accent underline with display:inline, which makes it
     ignore the max-width that holds the rest of the column — it would run the
     full container while the lede beneath it sat narrower. Boxing the page
     header gives the title a block to be centred inside. Pages with no
     section headings at all, like /guides/, need that box just as much, so it
     is built before the early return rather than after it. */
  const head = lead.trim() ? `    <div class="page-head">\n${lead.replace(/\n+$/, '')}\n    </div>\n` : '';
  if (!parts.length) return `${head}${tool}${tail}`;

  /* A section holding the filter hub or a combo table needs the full 1180px
     the container allows — six numeric columns do not fit in a reading
     measure. Everything else is prose and reads better narrow. */
  const isWide = (chunk) => /data-table-filter|class="table-scroll"/.test(chunk);

  const wrapped = parts
    .map((chunk) => `    <section class="sect${isWide(chunk) ? ' sect--wide' : ''}">\n`
      + `${chunk.replace(/\n+$/, '')}\n    </section>`)
    .join('\n');
  return `${head}${tool}${wrapped}\n${tail}`;
}

function layout({ title, description, path, crumbs, body, extraLd = [], scripts = [], pageType = 'WebPage', sprite = false }) {
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

  // The homepage declares the Organization and WebSite nodes; every other page
  // points back at them by @id so the whole site reads as one entity.
  const pageLd = {
    '@context': 'https://schema.org',
    '@type': pageType,
    '@id': url,
    url,
    name: title,
    description,
    inLanguage: 'en',
    isPartOf: { '@id': `${SITE}/#website` },
    publisher: { '@id': `${SITE}/#organization` },
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: breadcrumbLd.itemListElement },
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
<meta property="og:image" content="${SITE}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="PalLineage — Palworld 1.0 breeding calculator, ${n(combos.combos.length)} combinations across ${pals.length} Pals">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/og-image.png">
<link rel="stylesheet" href="/assets/page.css">
<script src="/assets/theme.js"></script>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-8YNVERSW24"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-8YNVERSW24');
</script>
<script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "y31849bdc1");
</script>
${scripts.map((src) => `<script src="${src}" defer></script>`).join('\n')}
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
      <div class="nav__right">
        <button class="nav__toggle" id="navToggle" type="button" aria-expanded="false" aria-controls="navLinks" aria-label="Menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <div class="nav__links" id="navLinks">${nav}</div>
        <button class="icon-btn" id="themeToggle" type="button" aria-label="Switch color theme">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
        </button>
      </div>
    </nav>
  </div>
</header>

${sprite ? SPRITE : ''}
<main>
  <div class="wrap wrap--wide">
    <nav class="crumbs" aria-label="Breadcrumb">${trail}</nav>
${sections(body)}
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
${[pageLd, breadcrumbLd, ...extraLd].map((ld) => `<script type="application/ld+json">\n${JSON.stringify(ld)}\n</script>`).join('\n')}
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
const palCell = (p) => `<a class="p-cell" href="/breeding/${p.slug}/">${icon(p)}${esc(label(p))}</a>`;

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
    ? `<strong>${esc(label(p))}</strong> cannot be bred from two different Pals. The only pair that produces it is ${esc(label(p))} with another ${esc(label(p))}, so the first one has to be caught in the wild — after that it breeds true.`
    : `${n(parents.length)} parent ${parents.length === 1 ? 'pair produces' : 'pairs produce'} <strong>${esc(label(p))}</strong> in Palworld 1.0. They are listed cheapest first, by the combined rarity of the two parents, so the easiest way to get one is at the top.`;

  const body = `    <h1>Palworld ${esc(label(p))} Breeding Combos</h1>
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
      ${related.map((q) => `<a class="pal-card" href="/breeding/${q.slug}/">${icon(q)}<strong>${esc(label(q))}</strong><small>${pairs(parentsOf(pals.indexOf(q)).length)}</small></a>`).join('\n      ')}
    </div>` : ''}
`;

  return layout({
    // 28 of these Pals come from a single pair, so the count has to agree with
    // the noun — "All 1 Pairs" is the sort of thing a reader sees in a search
    // result and takes as a sign the page was generated and never read.
    title: `Palworld ${label(p)} Breeding Combos 1.0 — All ${n(parents.length)} Pair${parents.length === 1 ? '' : 's'}`,
    description: `Every parent combination that produces ${label(p)} in Palworld 1.0 (${dex(p)}), sorted easiest first, plus what ${label(p)} breeds into. Built from game data.`,
    path: `/breeding/${p.slug}/`,
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Breeding', href: '/breeding/' }, { label: label(p) }],
    body,
  });
}

// ---- hub listings --------------------------------------------------------
// Both hubs ship 30 items in the HTML and fetch the other 269 as a fragment
// rendered by the same template below. That keeps the pages readable at a
// glance, keeps the body text short enough for the keyword to carry weight,
// and still puts real content in front of a crawler that runs no scripts.

const SERVER_ROWS = 30;

const ELEMENT_ORDER = ['Neutral', 'Fire', 'Water', 'Electric', 'Grass', 'Ground', 'Ice', 'Dark', 'Dragon'];
const ELEMENT_COUNT = Object.fromEntries(ELEMENT_ORDER.map((e) =>
  [e, pals.filter((p) => (p.elements ?? []).includes(e)).length]));
const WORK_COUNT = Object.fromEntries(Object.keys(WORK_LABEL).map((w) =>
  [w, pals.filter((p) => p.work[w]).length]));

// Fill vs stroke per glyph, same table the calculator uses.
const EL_STYLE = { Ice: 'line', Ground: 'fill' };
const WORK_STYLE = {
  Kindling: 'fill', Watering: 'fill', Planting: 'line', GenerateElectricity: 'fill',
  Handiwork: 'fill', Gathering: 'fill', Lumbering: 'line', Mining: 'line',
  MedicineProduction: 'line', Cooling: 'line', Transporting: 'line', Farming: 'line',
};
const glyph = (id) => `<svg aria-hidden="true" viewBox="0 0 24 24"><use href="#${id}"/></svg>`;

/** Everything the client script filters on, read straight off the element. */
const dataAttrs = (p, extra = {}) => [
  `data-item`,
  `data-name="${esc(p.name)}"`,
  `data-dex="${p.dex}"`,
  `data-el="${(p.elements ?? []).join(' ')}"`,
  `data-work="${Object.keys(p.work).join(' ')}"`,
  `data-terms="${esc([...(p.elements ?? []), ...Object.keys(p.work).map((w) => WORK_LABEL[w])].join(' '))}"`,
  `data-rarity="${p.rarity}"`,
  `data-power="${p.power}"`,
  ...Object.entries(extra).map(([k, v]) => `data-${k}="${v}"`),
].join(' ');

/** /pals/ card. Element and job are glyphs; the tooltip text is an attribute,
 *  so it costs the page nothing in body copy and still reads instantly. */
function palCard(p, i) {
  const jobs = Object.entries(p.work);
  const tip = [
    (p.elements ?? []).join(' / ') || 'No element',
    `Rarity ${p.rarity}`,
    jobs.length ? jobs.map(([k, v]) => `${WORK_LABEL[k]} ${v}`).join(', ') : 'No work suitability',
  ].join(' · ');

  return `<a class="pcard" href="/breeding/${p.slug}/" ${dataAttrs(p, { pairs: parentsOf(i).length, flags: p.variant ? 'variant' : '' })} data-tip="${esc(tip)}" aria-label="${esc(`${label(p)}, ${dex(p)}. ${tip}`)}">`
    + `<img class="pcard__art" src="/assets/pals/${p.slug}.webp" alt="" width="64" height="64" loading="lazy">`
    + `<strong class="pcard__name">${esc(label(p))}</strong>`
    + `<span class="pcard__dex">${dex(p)}</span>`
    + `<span class="pcard__el">${(p.elements ?? []).map((e) =>
        `<span class="el el--${EL_STYLE[e] ?? 'fill'} el-${e}">${glyph(`e-${e}`)}</span>`).join('')}</span>`
    + (jobs.length ? `<span class="pcard__work">${jobs.map(([k, v]) =>
        `<span class="pcard__job pcard__job--${WORK_STYLE[k]} w-${k}">${glyph(`w-${k}`)}${v}</span>`).join('')}</span>` : '')
    + `</a>`;
}

/** /breeding/ row. The numbers stay in columns — comparing 1,280 against
 *  1,229 is the whole point of this page, and a grid makes that harder. */
function comboRow(p, i) {
  const count = parentsOf(i).length;
  const kids = new Set(childrenOf(i).map(([, c]) => c)).size;
  const flags = [p.variant ? 'variant' : '', count === 1 ? 'single' : ''].filter(Boolean).join(' ');
  return `<tr ${dataAttrs(p, { pairs: count, kids, flags })}>`
    + `<td>${palCell(p)}</td><td><span class="chips">${elChips(p)}</span></td>`
    + `<td class="num">${p.rarity}</td><td class="num">${n(p.power)}</td>`
    + `<td class="num">${n(count)}</td><td class="num">${n(kids)}</td></tr>`;
}

function filterBar({ search, elements = true, work = false, flags = [], sort = null }) {
  return `      <div class="filterbar">
        <div class="filterbar__top">
          <input class="filterbar__search" type="search" data-search placeholder="${esc(search)}" aria-label="${esc(search)}">
          <span class="filterbar__count"><strong data-count>${pals.length}</strong> Pals</span>
          <button class="filterbar__reset" type="button" data-reset>Reset</button>
        </div>
        ${elements ? `<div class="filterbar__row">
          <span class="filterbar__label">Element</span>
          ${ELEMENT_ORDER.map((e) => `<button class="fchip chip--${e.toLowerCase()}" type="button" data-element="${e}" aria-pressed="false">${e} <span style="opacity:.6">${ELEMENT_COUNT[e]}</span></button>`).join('\n          ')}
        </div>` : ''}
        ${work ? `<div class="filterbar__row">
          <span class="filterbar__label">Work</span>
          ${Object.keys(WORK_LABEL).map((w) => `<button class="fchip" type="button" data-work="${w}" aria-pressed="false">${WORK_LABEL[w]} <span style="opacity:.6">${WORK_COUNT[w]}</span></button>`).join('\n          ')}
        </div>` : ''}
        ${flags.length ? `<div class="filterbar__row">
          <span class="filterbar__label">Show only</span>
          ${flags.map(([key, label]) => `<button class="fchip" type="button" data-flag="${key}" aria-pressed="false">${label}</button>`).join('\n          ')}
        </div>` : ''}
        ${sort ? `<div class="filterbar__row sortbar">
          <label for="sortby">Sort</label>
          <select id="sortby" data-sortby>${sort.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>` : ''}
      </div>`;
}

const hubShell = ({ src, bar, listing }) => `    <div data-table-filter data-src="${src}" data-total="${pals.length}">
${bar}
      <div class="reveal" data-reveal>
${listing}
      </div>
      <p class="table-empty" data-empty hidden>No Pal matches those filters. <button class="filterbar__reset" type="button" data-reset>Clear them</button></p>
      <p class="reveal__more"><button type="button" data-more hidden>Show all ${pals.length}</button></p>
    </div>`;

// ---- /breeding/ -----------------------------------------------------------
const rankedByPairs = pals.map((p, i) => ({ p, i, count: parentsOf(i).length }))
  .sort((a, b) => b.count - a.count);
const singlePair = rankedByPairs.filter((r) => r.count === 1);
const medianPairs = rankedByPairs[Math.floor(rankedByPairs.length / 2)].count;

function breedingIndex() {
  const top = rankedByPairs.slice(0, 5);
  const listing = `        <div class="table-scroll">
          <table class="combo-table">
            <thead><tr>
              <th data-sort="name">Pal</th>
              <th>Element</th>
              <th class="num" data-sort="rarity">Rarity</th>
              <th class="num" data-sort="power" data-desc>Breeding power</th>
              <th class="num" data-sort="pairs" data-desc>Parent pairs</th>
              <th class="num" data-sort="kids" data-desc>Breeds into</th>
            </tr></thead>
            <tbody data-items>
${rankedByPairs.slice(0, SERVER_ROWS).map(({ p, i }) => '              ' + comboRow(p, i)).join('\n')}
            </tbody>
          </table>
        </div>`;

  const faq = [
    ['How many Palworld breeding combinations are there in 1.0?',
      `${n(combos.combos.length)}, across the ${pals.length} Pals in the v1.0 Paldeck. Two of them hatch differently depending on which parent is male and which is female; the other ${n(combos.combos.length - 2)} give the same egg either way round.`],
    ['Which Pal has the most Palworld breeding combinations?',
      `${top[0].p.name}, at ${n(top[0].count)} parent pairs — roughly one in every thirty-five combinations in the game ends in a ${top[0].p.name}. ${top[1].p.name} and ${top[2].p.name} follow with ${n(top[1].count)} and ${n(top[2].count)}.`],
    ['Do Palworld breeding combinations depend on parent order?',
      'No. A + B and B + A hatch the same Pal, which is why this page counts pairs rather than ordered combinations — counting both directions would double the number without adding a single new result.'],
    ['Which Pals cannot be bred from two different species?',
      `${singlePair.length} of them, including Frostallion, Necromus, Selyne and Xenolord. Each breeds true and nothing else: the only pair that produces one is two of the same Pal. Catch the first, and the pair sustains itself from then on. The "One pair only" filter lists all ${singlePair.length}.`],
    ['What is breeding power?',
      'A hidden number every Pal carries. The game averages the two parents’ values and hatches whichever Pal sits closest to that average, breaking ties by a fixed order. It is the column labelled Breeding power, and it is why the table has any pattern at all.'],
    ['Are these Palworld breeding combinations current?',
      'Yes. The whole set is regenerated from the v1.0 game files after each patch, so nothing here is left over from a pre-1.0 list that quietly stopped being true.'],
    ['Is there a faster way than scrolling this table?',
      'Search for the Pal you want and open its page — it lists every pair that produces it, cheapest first. If you already own two Pals and just want to know what they make, the calculator answers that in one click.'],
    ['Do variant forms have their own breeding combinations?',
      `They do, and this catches people out constantly. A variant is a separate Paldeck entry, so the Palworld breeding combinations that hatch Jormuntide Ignis share nothing with the ones that hatch Jormuntide. All ${pals.filter((p) => p.variant).length} variants are breedable; each has its own list.`],
    ['Does element or gender affect what an egg hatches into?',
      'Element does not — a Fire parent and a Water parent can produce a Grass child, because the table works off breeding power rather than typing. Gender matters for exactly two pairs in the game and nothing else; every other combination gives the same result whichever way the parents fall.'],
    ['Where does this data come from?',
      'The v1.0 game data tables, by way of an open-source project that extracts them, cross-checked against a second independent dataset. The build fails outright if the two disagree on any Pal, which is a blunt way of catching a bad import before it reaches the site.'],
  ];

  const body = `    <h1>All Palworld Breeding Combinations</h1>
    <p class="lede">All ${n(combos.combos.length)} Palworld breeding combinations in v1.0, pulled straight from the game files and laid out so you can actually use them. Search for a Pal, narrow by element, or sort by how many pairs reach it. Each row opens onto that Pal’s full list.</p>

    <div class="factbar">
      <span class="fact"><small>Breeding combinations</small>${n(combos.combos.length)}</span>
      <span class="fact"><small>Pals covered</small>${pals.length}</span>
      <span class="fact"><small>Median pairs per Pal</small>${n(medianPairs)}</span>
      <span class="fact"><small>Bred from one pair only</small>${singlePair.length}</span>
    </div>

${hubShell({
    src: '/data/hub-breeding.html',
    bar: filterBar({
      search: 'Search by name, number or element…',
      flags: [['variant', 'Variant forms'], ['single', 'One pair only']],
    }),
    listing,
  })}

    <h2>How to Search Palworld Breeding Combinations</h2>
    <p>The table above holds every Palworld breeding combination in the game, so the search box is the fastest way in. Type a name or a Paldeck number and it narrows as you go. Half-remembered spelling is fine — "anb" finds Anubis. The element chips stack, so choosing Ice and then Dragon leaves only the two Pals carrying both. <strong>Variant forms</strong> pulls up the ${pals.filter((p) => p.variant).length} Cryst, Ignis, Noct, Lux and Terra entries; <strong>One pair only</strong> isolates the ${singlePair.length} Pals breeding cannot reach from scratch. Click any column header to sort by it.</p>

    <h2>How Palworld Breeding Combinations Work</h2>
    <p>Breeding in Palworld is not a dice roll. Put a male and a female in a Breeding Farm, drop cake in the feed box, and the egg that comes out was decided before you started — the game ships a fixed table, and every one of these Palworld breeding combinations is a row in it. That is the only reason a calculator can exist.</p>
    <p>Order never matters. Pair ${top[0].p.name} with ${top[1].p.name} or ${top[1].p.name} with ${top[0].p.name} and the same egg hatches, so a pair is worth checking once and no more. Two combinations in the whole game break that rule and depend on parent gender.</p>

    <h3>Breeding power, and why the table looks random</h3>
    <p>Every Pal carries a hidden value the community calls breeding power — the column in the table above. Values run from ${n(Math.min(...pals.map((p) => p.power)))} to ${n(Math.max(...pals.map((p) => p.power)))}. The game averages the two parents’ numbers and hatches whichever Pal lands nearest that average, with a fixed priority order settling ties.</p>
    <p>One rule, ${n(combos.combos.length)} results. It explains most of them, anyway: the variant forms and a handful of set recipes are placed by hand and ignore the arithmetic entirely. The <a href="/guides/palworld-breeding-formula/">formula guide</a> walks through it with real numbers, including how far the rule actually gets you.</p>

    <h3>Where the variant forms sit</h3>
    <p>The ${pals.filter((p) => p.variant).length} variants are the exception that trips people up. Jormuntide Ignis is not Jormuntide wearing a different coat — it is a separate Paldeck entry with its own element line and its own parents, and the pairs that produce it have nothing to do with the pairs that produce the base form. So the Palworld breeding combinations for a variant have to be looked up on their own; guessing from the base Pal gets you nowhere. Use the <strong>Variant forms</strong> filter to see the whole set at once.</p>

    <h3>Reading the columns</h3>
    <p><strong>Parent pairs</strong> counts how many combinations produce that Pal — a big number means almost anything you own can get you one. <strong>Breeds into</strong> runs the other way: how many different children that Pal can father or mother. Sorting by one and then the other flips the table between "what is cheap to obtain" and "what is worth keeping around".</p>

    <h2>Which Pals Have the Most Palworld Breeding Combinations</h2>
    <p>Sort by parent pairs and the top of the list barely changes: five Pals sit far above the rest.</p>
    <ul>
      ${top.map(({ p, count }) => `<li><a href="/breeding/${p.slug}/">${esc(p.name)}</a> — ${pairs(count)}</li>`).join('\n      ')}
    </ul>
    <p>The median Pal comes from ${n(medianPairs)} of the ${n(combos.combos.length)} Palworld breeding combinations, so anything in the hundreds is genuinely easy to breed toward. If ${top[0].p.name} is what you need, you almost certainly own the parents already — check the pair you have rather than hunting for a specific recipe.</p>

    <h2>The ${singlePair.length} Pals Breeding Cannot Give You</h2>
    <p>At the far end sit ${singlePair.length} Pals produced by exactly one pair, and in nearly every case that pair is the Pal with itself. No amount of breeding conjures the first one; you have to catch it. After that the pair sustains itself, which is how people end up with a stable of Frostallions.</p>
    <div class="pal-grid pal-grid--compact">
      ${singlePair.slice(0, 8).map(({ p, i }) => `<a class="pal-card" href="/breeding/${p.slug}/">${icon(p)}<strong>${esc(label(p))}</strong><small>${pairs(parentsOf(i).length)}</small></a>`).join('\n      ')}
    </div>

    <h2>Palworld Breeding Combinations by Element</h2>
    <p>Element is a property of the Pal you are aiming at, not a rule the table follows — a Fire parent and a Water parent will happily hatch something Grass. It is still the fastest filter when you are breeding for a job rather than a specific Pal. Dark is the biggest group at ${ELEMENT_COUNT.Dark}, Grass and Water tie at ${ELEMENT_COUNT.Grass}, and Electric and Dragon are the thin ones at ${ELEMENT_COUNT.Electric} apiece. ${pals.filter((p) => (p.elements ?? []).length > 1).length} Pals carry two elements, so stacking two chips finds the overlap — a quick way to see which Palworld breeding combinations end in, say, something that both cools and flies.</p>

    <h2>Turning Palworld Breeding Combinations Into a Plan</h2>
    <p>Knowing every pair is not the same as knowing what to do next, and this is where most breeding projects go sideways. The usual mistake is starting from the Pal you want and working backwards one generation at a time, which burns cake on eggs you did not need.</p>
    <p>Work the other way. Open the target’s page and look at the cheapest pairs — they are sorted by the parents’ combined rarity, so the practical answer sits at the top rather than buried. If one of those parents is something you already own, you are one egg away and the rest of the table is noise. If it is not, take the parent you are missing and repeat: what are <em>its</em> cheapest pairs, and do you own one of those?</p>
    <p>Two or three passes usually land on something in your ranch. The Palworld breeding combinations that matter to you are a handful out of ${n(combos.combos.length)}, and they are the ones connecting what you have to what you want. Everything else on this page is context. When the chain runs more than three deep, hand it to the shortest-path tool instead — it walks the whole graph and returns the fewest eggs rather than the first route that works.</p>
    <p>One more habit worth forming: check what a Pal <em>breeds into</em> before you release a spare. A Pal with a high Breeds into count is a useful parent for projects you have not started yet, and re-catching one later costs more than the box slot it was taking up.</p>

    <h2>Palworld Breeding Combinations FAQ</h2>
    <div class="faq-list">
      ${faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n      <p>${a}</p>`).join('\n      ')}
    </div>
${SECTION_END}
    <p class="page-cta"><a class="btn btn--primary" href="/#calculator">Open the breeding calculator</a></p>
`;

  return layout({
    title: `Palworld Breeding Combinations — All ${n(combos.combos.length)} Pairs | PalLineage`,
    description: `All ${n(combos.combos.length)} Palworld breeding combinations for v1.0 in one searchable table. Filter by element, sort by how many pairs reach a Pal, open any Pal for its list.`,
    path: '/breeding/',
    pageType: 'CollectionPage',
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Breeding Combos' }],
    body,
    scripts: ['/assets/select.js', '/assets/table-filter.js'],
    extraLd: [{
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
      })),
    }],
  });
}

// ---- /pals/ ---------------------------------------------------------------
function palsIndex() {
  const variantCount = pals.filter((p) => p.variant).length;
  const dual = pals.filter((p) => (p.elements ?? []).length > 1).length;
  const workRanked = Object.entries(WORK_COUNT).sort((a, b) => b[1] - a[1]);
  const rarest = workRanked[workRanked.length - 1];

  const listing = `        <div class="pgrid" data-items data-grid>
${pals.slice(0, SERVER_ROWS).map((p, i) => '          ' + palCard(p, i)).join('\n')}
        </div>`;

  const faq = [
    ['How many Pals are in Palworld 1.0?',
      `${pals.length}, counting the ${variantCount} variant forms the Paldeck lists separately. It does list them separately, and it is right to — a Cryst form has its own element, its own stats and its own parent pairs.`],
    ['What do the work suitability numbers mean?',
      `The level a Pal works a job at, and higher is faster. ${WORK_LABEL[workRanked[0][0]]} is the most common by a distance — ${workRanked[0][1]} Pals can do it — while only ${rarest[1]} can handle ${WORK_LABEL[rarest[0]]}. Those scarce jobs are the ones worth planning a breeding project around.`],
    ['What does rarity actually affect?',
      'It rates the Pal, not the difficulty of breeding one. Plenty of high-rarity Pals come from hundreds of pairs. On this site rarity doubles as a cost signal: parent pairs are ranked by the two parents’ combined rarity, so cheap options float to the top.'],
    ['Which Pals have two elements?',
      `${dual} of them. Select two element filters at once and the grid shows only the Pals carrying both — the quickest route to an Ice/Dragon or a Fire/Dark.`],
    ['Can every Pal be bred?',
      `Nearly. ${singlePair.length} come from a single pair — themselves — so the first has to be caught. Everything else, variants included, is reachable through the <a href="/breeding/">breeding combinations</a>.`],
    ['Why do some Pals show no work icons?',
      'A few are combat-only and have no base jobs at all. They still breed normally; they just will not do anything useful back at your base.'],
    ['Which Palworld Pals are best for a new base?',
      'Anything with Handiwork and Transporting, which between them cover most of what a young base spends its time on — and they are the two most widely available jobs, so you will not have to breed for them. Kindling and Electricity are the early gaps worth planning around, since far fewer Pals can do either.'],
    ['Does this list include the variant forms?',
      `Yes, all ${variantCount} of them, listed as their own entries. Filter by <strong>Variant forms</strong> to see only those. They are separate Palworld Pals with separate stats and separate parents, not skins.`],
    ['Where do the numbers come from?',
      'The v1.0 game data tables, joined against a second independent dataset. The build refuses to finish if the two disagree about any Pal’s work suitability, so a bad import fails loudly instead of quietly shipping wrong levels.'],
  ];

  const body = `    <h1>All Palworld Pals</h1>
    <p class="lede">The full v1.0 Paldeck — ${pals.length} Palworld Pals including ${variantCount} variant forms, each with its element, rarity and every job it can work. Search by name or number, filter by element and job, and open any Pal to see how to breed one.</p>

    <div class="factbar">
      <span class="fact"><small>Pals</small>${pals.length}</span>
      <span class="fact"><small>Variant forms</small>${variantCount}</span>
      <span class="fact"><small>Dual-element</small>${dual}</span>
      <span class="fact"><small>Work types</small>${Object.keys(WORK_LABEL).length}</span>
    </div>

${hubShell({
    src: '/data/hub-pals.html',
    bar: filterBar({
      search: 'Search by name, number, element or job…',
      work: true,
      flags: [['variant', 'Variant forms']],
      sort: [['dex', 'Paldeck order'], ['name', 'Name A–Z'], ['rarity:desc', 'Rarity, high first'], ['pairs:desc', 'Easiest to breed']],
    }),
    listing,
  })}

    <h2>How to Search the Palworld Pals List</h2>
    <p>Names, Paldeck numbers, elements and job names all work as queries — type "fire" or "mining" and the grid above answers. The chips stack rather than replace each other, so Dragon plus Kindling cuts ${pals.length} Pals down to four. Hover a card for the full read-out of element, rarity and work levels; the icons on the card carry the same information at a glance once you know them.</p>

    <h2>How to Read a Palworld Pal Card</h2>
    <p>The coloured glyphs under each name are the Pal’s elements. Below them sit its jobs, each with the level it works at. A Pal showing a flame at 3 kindles a furnace faster than one at 1, and that gap is the whole reason people breed for specific Pals instead of catching whatever wanders past.</p>
    <p>Variants sit in the grid beside their base form rather than replacing it. Jormuntide and Jormuntide Ignis are two different Pals with two different element lines and two different sets of parents — looking up one tells you nothing about the other. All ${variantCount} are covered on the <a href="/mutations/">variants page</a>.</p>

    <h3>The number under the name</h3>
    <p>That is the Paldeck entry, and it doubles as a search term — typing 139 gets you Anubis without spelling it. Variants share the number of their base form, which is why you will see two cards reading #121 with different art. The Paldeck order is also the default sort here, so the grid opens the way the in-game list does rather than in some ranking you did not ask for.</p>

    <h2>Palworld Pals by Element</h2>
    <p>Nine elements cover the Paldeck, and the Palworld Pals are spread unevenly across them: ${ELEMENT_ORDER.map((e) => `${e} (${ELEMENT_COUNT[e]})`).join(', ')}. Element decides combat matchups, and for two jobs it decides eligibility outright — only a Fire Pal kindles, only a Water Pal waters. ${dual} Pals carry two, which is where the interesting combinations live: an Ice/Dragon works a cooler and still hits like a dragon.</p>

    <h2>Work Suitability in Palworld 1.0</h2>
    <p>Twelve jobs keep a base running, and 1.0 rebalanced the levels across all ${pals.length} Palworld Pals. Coverage is lopsided. ${workRanked.slice(0, 3).map(([w, c]) => `${WORK_LABEL[w]} sits at ${c} Pals`).join(', ')} — you will never struggle to staff those. At the other end, ${workRanked.slice(-3).map(([w, c]) => `${WORK_LABEL[w]} (${c})`).join(', ')} are thin enough that a good one is worth a breeding project of its own. Filter by the job, sort by how easy each option is to breed, and start from the top.</p>

    <h2>Choosing Palworld Pals for a Base Job</h2>
    <p>Most people arrive here with a gap to fill rather than a Pal in mind: the furnace is idle, or nothing on the team can plant. The grid answers that directly — filter by the job, and what is left is every Pal that can do it.</p>
    <p>Then read the levels, because they are not decoration. A Pal working Kindling at 3 feeds a furnace roughly three times as fast as one at 1, and across a full base that difference decides whether production keeps up with you or falls behind. Sort by <em>Easiest to breed</em> once you have the shortlist and the practical candidates rise to the top: among the Palworld Pals that can do a job, the one reachable from hundreds of parent pairs beats the marginally better one you would have to hunt across the map.</p>
    <p>Watch the second job slot too. A Pal covering three jobs at level 2 is often worth more at a base than a specialist at 4, because it keeps working when the queue shifts. The cards show every job a Pal has, so that trade-off is visible before you commit to breeding one.</p>

    <h2>Rarity, and What It Is Not</h2>
    <p>Rarity describes the Pal. It says nothing about how hard one is to hatch, and treating the two as the same thing is the most common mistake people make reading a list of Palworld Pals. Some rarity-8 Pals fall out of hundreds of different pairings while a common one takes a specific recipe. When you are planning, the number that matters is on the <a href="/breeding/">breeding combinations page</a>: how many pairs actually produce it.</p>

    <h2>From the Pal List to a Breeding Plan</h2>
    <p>Finding the Pal you want is the easy half. Getting one is the other half, and it is why every card here links through to that Pal’s breeding page rather than to a stat sheet.</p>
    <p>That page answers the only question that matters once you have chosen: which two Palworld Pals do you put in the farm. Pairs are listed cheapest first by the parents’ combined rarity, so if you already own something near the top you are one egg away. If the Pal you want turns out to come from a single pair — ${singlePair.length} of them do — the page says so plainly, and you know to go catch one instead of wasting cake finding out the hard way.</p>

    <h2>Palworld Pals FAQ</h2>
    <div class="faq-list">
      ${faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n      <p>${a}</p>`).join('\n      ')}
    </div>
${SECTION_END}
    <div class="card-list card-list--wide">
      <a class="guide-card" href="/breeding/"><strong>Breeding Combinations</strong><span>All ${n(combos.combos.length)} pairs, by Pal</span></a>
      <a class="guide-card" href="/mutations/"><strong>Variant Pals</strong><span>All ${variantCount} mutations, by family</span></a>
      <a class="guide-card" href="/passives/"><strong>Passive Skills</strong><span>The ${passiveIndex.length} passives guaranteed by species</span></a>
    </div>
`;

  return layout({
    title: `All ${pals.length} Palworld Pals — Elements & Rarity | PalLineage`,
    description: `Every Pal in the Palworld 1.0 Paldeck with element, rarity and all twelve work suitabilities, searchable and filterable, each linked to its breeding combinations.`,
    path: '/pals/',
    pageType: 'CollectionPage',
    crumbs: [{ label: 'Home', href: '/' }, { label: 'All Pals' }],
    body,
    scripts: ['/assets/select.js', '/assets/table-filter.js'],
    sprite: true,
    extraLd: [{
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') },
      })),
    }],
  });
}

/** The 269 items the pages do not ship inline, same templates as above. */
const hubFragments = () => [
  ['data/hub-breeding.html', rankedByPairs.slice(SERVER_ROWS).map(({ p, i }) => comboRow(p, i)).join('\n') + '\n'],
  ['data/hub-pals.html', pals.slice(SERVER_ROWS).map((p, i) => palCard(p, i + SERVER_ROWS)).join('\n') + '\n'],
];

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
        inLanguage: 'en',
        image: `${SITE}/og-image.png`,
        publisher: { '@id': `${SITE}/#organization` },
        isPartOf: { '@id': `${SITE}/#website` },
      }],
    })]);
  }

  written.push(['guides/index.html', layout({
    title: 'Palworld Breeding Guides — Formula & Calculator Tips',
    description: 'How breeding works in Palworld 1.0: the formula behind the calculator, and how to plan a breeding project.',
    path: '/guides/',
    pageType: 'CollectionPage',
    crumbs: [{ label: 'Home', href: '/' }, { label: 'Guides' }],
    body: `    <h1>Palworld Breeding Guides</h1>
    <p class="lede">What is actually going on underneath the calculator, and how to use it without wasting eggs.</p>
    <div class="card-list">
      ${entries.map((g) => `<a class="guide-card guide-card--head" href="/guides/${g.slug}/"><h2>${esc(g.h1)}</h2><span>${esc(g.description)}</span></a>`).join('\n      ')}
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
  `<a class="pal-card" href="/breeding/${p.slug}/">${icon(p)}<strong>${esc(label(p))}</strong><small>${pairs(parentsOf(pals.indexOf(p)).length)}</small></a>`;

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
    // Six of the passive names are long enough to push the full title past the
    // ~60 characters Google shows, so take the longest phrasing that fits.
    title: fit60([
      `Palworld ${skill.name} Passive — Which Pals Always Have It`,
      `Palworld ${skill.name} Passive — Which Pals Have It`,
      `Palworld ${skill.name} Passive Skill`,
    ]),
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
    pageType: 'CollectionPage',
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
    `<a class="pal-card" href="/breeding/${p.slug}/">${icon(p)}<strong>${esc(label(p))}</strong><small>${pairs(parentsOf(i).length)}</small></a>`).join('\n      ');

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
      ${f.members.map(([p, i]) => `<a class="pal-card" href="/breeding/${p.slug}/">${icon(p)}<strong>${esc(label(p))}</strong><small>${pairs(parentsOf(i).length)}</small></a>`).join('\n      ')}
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
        .map(([p, i]) => `<a class="pal-card" href="/breeding/${p.slug}/">${icon(p)}<strong>${esc(label(p))}</strong><small>${pairs(parentsOf(i).length)}</small></a>`).join('\n      ')}
    </div>

    <h2>Breed a variant</h2>
    <p>Pick the variant as your target in the <a href="/#calculator">breeding calculator</a> and it returns every pair that produces it, cheapest first. The Mutations tab lists the variant forms on their own if you would rather browse than search.</p>
`;

  return layout({
    title: `Palworld Variant Pals — All ${variants.length} Mutations in 1.0`,
    description: `Every variant Pal in Palworld 1.0 — Cryst, Ignis, Noct, Lux, Terra and the rest — with its element, rarity and how many parent pairs produce it.`,
    path: '/mutations/',
    pageType: 'CollectionPage',
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
  ...hubFragments(),
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

// /tool/calculator.html is deliberately crawlable even though it must never be
// indexed on its own. The homepage embeds it in an iframe, so a Disallow here
// would leave Googlebot rendering the homepage around an empty frame; the page
// is kept out of the index with an X-Robots-Tag header in vercel.json instead,
// which a crawler can only obey if it is allowed to fetch the file and read it.
//
// The preview build and the Vercel deployment URL are the other two copies of
// this site; both are handled by host-scoped noindex headers rather than here,
// because robots.txt is served byte-identically from every host.
files.push(['robots.txt', `User-agent: *
Allow: /

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
