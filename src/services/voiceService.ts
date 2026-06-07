/**
 * Voice input — record short utterance + transcribe via Yandex SpeechKit.
 *
 * Flow:
 *   1. startRecording()  — request mic permission, start expo-av recording
 *   2. user speaks
 *   3. stopAndTranscribe() — stop, upload base64 to /api/ai/voice,
 *      receive { text } from server (server converts audio + calls Yandex)
 *
 * No native deps — uses expo-av (already bundled). OTA-deliverable.
 *
 * Server endpoint contract: POST /api/ai/voice
 *   body: { audio: string (base64), mimeType?: string }
 *   200:  { text: string }    // may be empty for silent recordings
 *   400:  { error: string }   // too short / too large / unrecognized format
 *   502/503: { error: string, code?: 'STT_FAILED' }
 */
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { api } from './api';

let recordingRef: Audio.Recording | null = null;
// Synchronous gate against concurrent startRecording() calls. Without
// this, two rapid taps both pass the `if (recordingRef)` check (it's
// still null while the first call awaits prepareToRecord), each create
// a separate Audio.Recording, and the second silently overwrites the
// first ref — sometimes corrupting native state. The flag flips before
// the first await and resets in `finally`, so concurrent invocations
// return as a no-op instead of racing.
let startInProgress = false;

/** Request mic permission (caller can pre-check via Audio.requestPermissionsAsync). */
export async function ensureMicPermission(): Promise<boolean> {
  const { status } = await Audio.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Start a new recording. Throws if mic permission denied or another
 * recording is already in progress.
 *
 * Format: HIGH_QUALITY preset (m4a/AAC on Android, m4a/AAC on iOS).
 * Server converts to LPCM 16 kHz mono via ffmpeg before forwarding
 * to Yandex SpeechKit.
 */
export async function startRecording(): Promise<void> {
  // Concurrent-start guard: if a previous startRecording() is mid-flight
  // (between its awaits), bail instead of racing. The second prepare-
  // ToRecordAsync can leave native audio state inconsistent.
  if (startInProgress) return;
  startInProgress = true;
  try {
    if (recordingRef) {
      // Caller called start twice (after the previous one finished) —
      // silently cancel the previous, log nothing.
      try { await recordingRef.stopAndUnloadAsync(); } catch { /* ignore */ }
      recordingRef = null;
    }
    const ok = await ensureMicPermission();
    if (!ok) throw new Error('mic-permission-denied');

    // Required for iOS: enable playback-or-record mode otherwise the
    // recorder fails silently. allowsRecordingIOS=true + iOS-specific
    // session config covers it.
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();
    recordingRef = recording;
  } finally {
    startInProgress = false;
  }
}

/** Cancel an in-progress recording without uploading. */
export async function cancelRecording(): Promise<void> {
  if (!recordingRef) return;
  try { await recordingRef.stopAndUnloadAsync(); } catch { /* ignore */ }
  recordingRef = null;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false });
}

export interface TranscribeResult {
  text: string;
  /** ms of audio captured — useful for UI feedback. */
  durationMs: number;
}

/**
 * Stop recording, upload to /api/ai/voice, return transcribed text.
 *
 * Throws Error('mic-permission-denied') if mic perm was revoked,
 * Error('too-short') if audio < 0.4s (likely accidental tap),
 * Error('stt-failed: ...') on server-side STT failure.
 */
export async function stopAndTranscribe(): Promise<TranscribeResult> {
  const recording = recordingRef;
  recordingRef = null;
  if (!recording) throw new Error('no-active-recording');

  let durationMs = 0;
  let uri: string | null = null;
  try {
    const status = await recording.getStatusAsync();
    durationMs = status.durationMillis ?? 0;
    await recording.stopAndUnloadAsync();
    uri = recording.getURI();
  } catch (e) {
    // Recorder bailed (e.g. screen unmounted mid-record) — surface as
    // a clean error rather than a confusing native crash.
    throw new Error('record-stop-failed');
  } finally {
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: false }).catch(() => {});
  }
  if (!uri) throw new Error('record-no-uri');
  if (durationMs < 400) throw new Error('too-short');

  // expo-av writes the file to app cache dir. Read as base64 and POST
  // to the server — small payload, < 1 MB for ~30s of m4a, fits the
  // server's 1.8 MB cap easily.
  const audio = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  // Best-effort cleanup of the temp file.
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

  // Hint the server about the container format so its ffmpeg call
  // parses correctly. expo-av defaults: m4a on both platforms.
  const mimeType = uri.endsWith('.wav') ? 'audio/wav'
    : uri.endsWith('.caf') ? 'audio/x-caf'
    : 'audio/m4a';

  try {
    const { data } = await api.post<{ text?: string; error?: string }>(
      '/ai/voice',
      { audio, mimeType },
      { timeout: 30_000 },
    );
    return { text: data.text || '', durationMs };
  } catch (e: any) {
    const serverMsg = e?.response?.data?.error;
    throw new Error('stt-failed: ' + (serverMsg || e?.message || 'unknown'));
  }
}

/** Quick check for callers that want to disable the mic button when busy. */
export function isRecording(): boolean {
  return recordingRef !== null;
}
