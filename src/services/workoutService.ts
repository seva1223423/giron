import { api } from './api';
import { Program, Workout, Exercise, Routine, RoutineStartPayload, RoutineHistory } from '../types';

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

  async updateProgram(id: string, params: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
    goal?: string;
    level?: string;
    daysPerWeek?: number;
  }): Promise<Program> {
    const { data } = await api.patch(`/workouts/programs/${id}`, params);
    return data;
  },

  async deleteProgram(id: string): Promise<void> {
    await api.delete(`/workouts/programs/${id}`);
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
      clientId: workout.id, // idempotency key — server uses this to upsert, not create duplicates
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
      routineId: workout.routineId ?? null,
    });
    return data;
  },

  async patchWorkoutNotes(clientId: string, notes: string | null): Promise<void> {
    await api.patch(`/workouts/client/${clientId}/notes`, { notes });
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

  async getHistory(limit = 50, offset = 0): Promise<{ workouts: Workout[]; total: number }> {
    const { data } = await api.get('/workouts/history', { params: { limit, offset } });
    // Support both old array format and new { workouts, total } format
    if (Array.isArray(data)) return { workouts: data, total: data.length };
    return { workouts: data.workouts ?? [], total: data.total ?? 0 };
  },

  // Exercises database
  async getExercises(): Promise<Exercise[]> {
    const { data } = await api.get('/workouts/exercises');
    return data;
  },

  // Club leaderboard
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const { data } = await api.get('/workouts/leaderboard');
    return data.leaderboard ?? [];
  },

  // Routines
  async getRoutines(): Promise<Routine[]> {
    const { data } = await api.get('/workouts/routines');
    return data;
  },

  async createRoutine(params: {
    name: string;
    description?: string;
    exercises: Array<{
      exerciseId: string;
      order: number;
      restSeconds?: number;
      notes?: string;
      sets: Array<{ setNumber: number; type?: string; reps?: number; weight?: number; rpe?: number }>;
    }>;
  }): Promise<Routine> {
    const { data } = await api.post('/workouts/routines', params);
    return data;
  },

  async updateRoutine(id: string, params: {
    name: string;
    description?: string;
    exercises: Array<{
      exerciseId: string;
      order: number;
      restSeconds?: number;
      notes?: string;
      sets: Array<{ setNumber: number; type?: string; reps?: number; weight?: number; rpe?: number }>;
    }>;
  }): Promise<Routine> {
    const { data } = await api.put(`/workouts/routines/${id}`, params);
    return data;
  },

  async renameRoutine(id: string, name: string, description?: string | null): Promise<Routine> {
    const { data } = await api.patch(`/workouts/routines/${id}`, { name, description });
    return data;
  },

  async duplicateRoutine(id: string): Promise<Routine> {
    const { data } = await api.post(`/workouts/routines/${id}/duplicate`);
    return data;
  },

  async deleteRoutine(id: string): Promise<void> {
    await api.delete(`/workouts/routines/${id}`);
  },

  async prepareRoutineWorkout(routineId: string): Promise<RoutineStartPayload> {
    const { data } = await api.post(`/workouts/routines/${routineId}/start`);
    return data;
  },

  async getRoutineHistory(routineId: string): Promise<RoutineHistory> {
    const { data } = await api.get(`/workouts/routines/${routineId}/history`);
    return data;
  },
};
