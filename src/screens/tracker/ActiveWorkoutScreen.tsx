import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, Alert, KeyboardAvoidingView, Platform, Animated, AppState } from 'react-native';
import ReanimatedAnimated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../store';
import { useSettingsStore } from '../../store/useSettingsStore';
import { exercises as localExercises } from '../../data/exercises';
import { scheduleRestEndNotification, cancelRestEndNotification, scheduleStreakRiskNotification, workoutService } from '../../services';
import { Button, Tooltip } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import {
  WorkoutHeader, RestTimerOverlay, ExerciseNavBar, SetsSection, PRToast,
} from './components';

export const ActiveWorkoutScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { restTimerDefault } = useSettingsStore();
  const {
    activeWorkout, workoutHistory,
    completeSet, nextExercise, prevExercise, finishWorkout, cancelWorkout,
    setRestTimer, addExerciseToWorkout,
  } = useWorkoutStore();

  // Pre-compute best 1RM per exercise from history
  const bestRMs = useMemo(() => {
    const map: Record<string, number> = {};
    workoutHistory.forEach((w) => {
      w.exercises.forEach((ex) => {
        ex.sets.filter((s) => s.completed && s.weight && s.reps).forEach((s) => {
          const rm = (s.weight || 0) * (1 + (s.reps || 0) / 30);
          if (!map[ex.exerciseId] || rm > map[ex.exerciseId]) map[ex.exerciseId] = rm;
        });
      });
    });
    return map;
  }, [workoutHistory]);

  // Track which exercises got PRs in this session
  const [sessionPRs, setSessionPRs] = useState<Set<string>>(new Set());

  // Live elapsed time counter
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeWorkout) return;
    const startTime = activeWorkout.startTime;

    // Update immediately
    setElapsed(Math.round((Date.now() - startTime) / 60000));

    // Update every 30 seconds
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTime) / 60000));
    }, 30000);

    return () => clearInterval(interval);
  }, [activeWorkout?.startTime]);

  // Rest timer state
  const [restTime, setRestTime] = useState(0);
  const [restTotal, setRestTotal] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [restingAfterLastSet, setRestingAfterLastSet] = useState(false);
  // Mirror in a ref so handleRestEnd/skipRest always read the up-to-date value even when
  // called from a stale setInterval closure (setState is async — the closure would capture false)
  const restingAfterLastSetRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Captures exercise index at the moment rest started — guards against advancing the wrong exercise
  // if the user manually swiped to another exercise while resting
  const restingExerciseIndexRef = useRef<number>(-1);

  // PR toast state
  const [prToast, setPrToast] = useState<{ name: string; rm: number; prevRm?: number } | null>(null);
  const prToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (prToastTimer.current) clearTimeout(prToastTimer.current);
    };
  }, []);

  // Autosave every 30 seconds — use getState() to avoid stale closure
  useEffect(() => {
    if (!activeWorkout) return;
    const workoutId = activeWorkout.workout.id;

    const doAutosave = () => {
      const current = useWorkoutStore.getState().activeWorkout;
      if (!current || current.workout.id !== workoutId) return;
      const allSets = current.workout.exercises.flatMap((ex) =>
        ex.sets.map((s) => ({ id: s.id, reps: s.reps, weight: s.weight, completed: s.completed, rpe: s.rpe }))
      );
      if (allSets.length > 0) workoutService.autosaveWorkout(workoutId, allSets);
    };

    const interval = setInterval(doAutosave, 30000);

    // Emergency autosave when app moves to background — don't lose the last 0–30s of sets
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') doAutosave();
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [activeWorkout?.workout?.id]);

  const showPrToast = useCallback((name: string, rm: number, prevRm?: number) => {
    if (prToastTimer.current) clearTimeout(prToastTimer.current);
    setPrToast({ name, rm, prevRm });
    haptic.success();
    prToastTimer.current = setTimeout(() => setPrToast(null), 3800);
  }, []);

  // Auto-advance to next exercise when rest is done after last set
  const handleRestEnd = useCallback(() => {
    setIsResting(false);
    haptic.success();
    const aw = useWorkoutStore.getState().activeWorkout;
    // Guard: only auto-advance if the user hasn't manually navigated to a different exercise
    // while resting (restingExerciseIndexRef captures the index at timer start)
    const stillOnSameExercise = aw && aw.currentExerciseIndex === restingExerciseIndexRef.current;
    // Read from ref (not state) — the setInterval closure captures this callback at startRest
    // time, before setState(isLastSet) has flushed; the ref is set synchronously in startRest.
    if (restingAfterLastSetRef.current && stillOnSameExercise && aw.currentExerciseIndex < aw.workout.exercises.length - 1) {
      nextExercise();
      haptic.light();
    }
    restingAfterLastSetRef.current = false;
    setRestingAfterLastSet(false);
    restingExerciseIndexRef.current = -1;
  }, []);

  const startRest = (seconds: number, isLastSet: boolean = false) => {
    setRestTime(seconds);
    setRestTotal(seconds);
    setIsResting(true);
    restingAfterLastSetRef.current = isLastSet; // sync — must be set before interval fires
    setRestingAfterLastSet(isLastSet);
    // Snapshot the exercise index at timer start — used in handleRestEnd to prevent wrong advance
    restingExerciseIndexRef.current = useWorkoutStore.getState().activeWorkout?.currentExerciseIndex ?? -1;
    scheduleRestEndNotification(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRestTime((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Use setTimeout to avoid state update during render
          setTimeout(() => handleRestEnd(), 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const skipRest = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelRestEndNotification();
    const aw = useWorkoutStore.getState().activeWorkout;
    const stillOnSameExercise = aw && aw.currentExerciseIndex === restingExerciseIndexRef.current;
    if (restingAfterLastSetRef.current && stillOnSameExercise && aw.currentExerciseIndex < aw.workout.exercises.length - 1) {
      nextExercise();
      haptic.light();
    }
    setIsResting(false);
    setRestTime(0);
    restingAfterLastSetRef.current = false;
    setRestingAfterLastSet(false);
    restingExerciseIndexRef.current = -1;
  };

  // Previous session sets for current exercise (must be before early return)
  const previousSets = useMemo(() => {
    if (!activeWorkout) return null;
    const { workout, currentExerciseIndex } = activeWorkout;
    const currentEx = workout.exercises[currentExerciseIndex];
    if (!currentEx) return null;
    const exId = currentEx.exerciseId;
    const prev = workoutHistory.find((w) =>
      w.id !== workout.id && w.exercises.some((e) => e.exerciseId === exId)
    );
    if (!prev) return null;
    const prevEx = prev.exercises.find((e) => e.exerciseId === exId);
    const done = prevEx?.sets.filter((s) => s.completed && (s.weight || s.reps)) ?? [];
    return done.length > 0 ? { date: prev.completedAt || prev.startedAt, sets: done } : null;
  }, [activeWorkout?.workout?.exercises[activeWorkout?.currentExerciseIndex ?? 0]?.exerciseId, workoutHistory, activeWorkout?.workout?.id]);

  // Exercise transition fade animation
  const exerciseOpacity = useSharedValue(1);
  const exerciseAnimStyle = useAnimatedStyle(() => ({ opacity: exerciseOpacity.value }));

  const animateExerciseChange = useCallback((direction: 'next' | 'prev') => {
    exerciseOpacity.value = withTiming(0, { duration: 100 }, () => {
      runOnJS(direction === 'next' ? nextExercise : prevExercise)();
      exerciseOpacity.value = withTiming(1, { duration: 150 });
    });
  }, [nextExercise, prevExercise]);

  // Swipe hint opacity (fade out after 3 seconds)
  const swipeHintOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(swipeHintOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Swipe gesture for exercise navigation with fade animation
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .onEnd((event) => {
      const aw = useWorkoutStore.getState().activeWorkout;
      if (!aw) return;
      if (event.translationX < -80 && aw.currentExerciseIndex < aw.workout.exercises.length - 1) {
        runOnJS(animateExerciseChange)('next');
        runOnJS(haptic.light)();
      } else if (event.translationX > 80 && aw.currentExerciseIndex > 0) {
        runOnJS(animateExerciseChange)('prev');
        runOnJS(haptic.light)();
      }
    });

  if (!activeWorkout) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={[typography.h3, { color: colors.text }]}>Нет активной тренировки</Text>
        <Button title="К тренировкам" onPress={() => navigation.goBack()} style={{ marginTop: spacing.xl }} />
      </View>
    );
  }

  const { workout, currentExerciseIndex, startTime } = activeWorkout;
  const currentExercise = workout.exercises[currentExerciseIndex];
  const totalCompletedSets = workout.exercises.reduce((s, ex) => s + ex.sets.filter((set) => set.completed).length, 0);
  const totalSets = workout.exercises.reduce((s, ex) => s + ex.sets.length, 0);

  // Check if current exercise is on its last set
  const completedSetsInCurrent = currentExercise.sets.filter((s) => s.completed).length;
  const isLastSetOfExercise = completedSetsInCurrent >= currentExercise.sets.length - 1;

  // Next exercise name for rest overlay
  const nextExerciseName = currentExerciseIndex < workout.exercises.length - 1
    ? workout.exercises[currentExerciseIndex + 1]?.exercise.name
    : null;

  // Check if current exercise has a PR from this session
  const currentExHasSessionPR = sessionPRs.has(currentExercise.exerciseId);

  const handleRpeSelected = (rpe: number) => {
    // Adjust active rest timer based on RPE
    setRestTime((current) => {
      if (current <= 0) return current;
      if (rpe >= 9.5) return current + 45;
      if (rpe >= 8.5) return current + 30;
      if (rpe <= 6) return Math.max(10, current - 30);
      return current;
    });
    setRestTotal((total) => {
      if (total <= 0) return total;
      if (rpe >= 9.5) return total + 45;
      if (rpe >= 8.5) return total + 30;
      if (rpe <= 6) return Math.max(10, total - 30);
      return total;
    });
  };

  const handleCompleteSet = (setIndex: number, reps: number, weight: number) => {
    haptic.medium();
    completeSet(currentExerciseIndex, setIndex, { reps, weight });

    // PR detection
    if (weight > 0 && reps > 0) {
      const newRM = weight * (1 + reps / 30);
      const prevBest = bestRMs[currentExercise.exerciseId] ?? 0;
      if (newRM > prevBest) {
        showPrToast(currentExercise.exercise.name, Math.round(newRM), prevBest > 0 ? Math.round(prevBest) : undefined);
        setSessionPRs((prev) => new Set(prev).add(currentExercise.exerciseId));
      }
    }

    // Check if this was the last set of the exercise
    const updatedAw = useWorkoutStore.getState().activeWorkout;
    const updatedEx = updatedAw?.workout.exercises[currentExerciseIndex];
    const allSetsCompleted = updatedEx?.sets.every((s) => s.completed) ?? false;

    // Superset auto-navigation
    const groupId = currentExercise.supersetGroupId;
    if (groupId) {
      const nextEx = workout.exercises[currentExerciseIndex + 1];
      const prevEx = workout.exercises[currentExerciseIndex - 1];
      if (nextEx?.supersetGroupId === groupId) {
        haptic.selection();
        setTimeout(() => nextExercise(), 250);
        return;
      } else if (prevEx?.supersetGroupId === groupId) {
        const setType = currentExercise.sets[setIndex]?.type;
        const restDur = setType === 'warmup' ? Math.max(30, Math.round(restTimerDefault * 0.4)) : (currentExercise.restSeconds || restTimerDefault);
        startRest(restDur, allSetsCompleted);
        setTimeout(() => prevExercise(), 250);
        return;
      }
    }

    const setType = currentExercise.sets[setIndex]?.type;
    const restDur = setType === 'warmup' ? Math.max(30, Math.round(restTimerDefault * 0.4)) : (currentExercise.restSeconds || restTimerDefault);
    startRest(restDur, allSetsCompleted);
  };

  const handleFinish = () => {
    Alert.alert('Завершить тренировку?', 'Прогресс будет сохранён', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Завершить',
        onPress: () => {
          cancelRestEndNotification();
          haptic.success();
          scheduleStreakRiskNotification();
          const completed = finishWorkout();
          if (completed) navigation.replace('WorkoutSummary', { workout: completed });
          else navigation.goBack();
        },
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert('Отменить тренировку?', 'Прогресс не будет сохранён', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Да, отменить',
        style: 'destructive',
        onPress: () => { cancelRestEndNotification(); cancelWorkout(); navigation.goBack(); },
      },
    ]);
  };

  const handleSubstitute = () => {
    const primaryMuscle = currentExercise.exercise.primaryMuscles?.[0];
    const alternatives = localExercises
      .filter((ex) => ex.id !== currentExercise.exerciseId && ex.primaryMuscles?.includes(primaryMuscle as any))
      .slice(0, 3);

    if (alternatives.length === 0) {
      Alert.alert('Замена', 'Не найдено альтернативных упражнений');
      return;
    }

    const buttons = alternatives.map((ex) => ({
      text: ex.name,
      onPress: () => {
        addExerciseToWorkout(ex);
        Alert.alert('Готово', `"${ex.name}" добавлено в тренировку`);
      },
    }));
    buttons.push({ text: 'Отмена', onPress: () => {} } as any);

    Alert.alert('Альтернативы', `Похожие упражнения (${primaryMuscle}):`, buttons);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <WorkoutHeader
        workout={workout}
        elapsed={elapsed}
        totalCompletedSets={totalCompletedSets}
        totalSets={totalSets}
        onCancel={handleCancel}
        onFinish={handleFinish}
      />

      <RestTimerOverlay
        isResting={isResting}
        restTime={restTime}
        restTotal={restTotal}
        onSkip={skipRest}
        onAddTime={(sec) => { setRestTime((r) => r + sec); setRestTotal((t) => t + sec); }}
        nextExerciseName={nextExerciseName}
        isLastSetOfExercise={restingAfterLastSet}
      />

      {/* Overall progress bar */}
      <View style={{ paddingHorizontal: spacing.xl, backgroundColor: colors.surface }}>
        <View style={{ height: 3, borderRadius: 1.5, backgroundColor: colors.border }}>
          <View style={{ height: 3, borderRadius: 1.5, backgroundColor: colors.primary, width: `${totalSets > 0 ? (totalCompletedSets / totalSets) * 100 : 0}%` }} />
        </View>
      </View>

      <ExerciseNavBar
        currentExercise={currentExercise}
        currentExerciseIndex={currentExerciseIndex}
        totalExercises={workout.exercises.length}
        onPrev={prevExercise}
        onNext={nextExercise}
        onSubstitute={handleSubstitute}
        hasSessionPR={currentExHasSessionPR}
        navigation={navigation}
      />
      <Tooltip tipId="workout-swipe" text="Свайпни влево/вправо для переключения между упражнениями" position="top" />

      {workout.exercises.length > 1 && (
        <Animated.Text
          style={[
            typography.small,
            { color: colors.textTertiary, textAlign: 'center', paddingVertical: 2, opacity: swipeHintOpacity },
          ]}
        >
          {'<- свайпни для переключения ->'}
        </Animated.Text>
      )}

      <GestureDetector gesture={swipeGesture}>
        <ReanimatedAnimated.View style={[{ flex: 1 }, exerciseAnimStyle]}>
          <SetsSection
            currentExercise={currentExercise}
            currentExerciseIndex={currentExerciseIndex}
            workout={workout}
            previousSets={previousSets}
            navigation={navigation}
            onCompleteSet={handleCompleteSet}
            onRpeSelected={handleRpeSelected}
          />
        </ReanimatedAnimated.View>
      </GestureDetector>

      <PRToast toast={prToast} />
    </KeyboardAvoidingView>
  );
};
