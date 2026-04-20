#!/usr/bin/env node
/**
 * Batch-normalize raw exercise videos (webm/mp4/ogv of various sizes and
 * durations) into the target format:
 *   • MP4 (H.264 + AAC silent audio)
 *   • 854×480 letterboxed, 16:9
 *   • First ~8 seconds only (stock clips are often too long)
 *   • faststart for progressive playback
 *   • Plus a JPG poster from the 1-second mark
 *
 * Uses the ffmpeg binary bundled with `imageio-ffmpeg` pip package — no
 * system-wide ffmpeg required.
 *
 * Usage:
 *   node scripts/normalize-exercise-videos.mjs \
 *     ./exercise-videos-wikimedia \
 *     ./exercise-videos-ready
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FFMPEG = process.env.FFMPEG_BIN
  || String(spawnSync('python', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())']).stdout).trim();

if (!FFMPEG || !fs.existsSync(FFMPEG)) {
  console.error('ffmpeg binary not found. pip install imageio-ffmpeg');
  process.exit(1);
}
console.log('ffmpeg:', FFMPEG);

const srcDir = path.resolve(process.argv[2] ?? './exercise-videos-wikimedia');
const dstDir = path.resolve(process.argv[3] ?? './exercise-videos-ready');
fs.mkdirSync(dstDir, { recursive: true });

const VF = 'scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2';

const stats = { ok: 0, skip: 0, fail: [] };

for (const name of fs.readdirSync(srcDir).sort()) {
  if (!/\.(webm|mp4|mov|ogv|mkv)$/i.test(name)) continue;
  const id = name.replace(/\.[^.]+$/, '');
  const src = path.join(srcDir, name);
  const outMp4 = path.join(dstDir, `${id}.mp4`);
  const outJpg = path.join(dstDir, `${id}.jpg`);

  if (fs.existsSync(outMp4) && fs.statSync(outMp4).size > 10_000) {
    stats.skip++;
    process.stdout.write(`✓ ${id} (exists)\n`);
    continue;
  }

  process.stdout.write(`→ ${id.padEnd(30)} `);
  // Encode MP4: H.264 veryfast for speed, silent AAC audio so iOS/Android
  // always have an audio track to decode (some players choke on video-only).
  // -ss/-t must appear BEFORE the -i they bind to (input options). We use
  // two inputs: the source clip and a silent AAC anullsrc.
  const mp4Res = spawnSync(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-ss', '0', '-t', '8', '-i', src,
    '-f', 'lavfi', '-t', '8', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', VF,
    '-r', '24',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-shortest',
    '-movflags', '+faststart',
    outMp4,
  ], { encoding: 'utf8' });
  if (mp4Res.status !== 0) {
    process.stdout.write(`[mp4 error]\n`);
    if (mp4Res.stderr) process.stdout.write(mp4Res.stderr.slice(-200) + '\n');
    stats.fail.push(id);
    continue;
  }

  // Poster from 1-second mark.
  const jpgRes = spawnSync(FFMPEG, [
    '-y', '-loglevel', 'error',
    '-i', outMp4,
    '-ss', '00:00:01', '-vframes', '1', '-q:v', '3',
    outJpg,
  ], { encoding: 'utf8' });
  const jpgOk = jpgRes.status === 0;

  const size = fs.statSync(outMp4).size;
  process.stdout.write(`${(size / 1024 / 1024).toFixed(1)} MB${jpgOk ? ' +jpg' : ''}\n`);
  stats.ok++;
}

console.log('\n─── Summary ─────────────────────────────');
console.log(`Encoded:  ${stats.ok}`);
console.log(`Skipped:  ${stats.skip}`);
console.log(`Failed:   ${stats.fail.length}${stats.fail.length ? ' (' + stats.fail.join(', ') + ')' : ''}`);
console.log(`\nOutput: ${dstDir}`);
console.log(`Total size: ${Math.round(totalSize(dstDir) / 1024 / 1024)} MB`);

function totalSize(dir) {
  let total = 0;
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isFile()) total += st.size;
  }
  return total;
}
