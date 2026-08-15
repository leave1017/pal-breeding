/**
 * Builds the site's breeding dataset from Pal Calc (MIT), whose db.json and
 * breeding.json are generated directly from the Palworld game files.
 *
 *   Source: https://github.com/tylercamp/palcalc  (PalCalc.Model/*.json)
 *
 * Run: node scripts/build-data.mjs
 * Out: data/pals.json, data/combos.json, data/meta.json
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data');
const RAW = 'https://raw.githubusercontent.com/tylercamp/palcalc/main/PalCalc.Model';

const slugify = (name) =>
  name.toLowerCase().replace(/['".]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

const db = await getJson(`${RAW}/db.json`);
const breeding = await getJson(`${RAW}/breeding.json`);

// ---- Pals -----------------------------------------------------------------
// InternalName is the join key used by the breeding table. PalDexNo is what
// players actually search by, so both are kept.
const pals = db.Pals.map((p) => ({
  dex: p.Id.PalDexNo,
  variant: p.Id.IsVariant,
  name: p.Name,
  slug: slugify(p.Name),
  internal: p.InternalName,
  rarity: p.Rarity,
  // BreedingPower is the "CombiRank" the breeding formula averages;
  // Priority breaks ties between two equally-distant candidates.
  power: p.BreedingPower,
  powerPriority: p.BreedingPowerPriority,
})).sort((a, b) => a.dex - b.dex || Number(a.variant) - Number(b.variant));

// A few variants share their base form's display name (#12 Gumoss and its
// flower variant), which would collide at /breeding/[slug]. Disambiguate with
// the variant tag from the internal name — PlantSlime_Flower -> gumoss-flower.
const countSlugs = () =>
  pals.reduce((m, p) => m.set(p.slug, (m.get(p.slug) ?? 0) + 1), new Map());

for (const p of pals) {
  if (!p.variant || countSlugs().get(p.slug) === 1) continue;
  const tag = p.internal.split('_')[1];
  if (!tag) throw new Error(`Cannot disambiguate slug for ${p.name} (${p.internal})`);
  p.slug = `${p.slug}-${slugify(tag)}`;
}

const dupeSlugs = [...countSlugs()].filter(([, n]) => n > 1).map(([s]) => s);
if (dupeSlugs.length) throw new Error(`Slug collision, URLs would clash: ${dupeSlugs.join(', ')}`);

const indexOf = new Map(pals.map((p, i) => [p.internal, i]));

// ---- Passives -------------------------------------------------------------
// Only the passives some Pal is guaranteed to carry are useful for breeding
// planning, and the raw list contains unused test entries, so it is filtered
// down to the ones actually referenced.
const usedPassiveIds = new Set(db.Pals.flatMap((p) => p.GuaranteedPassivesInternalIds));
const passives = db.PassiveSkills
  .filter((s) => usedPassiveIds.has(s.InternalName))
  .map((s) => ({ internal: s.InternalName, name: s.Name, rank: s.Rank }))
  .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));

const passiveIndex = new Map(passives.map((s, i) => [s.internal, i]));
db.Pals.forEach((raw) => {
  const p = pals[indexOf.get(raw.InternalName)];
  p.passives = raw.GuaranteedPassivesInternalIds.map((id) => passiveIndex.get(id)).filter((i) => i !== undefined);
});

// ---- Combos ---------------------------------------------------------------
// Stored as index triples rather than names: 44k rows of strings is ~9 MB,
// the same rows as indices are ~500 KB before gzip.
const combos = [];
const gendered = []; // the handful of pairs whose child depends on parent gender
const G = { MALE: 1, FEMALE: 2 };

for (const row of breeding.Breeding) {
  const a = indexOf.get(row.Parent1InternalName);
  const b = indexOf.get(row.Parent2InternalName);
  const c = indexOf.get(row.ChildInternalName);
  if (a === undefined || b === undefined || c === undefined) {
    throw new Error(`Unknown Pal in breeding row: ${JSON.stringify(row)}`);
  }
  if (row.Parent1Gender === 'WILDCARD' && row.Parent2Gender === 'WILDCARD') {
    // Parent order never changes the child, so store each pair once.
    combos.push(a <= b ? [a, b, c] : [b, a, c]);
  } else {
    gendered.push([a, G[row.Parent1Gender] ?? 0, b, G[row.Parent2Gender] ?? 0, c]);
  }
}

const seen = new Set();
const uniqueCombos = combos.filter(([a, b]) => {
  const k = a * 1000 + b;
  return seen.has(k) ? false : (seen.add(k), true);
});

// ---- Write ----------------------------------------------------------------
const meta = {
  generatedAt: new Date().toISOString().slice(0, 10),
  source: 'https://github.com/tylercamp/palcalc (MIT) — generated from Palworld game files',
  dbVersion: db.Version,
  pals: pals.length,
  variants: pals.filter((p) => p.variant).length,
  combos: uniqueCombos.length,
  genderedCombos: gendered.length,
  guaranteedPassives: passives.length,
};

await mkdir(OUT, { recursive: true });
await writeFile(`${OUT}/pals.json`, JSON.stringify(pals));
await writeFile(`${OUT}/passives.json`, JSON.stringify(passives));
await writeFile(`${OUT}/combos.json`, JSON.stringify({ combos: uniqueCombos, gendered }));
await writeFile(`${OUT}/meta.json`, JSON.stringify(meta, null, 2));

console.table(meta);
