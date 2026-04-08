import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, Alert, KeyboardAvoidingView, Platform, Animated } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../store';
import { useSettingsStore } from '../../store/useSettingsStore';
import { exercises as localExercises } from '../../data/exercises';
import { scheduleRestEndNotification, cancelRestEndNotification, scheduleStreakRiskNotification, workoutService } from '../../services';
import { Button } from '../../components';
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

  // Rest timer state
  const [restTime, setRestTime] = useState(0);
  const [restTotal, setRestTotal] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // PR toast state
  const [prToast, setPrToast] = useState<{ name: string; rm: number } | null>(null);
  const prToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Autosave every 30 seconds — use getState() to avoid stale closure
  useEffect(() => {
    if (!activeWorkout) return;
    const workoutId = activeWorkout.workout.id;
    const interval = setInterval(() => {
      const current = useWorkoutStore.getState().activeWorkout;
      if (!current || current.workout.id !== workoutId) return;
      const allSets = current.workout.exercises.flatMap((ex) =>
        ex.sets.map((s) => ({ id: s.id, reps: s.reps, weight: s.weight, completed: s.completed, rpe: s.rpe }))
      );
      if (allSets.length > 0) workoutService.autosaveWorkout(workoutId, allSets);
    }, 30000);
    return () => clearInterval(interval);
  }, [activeWorkout?.workout?.id]);

  const showPrToast = useCallback((name: string, rm: number) => {
    if (prToastTimer.current) clearTimeout(prToastTimer.current);
    setPrToast({ name, rm });
    haptic.success();
    prToastTimer.current = setTimeout(() => setPrToast(null), 3500);
  }, []);

  const startRest = (seconds: number) => {
    setRestTime(seconds);
    setRestTotal(seconds);
    setIsResting(true);
    scheduleRestEndNotification(seconds);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRestTime((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setIsResting(false);
          haptic.success();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const skipRest = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelRestEndNotification();
    setIsResting(false);
    setRestTime(0);
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

  // Swipe hint opacity (fade out after 3 seconds)
  const swipeHintOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(swipeHintOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Swipe gesture for exercise navigation
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .onEnd((event) => {
      const aw = useWorkoutStore.getState().activeWorkout;
      if (!aw) return;
      if (event.translationX < -80 && aw.currentExerciseIndex < aw.workout.exercises.length - 1) {
        nextExercise();
      } else if (event.translationX > 80 && aw.currentExerciseIndex > 0) {
        prevExercise();
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
  const elapsed = Math.round((Date.now() - startTime) / 60000);
  const totalCompletedSets = workout.exercises.reduce((s, ex) => s + ex.sets.filter((set) => set.completed).length, 0);
  const totalSets = workout.exercises.reduce((s, ex) => s + ex.sets.length, 0);

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
        showPrToast(currentExercise.exercise.name, Math.round(newRM));
      }
    }

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
        startRest(restDur);
        setTimeout(() => prevExercise(), 250);
        return;
      }
    }

    const setType = currentExercise.sets[setIndex]?.type;
    const restDur = setType === 'warmup' ? Math.max(30, Math.round(restTimerDefault * 0.4)) : (currentExercise.restSeconds || restTimerDefault);
    startRest(restDur);
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
      />

      {workout.exercises.length > 1 && (
        <Animated.Text
          style={[
            typography.small,
            { color: colors.textTertiary, textAlign: 'center', paddingVertical: 2, opacity: swipeHintOpacity },
          ]}
        >
          {'← свайпни для переключения →'}
        </Animated.Text>
      )}

      <GestureDetector gesture={swipeGesture}>
        <SetsSection
          currentExercise={currentExercise}
          currentExerciseIndex={currentExerciseIndex}
          workout={workout}
          previousSets={previousSets}
          navigation={navigation}
          onCompleteSet={handleCompleteSet}
          onRpeSelected={handleRpeSelected}
        />
      </GestureDetector>

      <PRToast toast={prToast} />
    </KeyboardAvoidingView>
  );
};
