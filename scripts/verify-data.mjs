/**
 * Verifies the shipped breeding dataset against Pal Calc's authoritative
 * game-file export — the same source build-data.mjs generates from, but pulled
 * fresh and compared row by row rather than trusted.
 *
 * What it checks, all of it exhaustively (not sampled):
 *   1. Every Pal's internal codename maps 1:1 between the two datasets.
 *   2. Every one of the ~44,849 parent pairs yields the same child.
 *   3. No pair exists on one side and not the other (extra / missing).
 *   4. The gender-dependent pairs (Wixen / Katress) match, gender and all.
 *   5. Variant flag, Paldex number and rarity agree for all 299 Pals.
 *   6. Guaranteed passives (the mutation-specific ones) agree.
 *   7. BreedingPower / priority — the numbers the game's formula runs on.
 *   8. Our dbVersion still equals Pal Calc's current Version. A mismatch here
 *      is the early warning that the game was patched and the data is stale.
 *
 * It reads the LOCAL data/ files (what the site actually ships) and the LIVE
 * palcalc files (current truth). Nothing is judged from memory. Exit code is 0
 * when everything agrees, 1 when any check fails or the versions differ — so it
 * can gate CI or a cron job.
 *
 * Run: node scripts/verify-data.mjs
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/tylercamp/palcalc/main/PalCalc.Model';

const local = async (p) => JSON.parse(await readFile(resolve(ROOT, p), 'utf8'));
async function remote(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

const problems = [];
const fail = (section, msg) => problems.push(`[${section}] ${msg}`);
const ok = (section, msg) => console.log(`  ✓ ${section}: ${msg}`);

// ---- load both sides ------------------------------------------------------
console.log('Loading local data/ and live Pal Calc export…\n');
const [pals, combos, myPassives, meta] = await Promise.all([
  local('data/pals.json'), local('data/combos.json'),
  local('data/passives.json'), local('data/meta.json'),
]);
const [db, breeding] = await Promise.all([
  remote(`${RAW}/db.json`), remote(`${RAW}/breeding.json`),
]);

const pcByInt = new Map(db.Pals.map((p) => [p.InternalName, p]));
const idx2int = pals.map((p) => p.internal);
const int2name = new Map(pals.map((p) => [p.internal, p.name]));

// ---- 0. version -----------------------------------------------------------
if (meta.dbVersion !== db.Version) {
  fail('version', `local dbVersion ${meta.dbVersion} != Pal Calc ${db.Version} — game likely patched; re-run build-data.mjs`);
} else {
  ok('version', `both ${db.Version}`);
}

// ---- 1. Pal identity map --------------------------------------------------
{
  const missing = idx2int.filter((x) => !pcByInt.has(x));
  const mySet = new Set(idx2int);
  const extra = db.Pals.map((p) => p.InternalName).filter((x) => !mySet.has(x));
  const dup = idx2int.filter((x, i) => idx2int.indexOf(x) !== i);
  if (missing.length) fail('pals', `${missing.length} local internal names not in Pal Calc: ${missing.slice(0, 5)}`);
  if (extra.length) fail('pals', `${extra.length} Pal Calc names missing locally: ${extra.slice(0, 5)}`);
  if (dup.length) fail('pals', `duplicate internal names: ${dup.slice(0, 5)}`);
  if (!missing.length && !extra.length && !dup.length) ok('pals', `${pals.length} internal names map 1:1`);
}

// ---- 2–4. breeding pairs --------------------------------------------------
{
  const parentKey = (a, b) => [a, b].sort().join('|');
  const myMap = new Map();     // parentKey -> child internal
  for (const [a, b, c] of combos.combos) myMap.set(parentKey(idx2int[a], idx2int[b]), idx2int[c]);

  const pcMap = new Map();
  const pcGendered = [];
  for (const r of breeding.Breeding) {
    if (r.Parent1Gender === 'WILDCARD' && r.Parent2Gender === 'WILDCARD') {
      pcMap.set(parentKey(r.Parent1InternalName, r.Parent2InternalName), r.ChildInternalName);
    } else {
      pcGendered.push(r);
    }
  }

  let wrong = 0, extra = 0, miss = 0;
  for (const [pk, myCh] of myMap) {
    if (!pcMap.has(pk)) { extra++; if (extra <= 20) fail('combos', `extra pair ${pk.replace('|', ' + ')} -> ${int2name.get(myCh)}`); }
    else if (pcMap.get(pk) !== myCh) {
      wrong++;
      const [a, b] = pk.split('|');
      fail('combos', `WRONG CHILD ${int2name.get(a)} + ${int2name.get(b)} | ours ${int2name.get(myCh)} | palcalc ${int2name.get(pcMap.get(pk))}`);
    }
  }
  for (const pk of pcMap.keys()) if (!myMap.has(pk)) { miss++; if (miss <= 20) fail('combos', `missing pair ${pk.replace('|', ' + ')} -> ${int2name.get(pcMap.get(pk))}`); }
  if (!wrong && !extra && !miss) ok('combos', `${myMap.size} pairs, all children match, none extra or missing`);

  // gender-dependent pairs
  const G = { MALE: 'M', FEMALE: 'F' };
  const myGen = new Set(combos.gendered.map((g) =>
    `${idx2int[g[0]]}:${g[1] === 1 ? 'M' : 'F'}+${idx2int[g[2]]}:${g[3] === 1 ? 'M' : 'F'}=>${idx2int[g[4]]}`));
  const pcGen = new Set(pcGendered.map((r) =>
    `${r.Parent1InternalName}:${G[r.Parent1Gender]}+${r.Parent2InternalName}:${G[r.Parent2Gender]}=>${r.ChildInternalName}`));
  // compare as multisets by content, order-independent on the pair
  const norm = (s) => { const [pair, child] = s.split('=>'); return pair.split('+').sort().join('+') + '=>' + child; };
  const myG = new Set([...myGen].map(norm)), pcG = new Set([...pcGen].map(norm));
  const gMiss = [...pcG].filter((x) => !myG.has(x));
  const gExtra = [...myG].filter((x) => !pcG.has(x));
  if (gMiss.length || gExtra.length) {
    gMiss.forEach((x) => fail('gendered', `missing ${x}`));
    gExtra.forEach((x) => fail('gendered', `extra ${x}`));
  } else {
    ok('gendered', `${combos.gendered.length} gender-dependent pairs match`);
  }
}

// ---- 5. variant identity --------------------------------------------------
{
  let bad = 0;
  for (const p of pals) {
    const pc = pcByInt.get(p.internal);
    if (!pc) continue;
    if (p.variant !== pc.Id.IsVariant) { bad++; fail('variant', `${p.name} variant flag ours ${p.variant} vs ${pc.Id.IsVariant}`); }
    if (p.dex !== pc.Id.PalDexNo) { bad++; fail('variant', `${p.name} dex ours ${p.dex} vs ${pc.Id.PalDexNo}`); }
    if (p.rarity !== pc.Rarity) { bad++; fail('variant', `${p.name} rarity ours ${p.rarity} vs ${pc.Rarity}`); }
  }
  if (!bad) ok('variant', `flag, dex and rarity agree for all ${pals.length} Pals (${pals.filter((p) => p.variant).length} variants)`);
}

// ---- 6. guaranteed passives ----------------------------------------------
{
  let bad = 0;
  for (const p of pals) {
    const pc = pcByInt.get(p.internal);
    if (!pc) continue;
    const mine = (p.passives || []).map((i) => myPassives[i].internal).sort();
    const theirs = (pc.GuaranteedPassivesInternalIds || []).slice().sort();
    if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
      bad++;
      fail('passives', `${p.name} guaranteed passives differ | ours [${mine}] | palcalc [${theirs}]`);
    }
  }
  if (!bad) ok('passives', `guaranteed passives agree for all Pals (${pals.filter((p) => (p.passives || []).length).length} carry one)`);
}

// ---- 7. breeding power ----------------------------------------------------
{
  let bad = 0;
  for (const p of pals) {
    const pc = pcByInt.get(p.internal);
    if (!pc) continue;
    if (p.power !== pc.BreedingPower) { bad++; fail('power', `${p.name} power ours ${p.power} vs ${pc.BreedingPower}`); }
    if (p.powerPriority !== pc.BreedingPowerPriority) { bad++; fail('power', `${p.name} priority ours ${p.powerPriority} vs ${pc.BreedingPowerPriority}`); }
  }
  if (!bad) ok('power', `BreedingPower and priority agree for all ${pals.length} Pals`);
}

// ---- verdict --------------------------------------------------------------
console.log('');
if (problems.length === 0) {
  console.log(`✅ All checks passed. Local data matches Pal Calc ${db.Version} exactly.`);
  process.exit(0);
} else {
  console.log(`❌ ${problems.length} problem(s) found:\n`);
  problems.slice(0, 60).forEach((p) => console.log('  ' + p));
  if (problems.length > 60) console.log(`  … +${problems.length - 60} more`);
  process.exit(1);
}
