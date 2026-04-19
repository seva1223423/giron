import { api } from './api';
import { Platform } from 'react-native';
import { ChatMessage } from '../types';
import { useAuthStore } from '../store/useAuthStore';

const BASE_URL = 'https://iron-gym-swoe.onrender.com/api';

function getAuthToken(): string | null {
  return useAuthStore.getState().token ?? null;
}

export interface FoodAnalysisItem {
  name: string;
  weightGrams: number;
  calories: number;
  protein: number;
  fats: number;
  carbs: number;
}

export interface FoodAnalysisResult {
  items: FoodAnalysisItem[];
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

export const aiService = {
  async chat(
    message: string,
    nutritionTargets?: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl: number },
    waterMl?: number,
    weekPlan?: Record<number, { name: string; emoji: string; exercises: string[] } | null>,
    cardioSessions?: Array<{ type: string; date: string; durationMinutes: number; distanceKm?: number; caloriesBurned?: number; avgHeartRate?: number }>,
    sleepEntries?: Array<{ date: string; durationHours: number; quality?: number | null }>,
    clientDate?: string,
  ): Promise<{ message: string; actions: AIActionResult[]; meta?: AIMeta }> {
    const clientHour = new Date().getHours();
    const { data } = await api.post('/ai/chat', { message, nutritionTargets, waterMl, weekPlan, cardioSessions, sleepEntries, clientDate, clientHour });
    return { message: data.message, actions: data.actions ?? [], meta: data.meta };
  },

  async *chatStream(
    message: string,
    nutritionTargets?: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl: number },
    waterMl?: number,
    weekPlan?: Record<number, { name: string; emoji: string; exercises: string[] } | null>,
    cardioSessions?: Array<{ type: string; date: string; durationMinutes: number; distanceKm?: number; caloriesBurned?: number; avgHeartRate?: number }>,
    onDone?: (result: { actions: AIActionResult[]; meta?: AIMeta }) => void,
    sleepEntries?: Array<{ date: string; durationHours: number; quality?: number | null }>,
    clientDate?: string,
  ): AsyncGenerator<string> {
    const clientHour = new Date().getHours();
    const token = getAuthToken();
    const response = await fetch(`${BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, nutritionTargets, waterMl, weekPlan, cardioSessions, sleepEntries, stream: true, clientDate, clientHour }),
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
        } catch { /* skip malformed */ }
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
      } catch { return undefined; }
    };

    try {
      while (true) {
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

  async analyzeFood(imageBase64: string, signal?: AbortSignal): Promise<FoodAnalysisResult> {
    try {
      const { data } = await api.post('/ai/analyze-food', { imageBase64 }, { signal });
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
    const { data } = await api.post('/ai/workout-insights', { workout }, { signal });
    return data.insights as string;
  },
};
