import { api } from './api';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage } from '../types';

const BASE_URL = Platform.select({
  android: 'http://10.0.2.2:3001/api',
  ios: 'http://localhost:3001/api',
  default: 'http://localhost:3001/api',
});

async function getAuthToken(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem('iron-gym-auth');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
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
  ): Promise<{ message: string; actions: AIActionResult[]; meta?: AIMeta }> {
    const { data } = await api.post('/ai/chat', { message, nutritionTargets, waterMl, weekPlan, cardioSessions });
    return { message: data.message, actions: data.actions ?? [], meta: data.meta };
  },

  async *chatStream(
    message: string,
    nutritionTargets?: { calories: number; protein: number; fats: number; carbs: number; waterTargetMl: number },
    waterMl?: number,
    weekPlan?: Record<number, { name: string; emoji: string; exercises: string[] } | null>,
    cardioSessions?: Array<{ type: string; date: string; durationMinutes: number; distanceKm?: number; caloriesBurned?: number; avgHeartRate?: number }>,
    onDone?: (result: { actions: AIActionResult[]; meta?: AIMeta }) => void,
  ): AsyncGenerator<string> {
    const token = await getAuthToken();
    const response = await fetch(`${BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ message, nutritionTargets, waterMl, weekPlan, cardioSessions, stream: true }),
    });

    if (!response.ok) throw new Error(`AI stream error ${response.status}`);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
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
      }
    } finally {
      reader.releaseLock();
    }
  },

  async getStarters(): Promise<AIStarter[]> {
    try {
      const { data } = await api.get('/ai/starters');
      return data.starters ?? [];
    } catch {
      return [];
    }
  },

  async analyzeFood(imageBase64: string): Promise<FoodAnalysisResult> {
    const { data } = await api.post('/ai/analyze-food', { imageBase64 });
    return data;
  },

  async getChatHistory(): Promise<ChatMessage[]> {
    const { data } = await api.get('/ai/history');
    return data;
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
  }): Promise<string> {
    const { data } = await api.post('/ai/workout-insights', { workout });
    return data.insights as string;
  },
};
