/**
 * Downloads a Pal portrait for every Pal into assets/pals/<slug>.webp.
 *
 * The icon URLs come from the same dataset build-data.mjs already uses for
 * elements; the images themselves are served by paldb.cc. Files are saved
 * locally rather than hot-linked, so the site does not depend on — or spend —
 * someone else's bandwidth.
 *
 * Pal artwork belongs to Pocketpair, Inc. This site is an unofficial fan
 * project and says so on every page. Fan sites commonly host this artwork, but
 * that is tolerance, not permission: the rights holder can ask for it to come
 * down. Running this script is a deliberate choice by the site owner.
 *
 * Run:  node scripts/fetch-icons.mjs          # skips files already present
 *       node scripts/fetch-icons.mjs --force  # re-downloads everything
 */

import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'assets/pals');
const HELPER =
  'https://raw.githubusercontent.com/MagitekZed/palworld-helper/main/data/pals_work_suitability.json';

const FORCE = process.argv.includes('--force');
const CONCURRENCY = 6;   // polite: this is someone else's CDN
const RETRIES = 3;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'palbreeding.net icon fetch' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) throw new Error(`not an image (${type})`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt === RETRIES) throw err;
      await sleep(attempt * 1000); // 1s, 2s
    }
  }
}

const [pals, helper] = await Promise.all([
  import(`${resolve(ROOT, 'data/pals.json')}`, { with: { type: 'json' } }).then((m) => m.default),
  fetch(HELPER).then((r) => r.json()),
]);

const iconByCode = new Map(helper.pals.map((p) => [p.code, p.icon]));
const iconByName = new Map(helper.pals.map((p) => [p.name, p.icon]));

await mkdir(OUT, { recursive: true });
const existing = new Set(await readdir(OUT));

const queue = pals
  .map((p) => ({ slug: p.slug, name: p.name, url: iconByCode.get(p.internal) ?? iconByName.get(p.name) }))
  .filter((job) => FORCE || !existing.has(`${job.slug}.webp`));

const missingUrl = queue.filter((job) => !job.url);
const jobs = queue.filter((job) => job.url);

console.log(`${pals.length} Pals · ${jobs.length} to download · ${pals.length - queue.length} already present`);

let done = 0;
let bytes = 0;
const failed = [];

async function worker() {
  for (let job; (job = jobs.shift()); ) {
    try {
      const buf = await download(job.url);
      await writeFile(resolve(OUT, `${job.slug}.webp`), buf);
      bytes += buf.length;
      done++;
      if (done % 25 === 0) console.log(`  ${done} downloaded…`);
    } catch (err) {
      failed.push(`${job.name}: ${err.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\nDownloaded ${done} icons (${(bytes / 1024 / 1024).toFixed(1)} MB) into assets/pals/`);
if (missingUrl.length) {
  console.log(`No icon URL for ${missingUrl.length}: ${missingUrl.map((j) => j.name).join(', ')}`);
}
if (failed.length) {
  console.log(`\nFailed (${failed.length}) — re-run to retry just these:`);
  failed.forEach((f) => console.log(`  ${f}`));
  process.exitCode = 1;
}
