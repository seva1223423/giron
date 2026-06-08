/**
 * Yandex SpeechKit STT client — short audio recognition (v1 REST).
 *
 * https://yandex.cloud/docs/speechkit/stt/request
 *
 * Auth: API key (preferred over IAM token — no expiration).
 *   1. Yandex Cloud Console → Service accounts → create account
 *   2. Assign role `ai.speechkit-stt.user`
 *   3. Create API key → save → set env YANDEX_SPEECHKIT_API_KEY
 *
 * Cost (May 2026): 5,000 STT requests/month free, then 6 коп per 15 sec.
 * Solo founder volume (~100 voice msgs/month) = free tier indefinitely.
 *
 * Format requirements: lpcm (raw PCM), oggopus, or mp3. We always
 * pass LPCM 16-bit mono 16 kHz — the most compatible format and
 * matches what audioConverter.ts produces.
 */
import { logger } from '../utils/logger';
import { reportError } from '../utils/errorReporter';

const STT_URL = 'https://stt.api.cloud.yandex.net/speech/v1/stt:recognize';
/** Default folder id when none is configured — Yandex auto-picks a billing folder. */
const DEFAULT_FOLDER_ID = process.env.YANDEX_FOLDER_ID || '';

export interface TranscribeOptions {
  /** Raw audio bytes — must be 16-bit signed LPCM at 16 kHz mono. */
  audio: Buffer;
  /** Default 'ru-RU'. SpeechKit supports ru-RU, en-US, tr-TR, kk-KK, uz-UZ. */
  lang?: string;
}

export interface TranscribeResult {
  ok: true;
  text: string;
}

export interface TranscribeError {
  ok: false;
  /** HTTP status from Yandex when available, else 0 for transport errors. */
  status: number;
  /** Human-readable error for the caller / user. */
  error: string;
}

/**
 * Send LPCM audio to Yandex SpeechKit and return transcribed text.
 *
 * Throws nothing — always returns an envelope. Caller decides how to
 * surface failures (e.g. AppModal vs silently fall back to text input).
 */
export async function yandexTranscribe(opts: TranscribeOptions): Promise<TranscribeResult | TranscribeError> {
  const apiKey = process.env.YANDEX_SPEECHKIT_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      error: 'YANDEX_SPEECHKIT_API_KEY не настроен на сервере',
    };
  }

  const params = new URLSearchParams({
    lang: opts.lang || 'ru-RU',
    format: 'lpcm',
    sampleRateHertz: '16000',
  });
  if (DEFAULT_FOLDER_ID) params.set('folderId', DEFAULT_FOLDER_ID);

  const url = `${STT_URL}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Api-Key ${apiKey}`,
        'Content-Type': 'application/octet-stream',
      },
      // Node's fetch accepts a Buffer/Uint8Array body at runtime, but the global
      // `BodyInit` type isn't present in every @types/node patch (CI floats ^22.x and
      // a newer patch dropped it — TS2304). Cast to `any` so the build is independent
      // of that floating global; the runtime behaviour is unchanged.
      body: opts.audio as any,
      // Yandex docs: short utterance recognition is sync, < 30s of audio
      // → 1 MB payload max, ~5s round-trip. Cap our timeout above their
      // worst-case so VPN / cold-net latency doesn't kill genuine slow runs.
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      // Yandex returns JSON error like { error_code, error_message }
      let body: any = {};
      try { body = await res.json(); } catch { /* ignore */ }
      const msg = body?.error_message || body?.message || `HTTP ${res.status}`;
      logger.warn('[yandexTranscribe] non-OK response', { status: res.status, body });
      return {
        ok: false,
        status: res.status,
        error: msg,
      };
    }
    const data = (await res.json()) as { result?: string };
    const text = (data.result || '').trim();
    return { ok: true, text };
  } catch (e: any) {
    reportError(e, { route: 'yandexTranscribe' });
    return {
      ok: false,
      status: 0,
      error: e?.message || 'Не удалось связаться с Yandex SpeechKit',
    };
  }
}
