#!/usr/bin/env node
/**
 * Fetch stock demo videos for every exercise in src/data/exercises.ts from
 * free commercial-use sources (Pexels primary, Pixabay fallback).
 *
 * Usage:
 *   export PEXELS_API_KEY="…"        # get a free key at pexels.com/api (30 sec)
 *   export PIXABAY_API_KEY="…"        # optional fallback — pixabay.com/api/docs
 *   node scripts/fetch-exercise-videos.mjs [outputDir]
 *
 * Output files land in ./exercise-videos-raw/ by default:
 *   bench-press.mp4, squat.mp4, deadlift.mp4, ...
 *
 * Then run scripts/process-exercise-videos.sh to normalize + poster:
 *   ./scripts/process-exercise-videos.sh ./exercise-videos-raw ./exercise-videos-ready
 *
 * Then upload with aws s3 sync (see docs/MEDIA_HOSTING.md).
 *
 * Notes:
 *  - Pexels License allows commercial use with no attribution required.
 *  - Pixabay Content License — same.
 *  - Rate limits: Pexels 200 req/hour, 20000/month (free). We need 71 requests,
 *    so one run is well within the limit.
 *  - Quality of results varies: a bad search hit will still be some fitness
 *    video, not necessarily the exact exercise. Review the downloads visually
 *    before uploading — override misses via scripts/search-overrides.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const EXERCISES_FILE = path.join(REPO_ROOT, 'src', 'data', 'exercises.ts');
const OVERRIDES_FILE = path.join(__dirname, 'search-overrides.json');
const DEFAULT_OUT_DIR = path.resolve(process.argv[2] ?? './exercise-videos-raw');

const PEXELS_KEY = process.env.PEXELS_API_KEY;
const PIXABAY_KEY = process.env.PIXABAY_API_KEY;

if (!PEXELS_KEY && !PIXABAY_KEY) {
  console.error('Error: set PEXELS_API_KEY and/or PIXABAY_API_KEY before running.');
  console.error('Pexels: https://www.pexels.com/api/ — free, 30-second signup.');
  console.error('Pixabay: https://pixabay.com/api/docs/ — free, also 30 seconds.');
  process.exit(1);
}

// ── Read exercise IDs from src/data/exercises.ts ─────────────────────────────
const src = fs.readFileSync(EXERCISES_FILE, 'utf8');
const ids = Array.from(src.matchAll(/^\s*id:\s*'([a-z0-9-]+)'/gm)).map((m) => m[1]);
if (ids.length === 0) {
  console.error('No exercise IDs found in', EXERCISES_FILE);
  process.exit(1);
}
console.log(`Found ${ids.length} exercises in ${path.relative(REPO_ROOT, EXERCISES_FILE)}`);

// Per-exercise search-string overrides (some IDs translate poorly).
// Example: { "dumbbell-fly": "chest dumbbell fly exercise" }
let overrides = {};
if (fs.existsSync(OVERRIDES_FILE)) {
  overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
}
const searchQuery = (id) => overrides[id] ?? id.replace(/-/g, ' ') + ' exercise';

fs.mkdirSync(DEFAULT_OUT_DIR, { recursive: true });

// ── Pexels Videos API ────────────────────────────────────────────────────────
async function searchPexels(query) {
  if (!PEXELS_KEY) return null;
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape&size=small`;
  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
  if (!res.ok) {
    console.warn(`  Pexels search failed: ${res.status} ${res.statusText}`);
    return null;
  }
  const data = await res.json();
  const vids = data.videos ?? [];
  if (vids.length === 0) return null;
  // Prefer a 480p landscape file; fall back to the smallest sd file.
  for (const v of vids) {
    const files = (v.video_files ?? [])
      .filter((f) => f.file_type === 'video/mp4' && f.width && f.height && f.width >= f.height)
      .sort((a, b) => Math.abs(a.height - 480) - Math.abs(b.height - 480));
    const pick = files.find((f) => f.height <= 720) ?? files[0];
    if (pick) return { url: pick.link, width: pick.width, height: pick.height, source: 'pexels', pageUrl: v.url };
  }
  return null;
}

// ── Pixabay Videos API (fallback) ────────────────────────────────────────────
async function searchPixabay(query) {
  if (!PIXABAY_KEY) return null;
  const url = `https://pixabay.com/api/videos/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&per_page=3&video_type=film`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  Pixabay search failed: ${res.status} ${res.statusText}`);
    return null;
  }
  const data = await res.json();
  const hits = data.hits ?? [];
  if (hits.length === 0) return null;
  const hit = hits[0];
  // Pixabay returns tiny/small/medium/large. 'small' ~640×360, 'medium' ~1280×720.
  const pick = hit.videos.small ?? hit.videos.tiny ?? hit.videos.medium;
  if (!pick?.url) return null;
  return { url: pick.url, width: pick.width, height: pick.height, source: 'pixabay', pageUrl: hit.pageURL };
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return buf.length;
}

// ── Main loop ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { ok: [], miss: [], fail: [] };

for (const id of ids) {
  const outPath = path.join(DEFAULT_OUT_DIR, `${id}.mp4`);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    console.log(`✓ ${id} (already downloaded, skip)`);
    report.ok.push(id);
    continue;
  }
  const q = searchQuery(id);
  process.stdout.write(`→ ${id.padEnd(28)} "${q}"  `);
  try {
    let pick = await searchPexels(q);
    if (!pick) pick = await searchPixabay(q);
    if (!pick) {
      console.log('[no match]');
      report.miss.push(id);
      continue;
    }
    const bytes = await download(pick.url, outPath);
    console.log(`${pick.source} ${pick.width}×${pick.height} ${(bytes / 1024 / 1024).toFixed(1)} MB`);
    report.ok.push(id);
  } catch (e) {
    console.log(`[error: ${e.message}]`);
    report.fail.push(id);
  }
  // Politeness: stay under 5 req/sec to respect both APIs' rate limits.
  await sleep(250);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─── Summary ─────────────────────────────');
console.log(`Downloaded: ${report.ok.length}`);
console.log(`No match:   ${report.miss.length}${report.miss.length ? ` (${report.miss.join(', ')})` : ''}`);
console.log(`Errors:     ${report.fail.length}${report.fail.length ? ` (${report.fail.join(', ')})` : ''}`);
console.log(`\nFiles: ${DEFAULT_OUT_DIR}`);
if (report.miss.length > 0) {
  console.log('\nFor exercises with no match: edit scripts/search-overrides.json,');
  console.log('provide a better search string, and re-run. Already-downloaded files are skipped.');
}
console.log('\nNext:');
console.log(`  ./scripts/process-exercise-videos.sh ${DEFAULT_OUT_DIR} ./exercise-videos-ready`);
