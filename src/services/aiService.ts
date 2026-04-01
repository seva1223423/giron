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
}

export const aiService = {
  async chat(message: string): Promise<{ message: string; actions: AIActionResult[] }> {
    const { data } = await api.post('/ai/chat', { message });
    return { message: data.message, actions: data.actions ?? [] };
  },

  async analyzeFood(imageBase64: string): Promise<FoodAnalysisResult> {
    const { data } = await api.post('/ai/analyze-food', { imageBase64 });
    return data;
  },

  async getChatHistory(): Promise<ChatMessage[]> {
    const { data } = await api.get('/ai/history');
    return data;
  },
};
