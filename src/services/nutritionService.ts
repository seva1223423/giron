import { api } from './api';
import { Meal } from '../types';

export const nutritionService = {
  async addMeal(params: {
    type: string;
    photoUrl?: string;
    date?: string; // YYYY-MM-DD local date for timezone-safe day filtering
    items: Array<{
      name: string;
      calories: number;
      protein: number;
      fats: number;
      carbs: number;
      weightGrams: number;
    }>;
  }): Promise<Meal> {
    const { data } = await api.post('/nutrition/meals', params);
    return data;
  },

  async getMealsByDate(date: string): Promise<Meal[]> {
    const { data } = await api.get('/nutrition/meals', { params: { date } });
    return data;
  },

  async updateMeal(id: string, items: Array<{ name: string; calories: number; protein: number; fats: number; carbs: number; weightGrams?: number }>): Promise<Meal> {
    const { data } = await api.patch(`/nutrition/meals/${id}`, { items });
    return data;
  },

  async deleteMeal(id: string): Promise<void> {
    await api.delete(`/nutrition/meals/${id}`);
  },

  async updateNutritionTargets(targets: { calories?: number; protein?: number; fats?: number; carbs?: number }): Promise<void> {
    await api.patch('/user/nutrition-targets', targets);
  },
};
