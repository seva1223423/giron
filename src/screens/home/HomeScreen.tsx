import React, { useEffect, useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useAuthStore, useWorkoutStore, useNutritionStore } from '../../store';
import { exercises as localExercises } from '../../data/exercises';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';
import { FadeIn, Card, Button } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { scheduleInactivityReminder, scheduleWeeklySummaryNotification, showTodayPlanNotification } from '../../services/notificationService';
import {
  HomeHeader, WorkoutStatusCard, TodayPlanCard, RecommendationCard,
  StreakWarningCard, LastWorkoutCard, WeeklyStatsCard, MuscleReadinessCard,
  NutritionCard, WeightCard, AITipCard, DailyQuoteCard, WaterCard, CardioWeekCard,
} from './components';

const SPLITS = [
  { name: 'Грудь + Трицепс', muscles: ['chest', 'triceps'], emoji: '💪' },
  { name: 'Спина + Бицепс', muscles: ['back', 'biceps', 'lats'], emoji: '🏋️' },
  { name: 'Ноги', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves'], emoji: '🦵' },
  { name: 'Плечи + Пресс', muscles: ['shoulders', 'abs'], emoji: '🎯' },
  { name: 'Фулбоди', muscles: ['chest', 'back', 'quadriceps'], emoji: '⚡' },
];

import { todayDateStr, localDateStr } from '../../utils/date';
const todayDate = todayDateStr;

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { user, setUser } = useAuthStore();
  const { programs, workoutHistory, activeWorkout, weekPlan, fetchPrograms, fetchHistory, startWorkout, customExercises } = useWorkoutStore();
  const { getDayLog } = useNutritionStore();

  useEffect(() => {
    fetchPrograms();
    fetchHistory();
  }, []);

  const today = todayDate();
  const dayLog = getDayLog(today);
  const activeProgram = programs.find((p) => p.isActive) ?? null;
  const todayDow = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const todayPlan = weekPlan[todayDow] ?? null;
  const lastWorkout = workoutHistory[0] ?? null;
  const daysSinceLastWorkout = useMemo(() => {
    if (!lastWorkout?.completedAt) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const workoutDate = new Date(lastWorkout.completedAt);
    workoutDate.setHours(0, 0, 0, 0);
    return Math.round((today.getTime() - workoutDate.getTime()) / 86400000);
  }, [lastWorkout?.completedAt]);

  const { weekWorkoutsCount, weekVolume, bestWorkoutName } = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const weekWorkouts = workoutHistory.filter(
      (w) => w.completedAt && new Date(w.completedAt).getTime() >= sevenDaysAgo
    );
    const vol = weekWorkouts.reduce((s, w) => s + (w.totalVolume ?? 0), 0);
    const best = weekWorkouts.reduce<Workout | null>(
      (prev, curr) => (!prev || (curr.totalVolume ?? 0) > (prev.totalVolume ?? 0) ? curr : prev),
      null
    );
    return {
      weekWorkoutsCount: weekWorkouts.length,
      weekVolume: Math.round(vol),
      bestWorkoutName: best?.name,
    };
  }, [workoutHistory]);

  const streak = useMemo(() => {
    if (workoutHistory.length === 0) return 0;
    let s = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = localDateStr(d);
      if (workoutHistory.some((w) => w.completedAt?.startsWith(ds))) s++;
      else if (i > 0) break;
    }
    return s;
  }, [workoutHistory]);

  useEffect(() => {
    if (daysSinceLastWorkout !== null) {
      scheduleInactivityReminder(daysSinceLastWorkout);
    }
    scheduleWeeklySummaryNotification(weekWorkoutsCount, weekVolume, bestWorkoutName);
    showTodayPlanNotification(
      todayPlan?.name ?? null,
      todayPlan?.exercises?.length ?? 0,
      streak,
    );
  }, [daysSinceLastWorkout, weekWorkoutsCount, weekVolume, bestWorkoutName, todayPlan, streak]);

  const restDayRecommendation = useMemo(() => {
    if (streak >= 4) return {
      reason: `Вы тренируетесь ${streak} ${streak < 5 ? 'дня' : 'дней'} подряд`,
      tip: 'Мышцы растут во время отдыха. Дайте телу восстановиться сегодня.',
    };
    if (lastWorkout && daysSinceLastWorkout !== null && daysSinceLastWorkout <= 1) {
      const completedSets = lastWorkout.exercises.flatMap((ex) => ex.sets).filter((s) => s.completed && s.rpe != null);
      if (completedSets.length >= 3) {
        const avgRpe = completedSets.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / completedSets.length;
        if (avgRpe >= 8.5) return {
          reason: `Последняя тренировка была очень тяжёлой (RPE ${avgRpe.toFixed(1)})`,
          tip: 'Высокая нагрузка требует полного восстановления. Отдохни сегодня.',
        };
      }
    }
    return null;
  }, [streak, lastWorkout, daysSinceLastWorkout]);

  const workoutRecommendation = useMemo(() => {
    if (activeProgram?.workouts?.length) {
      const withLastDone = activeProgram.workouts.map((pw: any) => {
        const lastMatch = workoutHistory
          .filter((h) => h.completedAt && h.name === pw.name)
          .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];
        const daysAgo = lastMatch
          ? Math.floor((Date.now() - new Date(lastMatch.completedAt!).getTime()) / 86400000)
          : 999;
        return { name: pw.name, id: pw.id, daysSince: daysAgo, programWorkout: pw };
      });
      const next = withLastDone.sort((a: any, b: any) => b.daysSince - a.daysSince)[0];
      const daysLabel = next.daysSince >= 999 ? 'Ещё не делал'
        : next.daysSince === 0 ? 'Уже сегодня'
        : `${next.daysSince} ${next.daysSince === 1 ? 'день' : next.daysSince < 5 ? 'дня' : 'дней'} назад`;
      return { name: next.name, emoji: '🏋️', daysLabel, programWorkout: next.programWorkout };
    }
    const splitLastDays = SPLITS.map((split) => {
      let lastDay = 999;
      workoutHistory.forEach((w) => {
        if (!w.completedAt) return;
        const hasThisSplit = w.exercises.some((ex) =>
          ex.exercise.primaryMuscles.some((m) => split.muscles.includes(m))
        );
        if (hasThisSplit) {
          const daysAgo = Math.floor((Date.now() - new Date(w.completedAt).getTime()) / 86400000);
          if (daysAgo < lastDay) lastDay = daysAgo;
        }
      });
      return { ...split, daysSince: lastDay };
    });
    const rec = splitLastDays.sort((a, b) => b.daysSince - a.daysSince)[0];
    const daysLabel = rec.daysSince >= 999 ? 'Ещё не тренировал'
      : rec.daysSince === 0 ? 'Уже сегодня'
      : `${rec.daysSince} ${rec.daysSince === 1 ? 'день' : rec.daysSince < 5 ? 'дня' : 'дней'} назад`;
    return { name: rec.name, emoji: rec.emoji, daysLabel, programWorkout: null };
  }, [workoutHistory, activeProgram]);

  // Check if all program workouts done this week → show progression suggestion
  const weekCompletionSuggestion = useMemo(() => {
    if (!activeProgram || activeProgram.workouts.length === 0) return null;
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const thisWeekNames = new Set(
      workoutHistory
        .filter((w) => w.completedAt && new Date(w.completedAt) >= weekStart)
        .map((w) => w.name)
    );
    const allDone = activeProgram.workouts.every((pw: any) => thisWeekNames.has(pw.name));
    return allDone ? activeProgram.name : null;
  }, [activeProgram, workoutHistory]);

  const handleStartPlannedWorkout = () => {
    if (!todayPlan || todayPlan.exercises.length === 0) return;
    haptic.medium();
    const allExercises = [...customExercises, ...localExercises];
    const workoutExercises: WorkoutExercise[] = todayPlan.exercises
      .map((exId: string, index: number) => {
        const ex = allExercises.find((e) => e.id === exId);
        if (!ex) return null;
        const sets: WorkoutSet[] = Array.from({ length: 4 }, (_, i) => ({
          id: `set-${Date.now()}-${index}-${i}`,
          setNumber: i + 1, type: 'normal' as const, reps: 10, weight: 0, completed: false,
        }));
        return { id: `we-${Date.now()}-${index}`, exerciseId: ex.id, exercise: ex, order: index, sets, restSeconds: 0 };
      })
      .filter(Boolean) as WorkoutExercise[];
    startWorkout({ id: `workout-${Date.now()}`, name: todayPlan.name, exercises: workoutExercises });
    navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' });
  };

  const handleRepeatWorkout = () => {
    if (!lastWorkout || activeWorkout) return;
    haptic.medium();
    const workoutExercises: WorkoutExercise[] = lastWorkout.exercises.map((we, index) => {
      const sets: WorkoutSet[] = we.sets.map((s, i) => ({
        id: `set-${Date.now()}-${index}-${i}`,
        setNumber: i + 1, type: s.type, reps: s.reps, weight: s.weight, completed: false,
      }));
      return { ...we, id: `we-${Date.now()}-${index}`, sets };
    });
    startWorkout({ id: `workout-${Date.now()}`, name: lastWorkout.name, exercises: workoutExercises });
    navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge }}
      showsVerticalScrollIndicator={false}
    >
      <FadeIn delay={0} from="top">
        <HomeHeader navigation={navigation} />
      </FadeIn>

      <FadeIn delay={100}>
        <WorkoutStatusCard navigation={navigation} />
      </FadeIn>

      {!activeWorkout && todayPlan && todayPlan.type !== 'cardio' && (
        <FadeIn delay={140}>
          <TodayPlanCard todayPlan={todayPlan} onStart={handleStartPlannedWorkout} />
        </FadeIn>
      )}

      {!activeWorkout && todayPlan?.type === 'cardio' && (
        <FadeIn delay={140}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 32, marginBottom: spacing.sm }}>{todayPlan.emoji}</Text>
            <Text style={[typography.h4, { color: colors.text }]}>{todayPlan.name}</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.md }]}>Запланировано на сегодня</Text>
            <Button title="Открыть кардио" onPress={() => navigation.navigate('WorkoutsTab', { screen: 'Cardio' })} fullWidth />
          </Card>
        </FadeIn>
      )}

      {!activeWorkout && (
        <FadeIn delay={150}>
          <RecommendationCard
            restDayRecommendation={restDayRecommendation}
            workoutRecommendation={workoutRecommendation}
            activeProgram={activeProgram}
            haptic={haptic}
            startWorkout={startWorkout}
            navigation={navigation}
          />
        </FadeIn>
      )}

      {!activeWorkout && streak > 0 && daysSinceLastWorkout !== null && daysSinceLastWorkout >= 2 && (
        <FadeIn delay={180}>
          <StreakWarningCard streak={streak} navigation={navigation} />
        </FadeIn>
      )}

      {lastWorkout && daysSinceLastWorkout !== null && daysSinceLastWorkout <= 7 && (
        <FadeIn delay={175}>
          <LastWorkoutCard
            lastWorkout={lastWorkout}
            daysSinceLastWorkout={daysSinceLastWorkout}
            activeWorkout={activeWorkout}
            onRepeat={handleRepeatWorkout}
          />
        </FadeIn>
      )}

      {weekCompletionSuggestion && !activeWorkout && (
        <FadeIn delay={195}>
          <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.success }}>
            <Text style={{ fontSize: 28, marginBottom: spacing.sm }}>🎉</Text>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xs }]}>Неделя завершена!</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
              Все тренировки программы «{weekCompletionSuggestion}» выполнены на этой неделе.
            </Text>
            <Text style={[typography.bodyMedium, { color: colors.success }]}>
              💡 На следующей неделе добавь +2.5 кг на основных упражнениях для прогрессии.
            </Text>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={200}>
        <WeeklyStatsCard workoutHistory={workoutHistory} weekPlan={weekPlan} streak={streak} navigation={navigation} />
      </FadeIn>

      {workoutHistory.length > 0 && (
        <FadeIn delay={260}>
          <MuscleReadinessCard workoutHistory={workoutHistory} />
        </FadeIn>
      )}

      <FadeIn delay={300}>
        <NutritionCard dayLog={dayLog} navigation={navigation} />
      </FadeIn>

      <FadeIn delay={390}>
        <WeightCard user={user} setUser={setUser} />
      </FadeIn>

      <FadeIn delay={395}>
        <CardioWeekCard navigation={navigation} />
      </FadeIn>

      <FadeIn delay={400}>
        <AITipCard navigation={navigation} />
      </FadeIn>

      <FadeIn delay={450}>
        <DailyQuoteCard />
      </FadeIn>

      <FadeIn delay={500}>
        <WaterCard dayLog={dayLog} today={today} />
      </FadeIn>
    </ScrollView>
  );
};
