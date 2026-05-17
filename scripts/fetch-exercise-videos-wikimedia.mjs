#!/usr/bin/env node
/**
 * Fetch exercise demo videos from Wikimedia Commons.
 *
 * Design constraints learned from the first attempt:
 *   - Always save manifest — even for clips that existed from a prior run —
 *     so attribution is never lost when the script is re-run.
 *   - De-duplicate across exercises: if query-1 for ID-A returns the same
 *     source URL as query-0 for some earlier ID-B, skip that hit and try the
 *     next result. Two different exercises MUST NOT share the same clip.
 *   - Reject obvious off-topic matches by keyword: a clip whose title matches
 *     /satellite|orbit|whale|marine|nasa|cosmonaut|cat |dog |black hole/ is
 *     never a fitness demo.
 *
 * Output:
 *   {OUT_DIR}/{id}.(webm|mp4|ogv)
 *   {OUT_DIR}/videos-manifest.json — full metadata for every clip
 *   {OUT_DIR}/ATTRIBUTIONS.md      — human-readable credits page
 *
 * Run:
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
const MANIFEST_FILE = path.join(OUT_DIR, 'videos-manifest.json');
const ATTRIB_FILE = path.join(OUT_DIR, 'ATTRIBUTIONS.md');

const src = fs.readFileSync(EXERCISES_FILE, 'utf8');
const ids = Array.from(src.matchAll(/^\s*id:\s*'([a-z0-9-]+)'/gm)).map((m) => m[1]);

let overrides = {};
if (fs.existsSync(OVERRIDES_FILE)) {
  overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
}
const searchQuery = (id) => overrides[id] ?? id.replace(/-/g, ' ');

fs.mkdirSync(OUT_DIR, { recursive: true });

// Off-topic keyword filter — only the most obviously-non-fitness topics, so we
// don't accidentally reject borderline-generic titles.
const OFF_TOPIC = /\b(orbit|satellite|spacecraft|rover|nasa|astronaut|cosmonaut|galaxy|nebula|black.?hole|comet|mars|lunar|jupiter|europa|astronomy|doggy.style|porn|nsfw|sex tape|black.?holes|baboon|kitten|cell.division|microscope|bacteria|bacterial|virus)\b/i;

// Tokenize the search query for positive-match scoring.
const STOPWORDS = new Set(['the','a','an','of','and','in','on','for','to','with','exercise','fitness','workout','bar','gym']);
function queryTokens(q) {
  return String(q).toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function titleMatchScore(title, tokens) {
  if (!tokens.length) return 0;
  const lower = String(title).toLowerCase();
  let hits = 0;
  for (const t of tokens) if (lower.includes(t)) hits++;
  return hits / tokens.length; // 0..1
}

// Light positive filter — breaks ties when both look generic.
const FITNESS_HINT = /\b(fitness|exercise|workout|gym|bodybuild|weightlift|crossfit|dumbbell|barbell|kettlebell|pose|yoga|stretch|squat|deadlift|bench|press|curl|row|pull|push|plank|crunch|lunge|abs|abdominal|bicep|tricep|quad|glute|hamstring|calf|lat |deltoid|pec|chest|shoulder|back |leg )\b/i;

// Wikimedia Commons search.
async function searchCommons(query, limit = 10) {
  const url = `https://commons.wikimedia.org/w/api.php?` + new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `filetype:video ${query}`,
    gsrlimit: String(limit),
    gsrnamespace: '6',
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    format: 'json',
    origin: '*',
  });
  const res = await fetch(url, {
    headers: { 'User-Agent': 'giron-fetch/2.0 (https://github.com/seva1223423/giron)' },
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
      const title = String(p.title ?? '');
      return {
        title,
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
    .filter((f) => f.size < 40 * 1024 * 1024)
    .filter((f) => !f.duration || f.duration < 120)
    .filter((f) => !OFF_TOPIC.test(f.title));
}

function stripHtml(s) {
  return String(s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function download(url, outPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'giron-fetch/2.0 (https://github.com/seva1223423/giron)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return buf.length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Load existing manifest so we can keep already-assigned URLs out of the pool
// for later exercises in this run. Also lets us re-run cheaply.
let manifest = {};
if (fs.existsSync(MANIFEST_FILE)) {
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8')); } catch {}
}
const usedUrls = new Set(Object.values(manifest).map((e) => e?.url).filter(Boolean));

const report = { ok: 0, miss: [], fail: [] };

console.log(`Fetching ${ids.length} exercises from Wikimedia Commons → ${OUT_DIR}\n`);

for (const id of ids) {
  const q = searchQuery(id);
  const existingEntry = manifest[id];
  const existingOnDisk = existingEntry && fs.existsSync(path.join(OUT_DIR, existingEntry.file))
    && fs.statSync(path.join(OUT_DIR, existingEntry.file)).size > 0;
  if (existingOnDisk) {
    console.log(`✓ ${id} (manifested)`);
    report.ok++;
    continue;
  }

  process.stdout.write(`→ ${id.padEnd(30)} "${q}"  `);
  try {
    const results = await searchCommons(q, 15);
    if (results.length === 0) {
      console.log('[no match after filters]');
      report.miss.push(id);
      continue;
    }

    // Rank candidates by:
    //   (1) unused URL
    //   (2) title-vs-query token overlap (strongest signal of real relevance)
    //   (3) fitness-hint keyword in title
    const tokens = queryTokens(q);
    const ranked = results
      .filter((r) => !usedUrls.has(r.url))
      .map((r) => {
        const score = titleMatchScore(r.title, tokens) * 10
          + (FITNESS_HINT.test(r.title) ? 1 : 0);
        return { ...r, score };
      })
      .sort((a, b) => b.score - a.score);

    // If the best remaining candidate has zero token overlap AND zero fitness
    // hint, treat it as "no real match" rather than a garbage pick.
    const pick = ranked[0];
    if (!pick || pick.score === 0) {
      console.log(pick ? '[no token overlap — skip]' : '[all used / no candidates]');
      report.miss.push(id);
      continue;
    }

    usedUrls.add(pick.url);
    const ext = pick.mime === 'video/webm' ? 'webm' : pick.mime === 'video/ogg' ? 'ogv' : 'mp4';
    const fileName = `${id}.${ext}`;
    const outPath = path.join(OUT_DIR, fileName);
    const bytes = await download(pick.url, outPath);
    manifest[id] = { id, file: fileName, bytes, ...pick };
    // Write manifest progressively so a crash doesn't lose the work.
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
    console.log(`${ext} ${pick.width}×${pick.height} ${(bytes / 1024 / 1024).toFixed(1)} MB  [${pick.license}]`);
    report.ok++;
  } catch (e) {
    console.log(`[error: ${e.message}]`);
    report.fail.push(id);
  }
  await sleep(300);
}

// ── Write attribution markdown ────────────────────────────────────────────────
const entries = Object.values(manifest).sort((a, b) => a.id.localeCompare(b.id));
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
  ...entries.map((a) =>
    `| ${a.id} | ${a.title.replace(/\|/g, '\\|')} | ${(a.artist || '').replace(/\|/g, '\\|')} | ${a.license} | [link](${a.descriptionUrl}) |`
  ),
].join('\n') + '\n';
fs.writeFileSync(ATTRIB_FILE, attribMd);

console.log('\n─── Summary ─────────────────────────────');
console.log(`Downloaded: ${report.ok}`);
console.log(`No match:   ${report.miss.length}${report.miss.length ? ` (${report.miss.join(', ')})` : ''}`);
console.log(`Errors:     ${report.fail.length}${report.fail.length ? ` (${report.fail.join(', ')})` : ''}`);
console.log(`Unique URLs: ${usedUrls.size}`);
console.log(`\nManifest: ${MANIFEST_FILE}`);
console.log(`Attribution: ${ATTRIB_FILE}`);
