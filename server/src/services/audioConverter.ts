/**
 * Audio format conversion for SpeechKit input.
 *
 * expo-av on Android records AAC inside an MP4/m4a container by default;
 * iOS records LINEAR_PCM (wav) when configured but defaults to AAC too.
 * Yandex SpeechKit V1 STT only accepts LPCM / OggOpus / MP3 — m4a is
 * NOT supported. We always convert to mono 16-bit 16 kHz LPCM (the
 * format SpeechKit recommends for highest accuracy on Russian).
 *
 * Implementation: fluent-ffmpeg + ffmpeg-static (bundles the binary
 * via npm install, so Render deployment doesn't need apt-get ffmpeg).
 */
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';
import { reportError } from '../utils/errorReporter';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath as string);
}

/**
 * Convert any ffmpeg-readable audio (m4a/mp4/aac/wav/webm/...) to
 * raw LPCM mono 16 kHz suitable for Yandex SpeechKit v1 with
 * format=lpcm&sampleRateHertz=16000.
 *
 * Returns the raw PCM bytes (no WAV header) — Yandex's lpcm format
 * expects headerless 16-bit signed little-endian PCM.
 *
 * Throws on conversion failure.
 */
export async function toLpcm16k(input: Buffer, hintExtension = 'm4a'): Promise<Buffer> {
  const tmpDir = os.tmpdir();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const inPath = path.join(tmpDir, `giron-voice-${stamp}.${hintExtension.replace(/^\.+/, '')}`);
  const outPath = path.join(tmpDir, `giron-voice-${stamp}.pcm`);

  await fs.writeFile(inPath, input);

  try {
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg(inPath)
        .audioCodec('pcm_s16le')   // 16-bit signed little-endian
        .audioChannels(1)          // mono
        .audioFrequency(16000)     // 16 kHz
        .format('s16le');          // raw PCM (no container)

      // Hard kill timer — Yandex caps short-audio at 30s and the route
      // already validates buf.length, so a real conversion finishes
      // within ~3-5s. A malformed/adversarial input that makes ffmpeg
      // spin would otherwise hang an Express worker indefinitely
      // (Express has no per-request timeout by default).
      const killTimer = setTimeout(() => {
        try { cmd.kill('SIGKILL'); } catch { /* already gone */ }
        reject(new Error('ffmpeg-timeout'));
      }, 30_000);

      cmd
        .on('end', () => { clearTimeout(killTimer); resolve(); })
        .on('error', (err) => { clearTimeout(killTimer); reject(err); })
        .save(outPath);
    });
    const pcm = await fs.readFile(outPath);
    return pcm;
  } catch (e: any) {
    reportError(e, { route: 'toLpcm16k' });
    throw new Error(`Audio conversion failed: ${e?.message || 'unknown'}`);
  } finally {
    // best-effort cleanup
    fs.unlink(inPath).catch(() => {});
    fs.unlink(outPath).catch(() => {});
  }
}
