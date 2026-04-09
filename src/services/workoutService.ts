import { api } from './api';
import { Program, Workout, Exercise } from '../types';

export interface LeaderboardEntry {
  rank: number;
  exerciseName: string;
  userName: string;
  weightKg: number;
  reps: number;
  estimated1RM: number;
  date: string | null;
  verified: boolean;
}

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

  async syncWorkout(workout: any): Promise<any> {
    const { data } = await api.post('/workouts/sync', {
      name: workout.name,
      exercises: workout.exercises.map((ex: any) => ({
        exerciseId: ex.exerciseId,
        restSeconds: ex.restSeconds,
        supersetGroupId: ex.supersetGroupId,
        notes: ex.notes,
        sets: ex.sets.map((s: any) => ({
          type: s.type,
          reps: s.reps,
          weight: s.weight,
          rpe: s.rpe,
          completed: s.completed,
        })),
      })),
      completedAt: workout.completedAt,
      startedAt: workout.startedAt,
      durationMinutes: workout.durationMinutes,
      totalVolume: workout.totalVolume,
      notes: workout.notes,
    });
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

  async autosaveWorkout(id: string, sets: Array<{
    id: string;
    reps?: number;
    weight?: number;
    completed: boolean;
    rpe?: number;
  }>): Promise<void> {
    await api.post(`/workouts/${id}/autosave`, { sets }).catch(() => {}); // fire-and-forget
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

  // Club leaderboard
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const { data } = await api.get('/workouts/leaderboard');
    return data.leaderboard;
  },
};
