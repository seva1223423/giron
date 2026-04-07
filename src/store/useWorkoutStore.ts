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
  type?: 'workout' | 'cardio'; // default is 'workout'
}

interface WorkoutStore {
  programs: Program[];
  workoutHistory: Workout[];
  activeWorkout: ActiveWorkout | null;
  isLoadingPrograms: boolean;
  isLoadingHistory: boolean;
  weekPlan: Record<number, WeekPlanEntry | null>; // 0=Mon … 6=Sun
  savedTemplates: Workout[];
  customExercises: Exercise[];

  setWeekPlanDay: (dow: number, entry: WeekPlanEntry | null) => void;
  saveAsTemplate: (workout: Workout) => void;
  deleteTemplate: (id: string) => void;
  addCustomExercise: (exercise: Exercise) => void;
  deleteCustomExercise: (id: string) => void;

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
  setWorkoutNotes: (notes: string) => void;
  updateSetData: (exerciseIndex: number, setIndex: number, data: Partial<WorkoutSet>) => void;
  addExerciseToWorkout: (exercise: Exercise) => void;
  removeExerciseFromWorkout: (exerciseIndex: number) => void;
  toggleSuperset: (exerciseIndex: number) => void;
  generateWarmupSets: (exerciseIndex: number, workingWeight: number) => void;

  // History
  addToHistory: (workout: Workout) => void;
  updateWorkoutInHistory: (id: string, data: Partial<Workout>) => void;
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
      savedTemplates: [],
      customExercises: [],

      setWeekPlanDay: (dow, entry) => set((s) => ({
        weekPlan: { ...s.weekPlan, [dow]: entry },
      })),

      addCustomExercise: (exercise) => set((s) => {
        if (s.customExercises.some((e) => e.id === exercise.id)) return s;
        return { customExercises: [exercise, ...s.customExercises] };
      }),

      deleteCustomExercise: (id) => set((s) => ({
        customExercises: s.customExercises.filter((e) => e.id !== id),
      })),

      saveAsTemplate: (workout) => set((s) => {
        // Avoid duplicates by id
        const exists = s.savedTemplates.some((t) => t.id === workout.id);
        if (exists) return s;
        const template: Workout = {
          ...workout,
          id: `tpl-${Date.now()}`,
          completedAt: undefined,
          startedAt: undefined,
          durationMinutes: undefined,
          totalVolume: undefined,
        };
        return { savedTemplates: [template, ...s.savedTemplates] };
      }),

      deleteTemplate: (id) => set((s) => ({
        savedTemplates: s.savedTemplates.filter((t) => t.id !== id),
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
        const completedSet = { ...sets[setIndex], ...data, completed: true };

        // Detect PR: compute Epley 1RM and compare against history
        const { weight, reps } = completedSet;
        if (weight && reps && weight > 0 && reps > 0 && completedSet.type !== 'warmup') {
          const newRM = weight * (1 + reps / 30);
          const exerciseId = exercise.exerciseId;
          const historyBest = s.workoutHistory
            .filter((w) => w.id !== workout.id)
            .flatMap((w) => w.exercises)
            .filter((e) => e.exerciseId === exerciseId)
            .flatMap((e) => e.sets)
            .filter((st) => st.completed && st.weight && st.reps && st.type !== 'warmup')
            .reduce((best, st) => {
              const rm = (st.weight!) * (1 + (st.reps!) / 30);
              return rm > best ? rm : best;
            }, 0);
          completedSet.isPR = newRM > historyBest && historyBest > 0;
        }

        sets[setIndex] = completedSet;
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
          restSeconds: 0,
        };
        workout.exercises = [...workout.exercises, newExercise];
        return { activeWorkout: { ...s.activeWorkout, workout } };
      }),

      removeExerciseFromWorkout: (exerciseIndex) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const exercises = workout.exercises.filter((_, i) => i !== exerciseIndex);
        // Re-order
        const reordered = exercises.map((ex, i) => ({ ...ex, order: i }));
        workout.exercises = reordered;
        // Adjust currentExerciseIndex if needed
        const maxIndex = Math.max(0, reordered.length - 1);
        const currentIndex = Math.min(s.activeWorkout.currentExerciseIndex, maxIndex);
        return {
          activeWorkout: {
            ...s.activeWorkout,
            workout,
            currentExerciseIndex: currentIndex,
          },
        };
      }),

      generateWarmupSets: (exerciseIndex, workingWeight) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const exercises = [...workout.exercises];
        const exercise = { ...exercises[exerciseIndex] };
        const warmupConfigs = [
          { pct: 0.4, reps: 8 },
          { pct: 0.6, reps: 5 },
          { pct: 0.8, reps: 3 },
        ];
        const now = Date.now();
        const warmupSets: WorkoutSet[] = warmupConfigs.map((cfg, i) => ({
          id: `warmup-${now}-${i}`,
          setNumber: i + 1,
          type: 'warmup' as const,
          weight: Math.round(workingWeight * cfg.pct * 2) / 2, // round to 0.5kg
          reps: cfg.reps,
          completed: false,
        }));
        // Renumber existing sets after prepending warmup sets
        const existingSets = exercise.sets.map((set, i) => ({
          ...set,
          setNumber: warmupSets.length + i + 1,
        }));
        exercise.sets = [...warmupSets, ...existingSets];
        exercises[exerciseIndex] = exercise;
        workout.exercises = exercises;
        return { activeWorkout: { ...s.activeWorkout, workout } };
      }),

      toggleSuperset: (exerciseIndex) => set((s) => {
        if (!s.activeWorkout) return s;
        const exercises = [...s.activeWorkout.workout.exercises];
        const exercise = exercises[exerciseIndex];
        const nextExercise = exercises[exerciseIndex + 1];
        if (!nextExercise) return s;

        if (exercise.supersetGroupId) {
          // Remove superset — clear the group from all exercises in it
          const groupId = exercise.supersetGroupId;
          for (let i = 0; i < exercises.length; i++) {
            if (exercises[i].supersetGroupId === groupId) {
              exercises[i] = { ...exercises[i], supersetGroupId: undefined };
            }
          }
        } else {
          // Link with the next exercise
          const groupId = `ss-${Date.now()}`;
          exercises[exerciseIndex] = { ...exercise, supersetGroupId: groupId };
          exercises[exerciseIndex + 1] = { ...nextExercise, supersetGroupId: groupId };
        }

        const workout = { ...s.activeWorkout.workout, exercises };
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

      setWorkoutNotes: (notes) => set((s) => {
        if (!s.activeWorkout) return s;
        return {
          activeWorkout: {
            ...s.activeWorkout,
            workout: { ...s.activeWorkout.workout, notes },
          },
        };
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

      updateWorkoutInHistory: (id, data) => set((s) => ({
        workoutHistory: s.workoutHistory.map((w) => w.id === id ? { ...w, ...data } : w),
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
        savedTemplates: state.savedTemplates,
        customExercises: state.customExercises,
      }),
    }
  )
);
