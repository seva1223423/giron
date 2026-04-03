import { api } from './api';
import { ChatMessage } from '../types';

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
  ): Promise<{ message: string; actions: AIActionResult[]; meta?: AIMeta }> {
    const { data } = await api.post('/ai/chat', { message, nutritionTargets, waterMl, weekPlan });
    return { message: data.message, actions: data.actions ?? [], meta: data.meta };
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
