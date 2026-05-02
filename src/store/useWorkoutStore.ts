import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEncryptedAsyncStorage } from '../utils/encryptedStorage';
import { Workout, WorkoutExercise, WorkoutSet, Program, Exercise, Routine } from '../types';
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
  exercises: string[]; // exercise IDs (legacy / cardio days)
  routineId?: string;  // references a saved Routine — takes priority over exercises[] for start
  type?: 'workout' | 'cardio'; // default is 'workout'
}

interface WorkoutStore {
  programs: Program[];
  routines: Routine[];
  isLoadingRoutines: boolean;
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

  // Routines
  fetchRoutines: () => Promise<void>;
  addRoutine: (routine: Routine) => void;
  removeRoutine: (id: string) => Promise<void>;
  updateRoutineName: (id: string, name: string, description?: string | null) => Promise<void>;
  replaceRoutine: (routine: Routine) => void;
  duplicateRoutine: (id: string) => Promise<Routine | null>;
  startWorkoutFromRoutine: (routineId: string, preloadedPayload?: import('../types').RoutineStartPayload) => Promise<Workout | null>;

  // Active workout
  startWorkout: (workout: Workout) => boolean;
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
  addExerciseToWorkout: (exercise: Exercise) => boolean;
  /**
   * Replace the exercise at `exerciseIndex` with a new one, preserving the set
   * count / rest / supersetGroupId of the original slot but resetting completed
   * flags. Use this for the Substitute action — adding to the end with
   * `addExerciseToWorkout` would leave the user halfway through the wrong
   * exercise with the new one tacked on at the bottom.
   * Returns false if the active workout no longer has that index, or the
   * replacement is already present elsewhere in the workout.
   */
  replaceExerciseInWorkout: (exerciseIndex: number, newExercise: Exercise) => boolean;
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
  /** Round 249: internal session-epoch counter. Bumped by clearUserData;
   * fetch* methods capture before await and discard set() on mismatch. */
  _sessionEpoch: number;
}

export const useWorkoutStore = create<WorkoutStore>()(
  persist(
    (set, get) => ({
      programs: [],
      routines: [],
      isLoadingRoutines: false,
      workoutHistory: [],
      activeWorkout: null,
      isLoadingPrograms: false,
      isLoadingHistory: false,
      weekPlan: {},
      savedTemplates: [],
      customExercises: [],
      pendingSync: [],
      // Round 249: session-epoch counter — incremented by clearUserData.
      // fetch* methods capture it before await and skip set() on mismatch
      // so stale data from a previous session can't pollute the new one.
      _sessionEpoch: 0,

      setWeekPlanDay: (dow, entry) => {
        if (!Number.isInteger(dow) || dow < 0 || dow > 6) return;
        const state = get();
        const prevEntry = state.weekPlan[dow];

        // Dedupe — reference-equal entry means the UI fired the same object twice
        // (common from memoized props / effects). Nothing to save, nothing to
        // roll back. Skipping here also prevents a subtle double-save race:
        // if save #1 fails *after* save #2 already succeeded, both in-flight
        // rollbacks would otherwise fight over the slot.
        if (prevEntry === entry) return;

        // Build the updated plan once and reuse it for both the local write
        // and the server payload — prevents TOCTOU between `set()` and `get()`.
        const updated = { ...state.weekPlan, [dow]: entry };
        set({ weekPlan: updated });

        userService.saveWeekPlan(updated).catch((err) => {
          // Rollback only if the slot still holds *our* optimistic value. A
          // newer edit may have replaced it while we were in flight — that
          // edit owns its own rollback; don't clobber it with our stale prev.
          if (get().weekPlan[dow] !== entry) return;
          set((s) => ({ weekPlan: { ...s.weekPlan, [dow]: prevEntry } }));
          // Log so Sentry (once integrated — Tech-05) surfaces persistent
          // save failures — otherwise rollbacks are invisible to the user.
          // eslint-disable-next-line no-console
          console.warn('[useWorkoutStore] setWeekPlanDay save failed, rolled back', {
            dow,
            error: String(err),
          });
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
        const optimistic = get().programs.find((p) => p.id === id);
        // Persist to server; revert only affected programs on failure, and only if a
        // concurrent update hasn't already replaced our optimistic value.
        workoutService.updateProgram(id, data as any).catch((err) => {
          if (err?.response?.status === 404 || !prevProgram) return;
          const current = get().programs.find((p) => p.id === id);
          if (current !== optimistic) return; // newer update — leave it alone
          set((s) => ({
            programs: s.programs.map((p) => {
              if (p.id === id) return prevProgram;
              if (data.isActive === true && p.id === prevActiveId) return { ...p, isActive: true };
              return p;
            }),
          }));
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
        // Round 249: race-safety via session epoch. clearUserData
        // increments _sessionEpoch; if it changes mid-fetch, the
        // result belongs to a previous session (e.g. user logged out
        // and back in as a different account during the await) — drop it.
        const epoch = get()._sessionEpoch ?? 0;
        set({ isLoadingPrograms: true });
        try {
          const programs = await workoutService.getPrograms();
          if ((get()._sessionEpoch ?? 0) !== epoch) {
            set({ isLoadingPrograms: false });
            return;
          }
          set({ programs, isLoadingPrograms: false });
        } catch {
          set({ isLoadingPrograms: false });
        }
      },

      fetchRoutines: async () => {
        const epoch = get()._sessionEpoch ?? 0;
        set({ isLoadingRoutines: true });
        try {
          const routines = await workoutService.getRoutines();
          if ((get()._sessionEpoch ?? 0) !== epoch) {
            set({ isLoadingRoutines: false });
            return;
          }
          set({ routines, isLoadingRoutines: false });
        } catch {
          set({ isLoadingRoutines: false });
        }
      },

      addRoutine: (routine) => set((s) => ({ routines: [routine, ...s.routines] })),

      // Replace a single routine in-place (full object including exercises).
      // Used for optimistic updates after exercise add/remove via PUT.
      replaceRoutine: (routine) => set((s) => ({
        routines: s.routines.map((r) => r.id === routine.id ? routine : r),
      })),

      updateRoutineName: async (id, name, description) => {
        const prev = get().routines.find((r) => r.id === id);
        set((s) => ({
          routines: s.routines.map((r) =>
            r.id === id ? { ...r, name, ...(description !== undefined && { description: description ?? undefined }) } : r
          ),
        }));
        workoutService.renameRoutine(id, name, description).catch(() => {
          if (prev) set((s) => ({ routines: s.routines.map((r) => (r.id === id ? prev : r)) }));
        });
      },

      duplicateRoutine: async (id) => {
        try {
          const copy = await workoutService.duplicateRoutine(id);
          set((s) => ({ routines: [copy, ...s.routines] }));
          return copy;
        } catch {
          return null;
        }
      },

      removeRoutine: async (id) => {
        const removed = get().routines.find((r) => r.id === id);
        set((s) => ({ routines: s.routines.filter((r) => r.id !== id) }));
        workoutService.deleteRoutine(id).catch((err) => {
          if (err?.response?.status !== 404 && removed) {
            set((s) => ({ routines: [...s.routines, removed] }));
          }
        });
      },

      startWorkoutFromRoutine: async (routineId, preloadedPayload) => {
        if (get().activeWorkout) return null;
        try {
          const payload = preloadedPayload ?? await workoutService.prepareRoutineWorkout(routineId);
          const workout: Workout = {
            id: `workout-${Date.now()}`,
            name: payload.name,
            routineId: payload.routineId,
            exercises: payload.exercises.map((ex, ei) => ({
              id: `we-${Date.now()}-${ei}`,
              exerciseId: ex.exerciseId,
              exercise: ex.exercise,
              order: ex.order,
              restSeconds: ex.restSeconds,
              notes: ex.notes ?? undefined,
              sets: ex.sets.map((s, si) => ({
                id: `set-${Date.now()}-${ei}-${si}`,
                setNumber: s.setNumber,
                type: (s.type as any) ?? 'normal',
                reps: s.reps,
                weight: s.weight,
                completed: false,
              })),
            })),
          };
          set({
            activeWorkout: {
              workout: { ...workout, startedAt: new Date().toISOString() },
              startTime: Date.now(),
              currentExerciseIndex: 0,
              isRestTimerActive: false,
              restTimeRemaining: 0,
            },
          });
          return workout;
        } catch {
          return null;
        }
      },

      startWorkout: (workout) => {
        // Safety guard: don't silently overwrite an in-progress workout.
        // Callers should check the returned boolean and either navigate to the
        // existing active workout or prompt the user to finish/cancel it first.
        if (get().activeWorkout) return false;
        set({
          activeWorkout: {
            workout: { ...workout, startedAt: new Date().toISOString() },
            startTime: Date.now(),
            currentExerciseIndex: 0,
            isRestTimerActive: false,
            restTimeRemaining: 0,
          },
        });
        return true;
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

        // Detect PR: compute Epley 1RM and compare against history.
        // Single-pass scan avoids the chain of flatMap + filter that creates
        // O(W*E*S) intermediate arrays per set completion.
        const { weight, reps } = completedSet;
        if (weight && reps && weight > 0 && reps > 0 && completedSet.type !== 'warmup') {
          const newRM = weight * (1 + reps / 30);
          const exerciseId = exercise.exerciseId;
          let historyBest = -1;
          for (const w of s.workoutHistory) {
            if (w.id === workout.id || !w.completedAt) continue;
            for (const ex of w.exercises) {
              if (ex.exerciseId !== exerciseId) continue;
              for (const st of ex.sets) {
                if (!st.completed || !st.weight || !st.reps || st.type === 'warmup') continue;
                const rm = st.weight * (1 + st.reps / 30);
                if (rm > historyBest) historyBest = rm;
              }
            }
          }
          completedSet.isPR = historyBest < 0 || newRM > historyBest;
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
          id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
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
        // Reject physically impossible values
        if (data.reps !== undefined && (!Number.isFinite(data.reps) || data.reps < 0)) return s;
        if (data.weight !== undefined && (!Number.isFinite(data.weight) || data.weight < 0)) return s;
        if (data.rpe !== undefined && (data.rpe < 1 || data.rpe > 10)) return s;
        sets[setIndex] = { ...sets[setIndex], ...data };
        exercise.sets = sets;
        exercises[exerciseIndex] = exercise;
        workout.exercises = exercises;
        return { activeWorkout: { ...s.activeWorkout, workout } };
      }),

      addExerciseToWorkout: (exercise) => {
        const s = get();
        if (!s.activeWorkout) return false;
        if (s.activeWorkout.workout.exercises.some((e) => e.exerciseId === exercise.id)) return false;
        const workout = { ...s.activeWorkout.workout };
        const weId = `we-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newExercise: WorkoutExercise = {
          id: weId,
          exerciseId: exercise.id,
          exercise,
          order: workout.exercises.length,
          sets: Array.from({ length: 3 }, (_, i) => ({
            id: `set-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
            setNumber: i + 1,
            type: 'normal' as const,
            reps: 10,
            weight: 0,
            completed: false,
          })),
          restSeconds: 0,
        };
        workout.exercises = [...workout.exercises, newExercise];
        set({ activeWorkout: { ...s.activeWorkout, workout } });
        return true;
      },

      replaceExerciseInWorkout: (exerciseIndex, newExercise) => {
        const s = get();
        if (!s.activeWorkout) return false;
        const exercises = s.activeWorkout.workout.exercises;
        if (exerciseIndex < 0 || exerciseIndex >= exercises.length) return false;
        // Don't allow replacing with something that's already in the workout elsewhere
        const alreadyPresent = exercises.some((e, i) => i !== exerciseIndex && e.exerciseId === newExercise.id);
        if (alreadyPresent) return false;
        const old = exercises[exerciseIndex];
        const now = Date.now();
        // Preserve set structure (count, reps, weight, type, warmup flags) but wipe
        // completed flags and PR markers so the user starts the new variant fresh.
        const preservedSets: WorkoutSet[] = old.sets.map((os, i) => ({
          id: `set-${now}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          setNumber: i + 1,
          type: os.type,
          reps: os.reps,
          weight: os.weight,
          completed: false,
        }));
        const replacement: WorkoutExercise = {
          id: `we-${now}-${Math.random().toString(36).slice(2, 7)}`,
          exerciseId: newExercise.id,
          exercise: newExercise,
          order: old.order,
          sets: preservedSets,
          restSeconds: old.restSeconds,
          ...(old.supersetGroupId ? { supersetGroupId: old.supersetGroupId } : {}),
          ...(old.notes ? { notes: old.notes } : {}),
        };
        const nextExercises = exercises.map((e, i) => i === exerciseIndex ? replacement : e);
        set({
          activeWorkout: {
            ...s.activeWorkout,
            workout: { ...s.activeWorkout.workout, exercises: nextExercises },
          },
        });
        return true;
      },

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

        const sameGroup = exercise.supersetGroupId &&
          exercise.supersetGroupId === nextExercise.supersetGroupId;

        if (sameGroup) {
          // Both already in same superset — dissolve the whole group
          const groupId = exercise.supersetGroupId!;
          for (let i = 0; i < exercises.length; i++) {
            if (exercises[i].supersetGroupId === groupId) {
              exercises[i] = { ...exercises[i], supersetGroupId: undefined };
            }
          }
        } else {
          // Create new superset between exercise and nextExercise.
          // Before linking, clean up any group that would be left with a single member.
          const cleanOrphan = (oldGroupId: string, skipIndex: number) => {
            const remaining = exercises.filter((e, i) => i !== skipIndex && e.supersetGroupId === oldGroupId);
            if (remaining.length <= 1) {
              for (let i = 0; i < exercises.length; i++) {
                if (exercises[i].supersetGroupId === oldGroupId) {
                  exercises[i] = { ...exercises[i], supersetGroupId: undefined };
                }
              }
            }
          };
          if (exercise.supersetGroupId) cleanOrphan(exercise.supersetGroupId, exerciseIndex);
          if (nextExercise.supersetGroupId) cleanOrphan(nextExercise.supersetGroupId, exerciseIndex + 1);

          const groupId = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
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

      clearUserData: () => set((s) => ({
        programs: [],
        routines: [],
        workoutHistory: [],
        activeWorkout: null,
        weekPlan: {},
        savedTemplates: [],
        customExercises: [],
        pendingSync: [],
        isLoadingPrograms: false,
        isLoadingHistory: false,
        isLoadingRoutines: false,
        // Round 249: bump epoch so any in-flight fetch* sees the
        // change on completion and discards stale data.
        _sessionEpoch: (s._sessionEpoch ?? 0) + 1,
      })),

      fetchHistory: async () => {
        if (get().isLoadingHistory) return; // prevent concurrent fetches
        const epoch = get()._sessionEpoch ?? 0;
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
          if ((get()._sessionEpoch ?? 0) !== epoch) {
            set({ isLoadingHistory: false });
            return;
          }
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
      name: 'giron-workouts',
      // Round 233 (security audit, HIGH-2 follow-up): workout history,
      // PRs, programs and weight/rep logs are personal health data.
      // AES-GCM-wrapped storage; bounded persisted snapshot is still
      // applied below (round 259) — encryption sits underneath.
      storage: createJSONStorage(() => createEncryptedAsyncStorage()),
      // Round 259: bound workoutHistory in the persisted snapshot.
      // A power user with 5+ years of training (1500+ workouts × 8
      // exercises × 5 sets ≈ 60K rows) was easily breaching
      // AsyncStorage's 6MB ceiling. Persist only the most recent 200
      // workouts — everything older lives on the server and gets
      // re-fetched on demand. fetchHistory's merge logic (line 786+)
      // re-merges any local-only entries, so this doesn't break the
      // offline-first pattern.
      partialize: (state) => ({
        programs: state.programs,
        routines: state.routines,
        // Slice to the most recent 200 — typical user has <100 in any
        // realistic timeframe, and the server is the source of truth.
        workoutHistory: state.workoutHistory.slice(0, 200),
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
