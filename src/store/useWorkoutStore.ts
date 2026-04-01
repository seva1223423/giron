import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Workout, WorkoutExercise, WorkoutSet, Program, Exercise } from '../types';
import { workoutService } from '../services';

interface ActiveWorkout {
  workout: Workout;
  startTime: number;
  currentExerciseIndex: number;
  isRestTimerActive: boolean;
  restTimeRemaining: number;
}

export interface WeekPlanEntry {
  name: string;
  emoji: string;
  exercises: string[]; // exercise IDs
}

interface WorkoutStore {
  programs: Program[];
  workoutHistory: Workout[];
  activeWorkout: ActiveWorkout | null;
  isLoadingPrograms: boolean;
  isLoadingHistory: boolean;
  weekPlan: Record<number, WeekPlanEntry | null>; // 0=Mon … 6=Sun

  setWeekPlanDay: (dow: number, entry: WeekPlanEntry | null) => void;

  // Programs
  setPrograms: (programs: Program[]) => void;
  addProgram: (program: Program) => void;
  updateProgram: (id: string, data: Partial<Program>) => void;
  deleteProgram: (id: string) => void;
  fetchPrograms: () => Promise<void>;

  // Active workout
  startWorkout: (workout: Workout) => void;
  completeSet: (exerciseIndex: number, setIndex: number, data: Partial<WorkoutSet>) => void;
  addSet: (exerciseIndex: number) => void;
  removeSet: (exerciseIndex: number, setIndex: number) => void;
  nextExercise: () => void;
  prevExercise: () => void;
  finishWorkout: () => Workout | null;
  cancelWorkout: () => void;
  setRestTimer: (seconds: number) => void;
  setExerciseNotes: (exerciseIndex: number, notes: string) => void;
  updateSetData: (exerciseIndex: number, setIndex: number, data: Partial<WorkoutSet>) => void;
  addExerciseToWorkout: (exercise: Exercise) => void;

  // History
  addToHistory: (workout: Workout) => void;
  getExerciseHistory: (exerciseId: string) => Workout[];
  fetchHistory: () => Promise<void>;
}

export const useWorkoutStore = create<WorkoutStore>()(
  persist(
    (set, get) => ({
      programs: [],
      workoutHistory: [],
      activeWorkout: null,
      isLoadingPrograms: false,
      isLoadingHistory: false,
      weekPlan: {},

      setWeekPlanDay: (dow, entry) => set((s) => ({
        weekPlan: { ...s.weekPlan, [dow]: entry },
      })),

      setPrograms: (programs) => set({ programs }),
      addProgram: (program) => set((s) => ({ programs: [...s.programs, program] })),
      updateProgram: (id, data) => set((s) => ({
        programs: s.programs.map((p) => p.id === id ? { ...p, ...data } : p),
      })),
      deleteProgram: (id) => set((s) => ({
        programs: s.programs.filter((p) => p.id !== id),
      })),

      fetchPrograms: async () => {
        set({ isLoadingPrograms: true });
        try {
          const programs = await workoutService.getPrograms();
          set({ programs, isLoadingPrograms: false });
        } catch {
          set({ isLoadingPrograms: false });
        }
      },

      startWorkout: (workout) => set({
        activeWorkout: {
          workout: { ...workout, startedAt: new Date().toISOString() },
          startTime: Date.now(),
          currentExerciseIndex: 0,
          isRestTimerActive: false,
          restTimeRemaining: 0,
        },
      }),

      completeSet: (exerciseIndex, setIndex, data) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const exercises = [...workout.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const sets = [...exercise.sets];
        sets[setIndex] = { ...sets[setIndex], ...data, completed: true };
        exercise.sets = sets;
        exercises[exerciseIndex] = exercise;
        workout.exercises = exercises;
        return {
          activeWorkout: { ...s.activeWorkout, workout },
        };
      }),

      addSet: (exerciseIndex) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const exercises = [...workout.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const lastSet = exercise.sets[exercise.sets.length - 1];
        const newSet: WorkoutSet = {
          id: `set-${Date.now()}`,
          setNumber: exercise.sets.length + 1,
          type: 'normal',
          reps: lastSet?.reps,
          weight: lastSet?.weight,
          completed: false,
        };
        exercise.sets = [...exercise.sets, newSet];
        exercises[exerciseIndex] = exercise;
        workout.exercises = exercises;
        return {
          activeWorkout: { ...s.activeWorkout, workout },
        };
      }),

      removeSet: (exerciseIndex, setIndex) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const exercises = [...workout.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        exercise.sets = exercise.sets.filter((_, i) => i !== setIndex);
        exercises[exerciseIndex] = exercise;
        workout.exercises = exercises;
        return {
          activeWorkout: { ...s.activeWorkout, workout },
        };
      }),

      updateSetData: (exerciseIndex, setIndex, data) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const exercises = [...workout.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const sets = [...exercise.sets];
        sets[setIndex] = { ...sets[setIndex], ...data };
        exercise.sets = sets;
        exercises[exerciseIndex] = exercise;
        workout.exercises = exercises;
        return { activeWorkout: { ...s.activeWorkout, workout } };
      }),

      addExerciseToWorkout: (exercise) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const newExercise: WorkoutExercise = {
          id: `we-${Date.now()}`,
          exerciseId: exercise.id,
          exercise,
          order: workout.exercises.length,
          sets: Array.from({ length: 3 }, (_, i) => ({
            id: `set-${Date.now()}-${i}`,
            setNumber: i + 1,
            type: 'normal' as const,
            reps: 10,
            weight: 0,
            completed: false,
          })),
          restSeconds: 90,
        };
        workout.exercises = [...workout.exercises, newExercise];
        return { activeWorkout: { ...s.activeWorkout, workout } };
      }),

      setExerciseNotes: (exerciseIndex, notes) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const exercises = [...workout.exercises];
        exercises[exerciseIndex] = { ...exercises[exerciseIndex], notes };
        workout.exercises = exercises;
        return { activeWorkout: { ...s.activeWorkout, workout } };
      }),

      nextExercise: () => set((s) => {
        if (!s.activeWorkout) return s;
        const maxIndex = s.activeWorkout.workout.exercises.length - 1;
        return {
          activeWorkout: {
            ...s.activeWorkout,
            currentExerciseIndex: Math.min(s.activeWorkout.currentExerciseIndex + 1, maxIndex),
          },
        };
      }),

      prevExercise: () => set((s) => {
        if (!s.activeWorkout) return s;
        return {
          activeWorkout: {
            ...s.activeWorkout,
            currentExerciseIndex: Math.max(s.activeWorkout.currentExerciseIndex - 1, 0),
          },
        };
      }),

      finishWorkout: () => {
        const active = get().activeWorkout;
        if (!active) return null;
        const completed: Workout = {
          ...active.workout,
          completedAt: new Date().toISOString(),
          durationMinutes: Math.round((Date.now() - active.startTime) / 60000),
          totalVolume: active.workout.exercises.reduce((total, ex) =>
            total + ex.sets
              .filter((s) => s.completed)
              .reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0),
            0
          ),
        };
        set((s) => ({
          activeWorkout: null,
          workoutHistory: [completed, ...s.workoutHistory],
        }));

        // Sync completed workout to server in background
        workoutService.completeWorkout(completed.id,
          completed.exercises.flatMap((ex) =>
            ex.sets.map((s) => ({
              id: s.id,
              reps: s.reps,
              weight: s.weight,
              completed: s.completed,
              rpe: s.rpe,
            }))
          )
        ).catch(() => {});

        return completed;
      },

      cancelWorkout: () => set({ activeWorkout: null }),

      setRestTimer: (seconds) => set((s) => {
        if (!s.activeWorkout) return s;
        return {
          activeWorkout: {
            ...s.activeWorkout,
            isRestTimerActive: seconds > 0,
            restTimeRemaining: seconds,
          },
        };
      }),

      addToHistory: (workout) => set((s) => ({
        workoutHistory: [workout, ...s.workoutHistory],
      })),

      getExerciseHistory: (exerciseId) => {
        return get().workoutHistory.filter((w) =>
          w.exercises.some((e) => e.exerciseId === exerciseId)
        );
      },

      fetchHistory: async () => {
        set({ isLoadingHistory: true });
        try {
          const history = await workoutService.getHistory();
          if (history.length > 0) {
            set({ workoutHistory: history, isLoadingHistory: false });
          } else {
            set({ isLoadingHistory: false });
          }
        } catch {
          set({ isLoadingHistory: false });
        }
      },
    }),
    {
      name: 'iron-gym-workouts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        programs: state.programs,
        workoutHistory: state.workoutHistory,
        activeWorkout: state.activeWorkout,
        weekPlan: state.weekPlan,
      }),
    }
  )
);
