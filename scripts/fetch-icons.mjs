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

// A bare script user-agent gets 403'd by most image CDNs, so identify as a
// browser loading the image from the page it belongs to.
const HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  accept: 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://paldb.cc/',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(url) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
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
  // Partial failures are normal — the grid falls back to a number tile and the
  // next run retries only what is still missing. Group by cause so a blanket
  // block (403 for every Pal) is obvious rather than buried in 299 lines.
  const byReason = failed.reduce((m, f) => {
    const reason = f.slice(f.indexOf(': ') + 2);
    return m.set(reason, (m.get(reason) ?? 0) + 1);
  }, new Map());
  console.log(`\nFailed: ${failed.length}. Re-run to retry just these.`);
  [...byReason].sort((a, b) => b[1] - a[1]).forEach(([reason, n]) => console.log(`  ${n} x ${reason}`));
  console.log(`  first few: ${failed.slice(0, 5).join(' | ')}`);
}

// Only a run that downloaded nothing at all is a failure worth stopping for.
if (done === 0 && jobs.length === 0 && queue.length > 0) {
  console.error('\nEvery download failed — nothing to commit.');
  process.exitCode = 1;
}
