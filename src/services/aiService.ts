import { api, BASE_URL } from './api';
import { Platform } from 'react-native';
import { ChatMessage } from '../types';
import { tokenStorage } from '../utils/secureStorage';
import { reportError } from '../utils/errorReporter';

// Round 275: cap SSE-parse-failure reports per session at 3. Without a
// cap, a single bad streaming response produces hundreds of error-events
// (one per dropped chunk) which would overwhelm Sentry's quota and
// drown out other signal. 3 is enough to identify "AI streaming format
// regressed" without flooding.
let sseParseFailReports = 0;
const SSE_PARSE_FAIL_REPORT_LIMIT = 3;
function reportSseParseOnce(err: unknown, where: string): void {
  if (sseParseFailReports >= SSE_PARSE_FAIL_REPORT_LIMIT) return;
  sseParseFailReports += 1;
  reportError(err instanceof Error ? err : new Error(String(err)), {
    screen: 'ai-service',
    tags: { op: 'sse-parse', where },
  });
}

export interface FoodAnalysisItem {
  name: string;
  weightGrams: number;
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
  confidence?: number;
}

export interface FoodAnalysisResult {
  items: FoodAnalysisItem[];
  /** Server-side sanity check flags. Present on successful /analyze-food and
   *  /analyze-food-text responses. Empty array means the response looks
   *  physically plausible; otherwise each flag points at a specific concern. */
  sanityFlags?: Array<'kcal_per_100g' | 'kcal_per_item' | 'total_kcal'>;
  totalCalories?: number;
  totalProtein?: number;
  totalFats?: number;
  totalCarbs?: number;
  confidence?: number | null;
}

export interface AIActionResult {
  type: string;
  description: string;
  data?: Record<string, unknown>;
}

export interface AIMeta {
  mood?: string;
  recovery?: number;
  streak?: number;
  contextTokens?: number;
  responseTokens?: number;
  toolCalls?: number;
  milestones?: string[];
  newPRs?: string[];
}

export interface AIStarter {
  emoji: string;
  text: string;
  action?: string;
}

// Mistral cold-start + 70k-token system prompt + tool-call round trip means
// /ai/chat can legitimately take 30-60s on the first request after Render
// wakes the server. The default 15s axios timeout was rejecting genuine
// responses and causing the AIChatScreen "stream failed → fallback to
// chat → fallback also times out" path to surface a misleading "проверь
// подключение" error. 60s matches the server-side AbortController in
// services/deepseekAI.ts (CLAUDE.md: "AI insights timeout — AbortController
// 12s + fallback" was the OLD value before the system prompt grew).
const AI_REQUEST_TIMEOUT_MS = 60_000;

export const aiService = {
  async chat(
    message: string,
    nutritionTargets?: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl: number },
    waterMl?: number,
    weekPlan?: Record<number, { name: string; emoji: string; exercises: string[] } | null>,
    activeWorkout?: {
      name: string;
      startedAt?: string;
      exercises: Array<{ name: string; sets: Array<{ completed: boolean; weight?: number; reps?: number; rpe?: number }> }>;
    } | null,
    cardioSessions?: Array<{ type: string; date: string; durationMinutes: number; distanceKm?: number; caloriesBurned?: number; avgHeartRate?: number }>,
    sleepEntries?: Array<{ date: string; durationHours: number; quality?: number | null }>,
    clientDate?: string,
  ): Promise<{ message: string; actions: AIActionResult[]; meta?: AIMeta }> {
    const clientHour = new Date().getHours();
    const { data } = await api.post(
      '/ai/chat',
      { message, nutritionTargets, waterMl, weekPlan, activeWorkout, cardioSessions, sleepEntries, clientDate, clientHour },
      { timeout: AI_REQUEST_TIMEOUT_MS },
    );
    return { message: data.message, actions: data.actions ?? [], meta: data.meta };
  },

  async *chatStream(
    message: string,
    nutritionTargets?: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl: number },
    waterMl?: number,
    weekPlan?: Record<number, { name: string; emoji: string; exercises: string[] } | null>,
    activeWorkout?: {
      name: string;
      startedAt?: string;
      exercises: Array<{ name: string; sets: Array<{ completed: boolean; weight?: number; reps?: number; rpe?: number }> }>;
    } | null,
    cardioSessions?: Array<{ type: string; date: string; durationMinutes: number; distanceKm?: number; caloriesBurned?: number; avgHeartRate?: number }>,
    onDone?: (result: { actions: AIActionResult[]; meta?: AIMeta }) => void,
    sleepEntries?: Array<{ date: string; durationHours: number; quality?: number | null }>,
    clientDate?: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string> {
    const clientHour = new Date().getHours();
    const token = await tokenStorage.getAccessToken();
    const response = await fetch(`${BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, nutritionTargets, waterMl, weekPlan, cardioSessions, sleepEntries, stream: true, clientDate, clientHour }),
      signal,
    });

    if (!response.ok) throw new Error(`AI stream error ${response.status}`);

    // React Native may not support ReadableStream — fallback to text parsing
    if (!response.body || typeof response.body.getReader !== 'function') {
      // Fallback: read entire response as text and parse SSE events
      const text = await response.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        try {
          const parsed = JSON.parse(data) as { type: string; content?: string; actions?: AIActionResult[]; meta?: AIMeta };
          if (parsed.type === 'chunk' && parsed.content) {
            yield parsed.content;
          } else if (parsed.type === 'done') {
            onDone?.({ actions: parsed.actions ?? [], meta: parsed.meta });
          }
        } catch (err) {
          // Round 275: tell Sentry once per session if SSE chunks
          // start failing to parse. Skipping silently masked the
          // upstream regression on Mistral's streaming format.
          reportSseParseOnce(err, 'fetch-fallback');
        }
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return undefined;
      const data = line.slice(6).trim();
      try {
        return JSON.parse(data) as { type: string; content?: string; actions?: AIActionResult[]; meta?: AIMeta };
      } catch (err) {
        // Round 275: capped reportError for streaming parse regression visibility.
        reportSseParseOnce(err, 'reader-stream');
        return undefined;
      }
    };

    try {
      while (true) {
        if (signal?.aborted) {
          // Best effort: tell the server-side fetch to disconnect. Some RN polyfills
          // ignore cancel() — the `signal` on fetch() above is the primary mechanism.
          try { await reader.cancel(); } catch { /* ignore */ }
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const parsed = processLine(line);
          if (!parsed) continue;
          if (parsed.type === 'chunk' && parsed.content) yield parsed.content;
          else if (parsed.type === 'done') onDone?.({ actions: parsed.actions ?? [], meta: parsed.meta });
        }
      }
      // Flush any remaining buffer content after stream ends
      if (buffer.trim()) {
        const parsed = processLine(buffer);
        if (parsed?.type === 'done') onDone?.({ actions: parsed.actions ?? [], meta: parsed.meta });
      }
    } finally {
      reader.releaseLock();
    }
  },

  async getStarters(clientDate?: string, clientHour?: number): Promise<AIStarter[]> {
    try {
      const params: Record<string, string | number> = {};
      if (clientDate) params.clientDate = clientDate;
      if (clientHour !== undefined) params.clientHour = clientHour;
      const { data } = await api.get('/ai/starters', { params });
      return data.starters ?? [];
    } catch {
      return [];
    }
  },

  async analyzeFood(
    imageBase64: string,
    signal?: AbortSignal,
    mimeType = 'image/jpeg',
    typicalPortions?: Record<string, number>,
    mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  ): Promise<FoodAnalysisResult> {
    try {
      // Vision API call — same long-latency category as /ai/chat. Pass
      // both the AbortSignal (for user cancellation via the cancel
      // button) and the longer timeout (for legitimate slow responses).
      // clientTzOffsetMinutes is the user's UTC offset in signed
      // minutes (Moscow=+180, Vladivostok=+600, LA=-480). The server
      // uses it to align the daily-quota floor to the user's local
      // midnight rather than UTC midnight — without this, RU users
      // hit weird reset times 2-12 hours past their local midnight.
      // `-getTimezoneOffset()` is the standard sign convention here
      // (JS getTimezoneOffset returns inverted sign by historical
      // accident; we negate so positive = east of UTC).
      const clientTzOffsetMinutes = -new Date().getTimezoneOffset();
      // Round 248: send the user's median portion sizes (per food name)
      // from their last 30 days of meal history. AI uses this as a
      // calibration signal when the photo's portion is ambiguous —
      // a user who consistently logs 200g chicken should get 200g
      // estimated for their next photo, not the model's generic 150g
      // default. Cap at 30 most-relevant entries to keep the prompt
      // block ≤1KB.
      const tpEntries = typicalPortions ? Object.entries(typicalPortions).slice(0, 30) : null;
      const typicalPortionsBody = tpEntries && tpEntries.length > 0
        ? Object.fromEntries(tpEntries)
        : undefined;
      const { data } = await api.post(
        '/ai/analyze-food',
        { imageBase64, mimeType, clientTzOffsetMinutes, typicalPortions: typicalPortionsBody, mealType },
        { signal, timeout: AI_REQUEST_TIMEOUT_MS },
      );
      return data;
    } catch (e: any) {
      // 422: vision failed, server provides a suggestion text for the user
      if (e?.response?.status === 422) {
        const payload = e.response.data ?? {};
        const err: any = new Error(payload.error || 'Не удалось распознать еду на фото');
        err.suggestion = payload.suggestion ?? null;
        err.retryable = payload.retryable ?? true;
        err.status = 422;
        throw err;
      }
      // 400: validation error (bad image format, oversize payload, etc.)
      // The server's Zod messages are in Russian and user-facing, so
      // surface them through the same `suggestion` shape the screen's
      // error card already renders. Marked non-retryable because the
      // same payload would fail validation again — user needs to pick
      // a different image or shorten input.
      if (e?.response?.status === 400) {
        const payload = e.response.data ?? {};
        const err: any = new Error(payload.error || 'Неверный формат изображения');
        err.suggestion = payload.error || 'Попробуй другое изображение.';
        err.retryable = false;
        err.status = 400;
        throw err;
      }
      throw e;
    }
  },

  /** Parse a free-text meal description into KBJU-annotated FoodItem[].
   *  Shares the daily scan quota with /analyze-food on the server. Errors
   *  surface with the same { suggestion, retryable } shape as the vision
   *  path so callers can reuse UI error cards unchanged. */
  async analyzeFoodText(
    description: string,
    signal?: AbortSignal,
    typicalPortions?: Record<string, number>,
    mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  ): Promise<FoodAnalysisResult> {
    try {
      // See analyzeFood for rationale on clientTzOffsetMinutes.
      const clientTzOffsetMinutes = -new Date().getTimezoneOffset();
      // Parity with analyzeFood (round 248): pass user's habitual portion
      // sizes so the AI defers to the user's median when the description
      // omits weight ("съел курицу" → estimate from user's 200g median,
      // not the prompt's generic 150g default).
      const tpEntries = typicalPortions ? Object.entries(typicalPortions).slice(0, 30) : null;
      const typicalPortionsBody = tpEntries && tpEntries.length > 0
        ? Object.fromEntries(tpEntries)
        : undefined;
      const { data } = await api.post(
        '/ai/analyze-food-text',
        { description, clientTzOffsetMinutes, typicalPortions: typicalPortionsBody, mealType },
        { signal, timeout: AI_REQUEST_TIMEOUT_MS },
      );
      return data;
    } catch (e: any) {
      if (e?.response?.status === 422) {
        const payload = e.response.data ?? {};
        const err: any = new Error(payload.error || 'Не удалось распознать описание');
        err.suggestion = payload.suggestion ?? null;
        err.retryable = payload.retryable ?? true;
        err.status = 422;
        throw err;
      }
      // 400: validation (description too short / too long). See analyzeFood
      // for the rationale on the suggestion / retryable shape.
      if (e?.response?.status === 400) {
        const payload = e.response.data ?? {};
        const err: any = new Error(payload.error || 'Описание не подходит');
        err.suggestion = payload.error || 'Опиши блюдо короче или подробнее.';
        err.retryable = false;
        err.status = 400;
        throw err;
      }
      throw e;
    }
  },

  async getChatHistory(limit = 100, page = 1): Promise<{ messages: ChatMessage[]; total: number; pages: number }> {
    const { data } = await api.get('/ai/history', { params: { limit, page } });
    if (Array.isArray(data)) {
      return { messages: data, total: data.length, pages: 1 };
    }
    return { messages: data.messages ?? [], total: data.total ?? 0, pages: data.pages ?? 1 };
  },

  async getWorkoutInsights(workout: {
    name: string;
    durationMinutes: number;
    totalVolume?: number;
    notes?: string;
    exercises: Array<{
      name: string;
      sets: Array<{ weight?: number; reps?: number; completed?: boolean; rpe?: number }>;
    }>;
  }, signal?: AbortSignal): Promise<string> {
    // Workout insights also routes through Mistral — same long-latency
    // pattern. Bumped from 15s default to 60s to avoid timing out on
    // legitimate slow responses (esp. cold-start after Render wake).
    const { data } = await api.post('/ai/workout-insights', { workout }, { signal, timeout: AI_REQUEST_TIMEOUT_MS });
    return data.insights as string;
  },
};
