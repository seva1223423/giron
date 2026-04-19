import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Workout, WorkoutExercise, WorkoutSet, Program, Exercise } from '../types';
import { workoutService } from '../services';
import { userService } from '../services/userService';

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
  pendingSync: Workout[]; // workouts that failed to sync — retried on next fetchHistory

  setWeekPlanDay: (dow: number, entry: WeekPlanEntry | null) => void;
  syncWeekPlan: () => Promise<void>;
  fetchWeekPlan: () => Promise<void>;
  saveAsTemplate: (workout: Workout) => void;
  deleteTemplate: (id: string) => void;
  addCustomExercise: (exercise: Exercise) => void;
  deleteCustomExercise: (id: string) => void;

  // Programs
  setPrograms: (programs: Program[]) => void;
  addProgram: (program: Program) => void;
  updateProgram: (id: string, data: Partial<Program>) => Promise<void>;
  deleteProgram: (id: string) => Promise<void>;
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

  // Lifecycle
  clearUserData: () => void;
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
      pendingSync: [],

      setWeekPlanDay: (dow, entry) => {
        if (!Number.isInteger(dow) || dow < 0 || dow > 6) return;
        const prevEntry = get().weekPlan[dow];
        set((s) => ({ weekPlan: { ...s.weekPlan, [dow]: entry } }));
        const updated = { ...get().weekPlan, [dow]: entry };
        userService.saveWeekPlan(updated).catch(() => {
          // Rollback only the changed day — restoring a snapshot would erase concurrent changes
          set((s) => ({ weekPlan: { ...s.weekPlan, [dow]: prevEntry } }));
        });
      },

      syncWeekPlan: async () => {
        const plan = get().weekPlan;
        userService.saveWeekPlan(plan).catch(() => {});
      },

      fetchWeekPlan: async () => {
        try {
          const serverPlan = await userService.getWeekPlan();
          if (serverPlan && Object.keys(serverPlan).length > 0) {
            // Server is source of truth — always apply server plan
            set({ weekPlan: serverPlan as Record<number, WeekPlanEntry | null> });
          }
        } catch {
          // Keep local plan if server unreachable
        }
      },

      addCustomExercise: (exercise) => set((s) => {
        if (s.customExercises.some((e) => e.id === exercise.id)) return s;
        return { customExercises: [exercise, ...s.customExercises] };
      }),

      deleteCustomExercise: (id) => set((s) => ({
        customExercises: s.customExercises.filter((e) => e.id !== id),
      })),

      saveAsTemplate: (workout) => set((s) => {
        // Avoid duplicates: check by originalId (stored on template) or by source workout id
        const exists = s.savedTemplates.some(
          (t) => (t as any).originalId === workout.id || t.id === workout.id
        );
        if (exists) return s;
        const template: Workout = {
          ...workout,
          id: `tpl-${Date.now()}`,
          completedAt: undefined,
          startedAt: undefined,
          durationMinutes: undefined,
          totalVolume: undefined,
        };
        (template as any).originalId = workout.id;
        return { savedTemplates: [template, ...s.savedTemplates] };
      }),

      deleteTemplate: (id) => set((s) => ({
        savedTemplates: s.savedTemplates.filter((t) => t.id !== id),
      })),

      setPrograms: (programs) => set({ programs }),
      addProgram: (program) => set((s) => ({ programs: [...s.programs, program] })),
      updateProgram: async (id, data) => {
        const prevProgram = get().programs.find((p) => p.id === id);
        const prevActiveId = get().programs.find((p) => p.isActive)?.id;
        // Optimistic local update — mirror server behaviour: activating one deactivates all others
        set((s) => ({
          programs: s.programs.map((p) => {
            if (p.id === id) return { ...p, ...data };
            if (data.isActive === true) return { ...p, isActive: false };
            return p;
          }),
        }));
        // Persist to server; revert only affected programs on failure
        workoutService.updateProgram(id, data as any).catch((err) => {
          if (err?.response?.status !== 404 && prevProgram) {
            set((s) => ({
              programs: s.programs.map((p) => {
                if (p.id === id) return prevProgram;
                if (data.isActive === true && p.id === prevActiveId) return { ...p, isActive: true };
                return p;
              }),
            }));
          }
        });
      },
      deleteProgram: async (id) => {
        const removed = get().programs.find((p) => p.id === id);
        // Optimistic local delete
        set((s) => ({ programs: s.programs.filter((p) => p.id !== id) }));
        // Persist to server; re-add only the removed program on failure
        workoutService.deleteProgram(id).catch((err) => {
          if (err?.response?.status !== 404 && removed) {
            set((s) => ({ programs: [...s.programs, removed] }));
          }
        });
      },

      fetchPrograms: async () => {
        set({ isLoadingPrograms: true });
        try {
          const programs = await workoutService.getPrograms();
          set({ programs, isLoadingPrograms: false });
        } catch {
          set({ isLoadingPrograms: false });
        }
      },

      startWorkout: (workout) => {
        // Safety guard: don't silently overwrite an in-progress workout.
        // Callers should check activeWorkout first and navigate to it instead.
        if (get().activeWorkout) return;
        set({
          activeWorkout: {
            workout: { ...workout, startedAt: new Date().toISOString() },
            startTime: Date.now(),
            currentExerciseIndex: 0,
            isRestTimerActive: false,
            restTimeRemaining: 0,
          },
        });
      },

      completeSet: (exerciseIndex, setIndex, data) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const exercises = [...workout.exercises];
        if (exerciseIndex < 0 || exerciseIndex >= exercises.length) return s;
        const exercise = { ...exercises[exerciseIndex] };
        const sets = [...exercise.sets];
        if (setIndex < 0 || setIndex >= sets.length) return s;
        const completedSet = { ...sets[setIndex], ...data, completed: true };

        // Detect PR: compute Epley 1RM and compare against history
        const { weight, reps } = completedSet;
        if (weight && reps && weight > 0 && reps > 0 && completedSet.type !== 'warmup') {
          const newRM = weight * (1 + reps / 30);
          const exerciseId = exercise.exerciseId;
          const historySets = s.workoutHistory
            .filter((w) => w.id !== workout.id && w.completedAt)
            .flatMap((w) => w.exercises)
            .filter((e) => e.exerciseId === exerciseId)
            .flatMap((e) => e.sets)
            .filter((st) => st.completed && st.weight && st.reps && st.type !== 'warmup');
          const historyBest = historySets.length > 0
            ? historySets.reduce((best, st) => {
                const rm = st.weight! * (1 + st.reps! / 30);
                return rm > best ? rm : best;
              }, 0)
            : null;
          completedSet.isPR = historyBest === null || newRM > historyBest;
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
        if (exerciseIndex < 0 || exerciseIndex >= exercises.length) return s;
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
        if (exerciseIndex < 0 || exerciseIndex >= exercises.length) return s;
        const exercise = { ...exercises[exerciseIndex] };
        exercise.sets = exercise.sets
          .filter((_, i) => i !== setIndex)
          .map((s, i) => ({ ...s, setNumber: i + 1 }));
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
        if (exerciseIndex < 0 || exerciseIndex >= exercises.length) return s;
        const exercise = { ...exercises[exerciseIndex] };
        const sets = [...exercise.sets];
        if (setIndex < 0 || setIndex >= sets.length) return s;
        sets[setIndex] = { ...sets[setIndex], ...data };
        exercise.sets = sets;
        exercises[exerciseIndex] = exercise;
        workout.exercises = exercises;
        return { activeWorkout: { ...s.activeWorkout, workout } };
      }),

      addExerciseToWorkout: (exercise) => set((s) => {
        if (!s.activeWorkout) return s;
        if (s.activeWorkout.workout.exercises.some((e) => e.exerciseId === exercise.id)) return s;
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
        const removedEx = s.activeWorkout.workout.exercises[exerciseIndex];
        const workout = { ...s.activeWorkout.workout };
        const exercises = workout.exercises.filter((_, i) => i !== exerciseIndex);
        // If removed exercise was in a superset, check if the group now has only 1 member — if so, remove the group
        const removedGroupId = removedEx?.supersetGroupId;
        const cleanedExercises = exercises.map((ex) => {
          if (removedGroupId && ex.supersetGroupId === removedGroupId) {
            const remainingInGroup = exercises.filter((e) => e.supersetGroupId === removedGroupId);
            if (remainingInGroup.length <= 1) return { ...ex, supersetGroupId: undefined };
          }
          return ex;
        });
        // Re-order
        const reordered = cleanedExercises.map((ex, i) => ({ ...ex, order: i }));
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
        // Strip any existing warmup sets, then renumber after prepending new ones
        const existingSets = exercise.sets
          .filter((set) => set.type !== 'warmup')
          .map((set, i) => ({ ...set, setNumber: warmupSets.length + i + 1 }));
        exercise.sets = [...warmupSets, ...existingSets];
        exercises[exerciseIndex] = exercise;
        workout.exercises = exercises;
        return { activeWorkout: { ...s.activeWorkout, workout } };
      }),

      toggleSuperset: (exerciseIndex) => set((s) => {
        if (!s.activeWorkout) return s;
        const exercises = [...s.activeWorkout.workout.exercises];
        if (exerciseIndex < 0 || exerciseIndex >= exercises.length) return s;
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
          // If nextExercise already belongs to a different group, dissolve that group
          // if removing it would leave only one member (dangling superset).
          if (nextExercise.supersetGroupId) {
            const oldGroupId = nextExercise.supersetGroupId;
            const remainingInOld = exercises.filter(
              (e, i) => i !== exerciseIndex + 1 && e.supersetGroupId === oldGroupId
            );
            if (remainingInOld.length <= 1) {
              for (let i = 0; i < exercises.length; i++) {
                if (exercises[i].supersetGroupId === oldGroupId) {
                  exercises[i] = { ...exercises[i], supersetGroupId: undefined };
                }
              }
            }
          }
          // Link with the next exercise using a fresh group
          const groupId = `ss-${Date.now()}`;
          exercises[exerciseIndex] = { ...exercises[exerciseIndex], supersetGroupId: groupId };
          exercises[exerciseIndex + 1] = { ...exercises[exerciseIndex + 1], supersetGroupId: groupId };
        }

        const workout = { ...s.activeWorkout.workout, exercises };
        return { activeWorkout: { ...s.activeWorkout, workout } };
      }),

      setExerciseNotes: (exerciseIndex, notes) => set((s) => {
        if (!s.activeWorkout) return s;
        const workout = { ...s.activeWorkout.workout };
        const exercises = [...workout.exercises];
        if (exerciseIndex < 0 || exerciseIndex >= exercises.length) return s;
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
          durationMinutes: Math.max(0, Math.round((Date.now() - active.startTime) / 60000)),
          totalVolume: active.workout.exercises.reduce((total, ex) =>
            total + ex.sets
              .filter((s) => s.completed && s.type !== 'warmup')
              .reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0),
            0
          ),
        };
        // Add to pendingSync first so data is never lost if server call fails.
        // Cap at 50 to prevent unbounded AsyncStorage growth on prolonged offline use.
        set((s) => ({
          activeWorkout: null,
          workoutHistory: [completed, ...s.workoutHistory],
          pendingSync: [...s.pendingSync.filter((w) => w.id !== completed.id), completed].slice(-50),
        }));

        // Attempt server sync; remove from pendingSync only on confirmed success
        workoutService.syncWorkout(completed).then(() => {
          set((s) => ({ pendingSync: s.pendingSync.filter((w) => w.id !== completed.id) }));
        }).catch(() => {
          // Will be retried on next fetchHistory call
        });

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

      updateWorkoutInHistory: (id, data) => {
        const prevWorkout = get().workoutHistory.find((w) => w.id === id);
        set((s) => ({
          workoutHistory: s.workoutHistory.map((w) => w.id === id ? { ...w, ...data } : w),
        }));
        // Sync notes to server (workout.id is used as clientId on the server)
        if ('notes' in data) {
          workoutService.patchWorkoutNotes(id, data.notes ?? null).catch((err) => {
            if (err?.response?.status !== 404 && prevWorkout) {
              set((s) => ({
                workoutHistory: s.workoutHistory.map((w) => w.id === id ? prevWorkout : w),
              }));
            }
          });
        }
      },

      getExerciseHistory: (exerciseId) => {
        return get().workoutHistory.filter((w) =>
          w.exercises.some((e) => e.exerciseId === exerciseId)
        );
      },

      clearUserData: () => set({
        programs: [],
        workoutHistory: [],
        activeWorkout: null,
        weekPlan: {},
        savedTemplates: [],
        customExercises: [],
        pendingSync: [],
        isLoadingPrograms: false,
        isLoadingHistory: false,
      }),

      fetchHistory: async () => {
        if (get().isLoadingHistory) return; // prevent concurrent fetches
        set({ isLoadingHistory: true });

        // Retry any workouts that failed to sync previously
        const pending = get().pendingSync;
        if (pending.length > 0) {
          const results = await Promise.allSettled(
            pending.map((w) => workoutService.syncWorkout(w))
          );
          const syncedIds = new Set(
            pending.filter((_, i) => results[i].status === 'fulfilled').map((w) => w.id)
          );
          if (syncedIds.size > 0) {
            set((s) => ({ pendingSync: s.pendingSync.filter((w) => !syncedIds.has(w.id)) }));
          }
        }

        try {
          const { workouts: history } = await workoutService.getHistory();
          if (history.length > 0) {
            // Merge: keep local-only workouts that server doesn't know about.
            // A local workout may have been synced and received a server cuid ID, while
            // still living in local history under its original client-generated ID (e.g. 'workout-123').
            // Exclude it from localOnly if the server already has it via clientId match.
            const serverIds = new Set(history.map((w) => w.id));
            const serverClientIds = new Set(
              history.map((w) => (w as any).clientId).filter(Boolean)
            );
            const localOnly = get().workoutHistory.filter(
              (w) => !serverIds.has(w.id) && !serverClientIds.has(w.id)
            );
            const merged = [...history, ...localOnly].sort((a, b) =>
              new Date(b.completedAt || b.startedAt || 0).getTime() - new Date(a.completedAt || a.startedAt || 0).getTime()
            );
            set({ workoutHistory: merged, isLoadingHistory: false });
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
        pendingSync: state.pendingSync,
      }),
      version: 1,
      migrate: (state: any) => state,
    }
  )
);
