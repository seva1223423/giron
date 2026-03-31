import { api } from './api';
import { Program, Workout, Exercise } from '../types';

export const workoutService = {
  // Programs
  async getPrograms(): Promise<Program[]> {
    const { data } = await api.get('/workouts/programs');
    return data;
  },

  async createProgram(params: {
    name: string;
    description?: string;
    type: string;
    goal?: string;
    level?: string;
    daysPerWeek: number;
    durationWeeks?: number;
  }): Promise<Program> {
    const { data } = await api.post('/workouts/programs', params);
    return data;
  },

  // Workouts
  async startWorkout(params: {
    name: string;
    exercises: Array<{
      exerciseId: string;
      restSeconds?: number;
      sets: Array<{ reps?: number; weight?: number; type?: string }>;
    }>;
  }): Promise<Workout> {
    const { data } = await api.post('/workouts/start', params);
    return data;
  },

  async completeWorkout(id: string, sets?: Array<{
    id: string;
    reps?: number;
    weight?: number;
    completed: boolean;
    rpe?: number;
  }>): Promise<Workout> {
    const { data } = await api.post(`/workouts/${id}/complete`, { sets });
    return data;
  },

  async getHistory(limit = 50, offset = 0): Promise<Workout[]> {
    const { data } = await api.get('/workouts/history', { params: { limit, offset } });
    return data;
  },

  // Exercises database
  async getExercises(): Promise<Exercise[]> {
    const { data } = await api.get('/workouts/exercises');
    return data;
  },
};
