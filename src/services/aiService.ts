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

export const aiService = {
  async chat(message: string): Promise<{ message: string }> {
    const { data } = await api.post('/ai/chat', { message });
    return data;
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
