#!/usr/bin/env node
/**
 * Fetch exercise demo videos from Wikimedia Commons.
 *
 * Why Wikimedia:
 *  - No API key required (open, unthrottled reasonable use)
 *  - All files are CC-BY-SA / CC-BY / PD — commercial use allowed with attribution
 *  - Decent coverage of common strength movements (Wikipedia medical/fitness pages
 *    have contributed short demonstration clips)
 *
 * Coverage is lower than Pexels (~30-50% of exercises find a match), but it needs
 * zero configuration, so it's a solid zero-cost baseline.
 *
 * Output: ./exercise-videos-wikimedia/{exercise-id}.webm (+ per-file attribution
 * recorded in ATTRIBUTIONS.md).
 *
 * Usage:
 *   node scripts/fetch-exercise-videos-wikimedia.mjs [outputDir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const EXERCISES_FILE = path.join(REPO_ROOT, 'src', 'data', 'exercises.ts');
const OVERRIDES_FILE = path.join(__dirname, 'search-overrides.json');
const OUT_DIR = path.resolve(process.argv[2] ?? './exercise-videos-wikimedia');
const ATTRIB_FILE = path.join(OUT_DIR, 'ATTRIBUTIONS.md');

const src = fs.readFileSync(EXERCISES_FILE, 'utf8');
const ids = Array.from(src.matchAll(/^\s*id:\s*'([a-z0-9-]+)'/gm)).map((m) => m[1]);

let overrides = {};
if (fs.existsSync(OVERRIDES_FILE)) {
  overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
}
const searchQuery = (id) => overrides[id] ?? id.replace(/-/g, ' ');

fs.mkdirSync(OUT_DIR, { recursive: true });

// Wikimedia Commons search: look for video files matching the query, up to 5 hits,
// sorted by relevance.
async function searchCommons(query) {
  const url = `https://commons.wikimedia.org/w/api.php?` + new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `filetype:video ${query}`,
    gsrlimit: '5',
    gsrnamespace: '6',
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    format: 'json',
    origin: '*',
  });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'iron-gym-fetch/1.0 (https://github.com/seva1223423/iron-gym)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];
  return Object.values(pages)
    .map((p) => {
      const info = p.imageinfo?.[0];
      if (!info) return null;
      const meta = info.extmetadata ?? {};
      return {
        title: p.title,
        url: info.url,
        mime: info.mime,
        size: info.size,
        width: info.width,
        height: info.height,
        duration: info.duration,
        license: meta.LicenseShortName?.value ?? 'unknown',
        artist: stripHtml(meta.Artist?.value ?? 'unknown'),
        descriptionUrl: info.descriptionurl ?? info.descriptionshorturl,
      };
    })
    .filter(Boolean)
    // Prefer webm (what Wikimedia stores natively), reasonable size (avoid 100MB+
    // Commons Encyclopedia entries), and under 90 seconds.
    .filter((f) => f.size < 30 * 1024 * 1024)
    .filter((f) => !f.duration || f.duration < 90);
}

function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function download(url, outPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'iron-gym-fetch/1.0 (https://github.com/seva1223423/iron-gym)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return buf.length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const attributions = [];
const report = { ok: 0, miss: [], fail: [] };

console.log(`Fetching ${ids.length} exercises from Wikimedia Commons → ${OUT_DIR}\n`);

for (const id of ids) {
  const q = searchQuery(id);
  const existingWebm = path.join(OUT_DIR, `${id}.webm`);
  const existingMp4 = path.join(OUT_DIR, `${id}.mp4`);
  if ((fs.existsSync(existingWebm) && fs.statSync(existingWebm).size > 0) ||
      (fs.existsSync(existingMp4) && fs.statSync(existingMp4).size > 0)) {
    console.log(`✓ ${id} (exists)`);
    report.ok++;
    continue;
  }
  process.stdout.write(`→ ${id.padEnd(30)} "${q}"  `);
  try {
    const results = await searchCommons(q);
    if (results.length === 0) {
      console.log('[no match]');
      report.miss.push(id);
      continue;
    }
    const pick = results[0];
    const ext = pick.mime === 'video/webm' ? 'webm' : pick.mime === 'video/ogg' ? 'ogv' : 'mp4';
    const outPath = path.join(OUT_DIR, `${id}.${ext}`);
    const bytes = await download(pick.url, outPath);
    attributions.push({ id, ...pick });
    console.log(`${ext} ${pick.width}×${pick.height} ${(bytes / 1024 / 1024).toFixed(1)} MB  [${pick.license}]`);
    report.ok++;
  } catch (e) {
    console.log(`[error: ${e.message}]`);
    report.fail.push(id);
  }
  // Wikimedia asks for <= 200 req/min and a descriptive User-Agent. 300ms apart
  // is generous.
  await sleep(300);
}

// ── Write attribution file ───────────────────────────────────────────────────
const attribMd = [
  '# Video attributions',
  '',
  '_Generated by `scripts/fetch-exercise-videos-wikimedia.mjs`._',
  '',
  'All videos below are from Wikimedia Commons under CC licenses. Under the',
  'CC-BY / CC-BY-SA rules we must credit the author and link to the source page',
  'when using these clips. Keep this file intact and bundle it with the app or',
  'show the contents on a "Credits" screen.',
  '',
  '| Exercise | Title | Author | License | Source |',
  '|---|---|---|---|---|',
  ...attributions.map((a) =>
    `| ${a.id} | ${a.title.replace(/\|/g, '\\|')} | ${a.artist.replace(/\|/g, '\\|')} | ${a.license} | [link](${a.descriptionUrl}) |`
  ),
].join('\n') + '\n';
fs.writeFileSync(ATTRIB_FILE, attribMd);

console.log('\n─── Summary ─────────────────────────────');
console.log(`Downloaded: ${report.ok}`);
console.log(`No match:   ${report.miss.length}${report.miss.length ? ` (${report.miss.join(', ')})` : ''}`);
console.log(`Errors:     ${report.fail.length}${report.fail.length ? ` (${report.fail.join(', ')})` : ''}`);
console.log(`\nFiles: ${OUT_DIR}`);
console.log(`Attribution: ${ATTRIB_FILE}`);
console.log('\nNext: for un-matched exercises, either:');
console.log('  - edit scripts/search-overrides.json and rerun');
console.log('  - get a PEXELS_API_KEY and run scripts/fetch-exercise-videos.mjs');
console.log('  - shoot the rest yourself');
