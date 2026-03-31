import { api } from './api';
import { Meal } from '../types';

export const nutritionService = {
  async addMeal(params: {
    type: string;
    photoUrl?: string;
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

  async deleteMeal(id: string): Promise<void> {
    await api.delete(`/nutrition/meals/${id}`);
  },
};
