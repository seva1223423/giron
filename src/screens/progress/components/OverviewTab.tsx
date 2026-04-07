import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { WeeklyHeatmap } from './WeeklyHeatmap';
import { MuscleDistributionCard, computeMuscleDistribution } from './MuscleDistributionCard';
import { WorkoutHistoryList } from './WorkoutHistoryList';
import { useCardioStore } from '../../../store';
import type { Workout } from '../../../types';

interface OverviewTabProps {
  colors: any;
  workoutHistory: Workout[];
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ colors, workoutHistory }) => {
  const { getWeekSessions } = useCardioStore();
  const weekCardio = getWeekSessions();
  const cardioWeekMinutes = weekCardio.reduce((s, c) => s + c.durationMinutes, 0);
  const cardioWeekKm = weekCardio.reduce((s, c) => s + (c.distanceKm ?? 0), 0);

  const totalWorkouts = workoutHistory.length;
  const totalVolume = workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0);
  const totalDuration = workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0);

  const streak = useMemo(() => {
    if (workoutHistory.length === 0) return 0;
    let s = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      if (workoutHistory.some((w) => w.completedAt && w.completedAt.startsWith(dateStr))) s++;
      else if (i > 0) break;
    }
    return s;
  }, [workoutHistory]);

  const weeklyVolumeData = useMemo(() => {
    const weeks: { label: string; value: number }[] = [];
    const today = new Date();
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - w * 7 - today.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const volume = workoutHistory
        .filter((wk) => { if (!wk.completedAt) return false; const d = new Date(wk.completedAt); return d >= weekStart && d < weekEnd; })
        .reduce((s, wk) => s + (wk.totalVolume || 0), 0);
      weeks.push({ label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`, value: Math.round(volume) });
    }
    return weeks;
  }, [workoutHistory]);

  const weeklyCountData = useMemo(() => {
    const weeks: { label: string; value: number }[] = [];
    const today = new Date();
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - w * 7 - today.getDay() + 1);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const count = workoutHistory.filter((wk) => { if (!wk.completedAt) return false; const d = new Date(wk.completedAt); return d >= weekStart && d < weekEnd; }).length;
      weeks.push({ label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`, value: count });
    }
    return weeks;
  }, [workoutHistory]);

  const durationTrend = useMemo(() => workoutHistory.slice(0, 10).reverse().map((w, i) => ({ label: `${i + 1}`, value: w.durationMinutes || 0 })), [workoutHistory]);
  const workoutDates = useMemo(() => workoutHistory.filter((w) => w.completedAt).map((w) => w.completedAt!), [workoutHistory]);
  const muscleDistribution = useMemo(() => computeMuscleDistribution(workoutHistory), [workoutHistory]);

  const MUSCLE_LABELS: Record<string, string> = {
    chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
    triceps: 'Трицепс', quadriceps: 'Квадр.', hamstrings: 'Бицепс б.', glutes: 'Ягодицы',
    calves: 'Икры', abs: 'Пресс', lats: 'Широч.', traps: 'Трапеции',
  };

  const weeklyMuscleVolume = useMemo(() => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);

    const volumeMap: Record<string, number> = {};
    workoutHistory
      .filter((w) => w.completedAt && new Date(w.completedAt) >= weekStart)
      .forEach((w) => {
        w.exercises.forEach((ex) => {
          const vol = ex.sets
            .filter((s) => s.completed && s.weight && s.reps)
            .reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
          if (vol === 0) return;
          ex.exercise.primaryMuscles.forEach((m) => {
            volumeMap[m] = (volumeMap[m] || 0) + vol;
          });
        });
      });

    return Object.entries(volumeMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([muscle, volume]) => ({
        label: MUSCLE_LABELS[muscle] || muscle,
        value: Math.round(volume),
      }));
  }, [workoutHistory]);

  return (
    <>
      <FadeIn delay={0}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.primary }]}>{totalWorkouts}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
          </Card>
          <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.success }]}>{streak}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Дней подряд</Text>
          </Card>
          <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.accent }]}>{Math.round(totalVolume / 1000)}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Тонн всего</Text>
          </Card>
          <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center' }}>
            <Text style={[typography.number, { color: colors.primary }]}>{totalDuration}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Минут</Text>
          </Card>
          {cardioWeekMinutes > 0 && (
            <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center' }}>
              <Text style={[typography.number, { color: colors.info }]}>{cardioWeekMinutes}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                {cardioWeekKm > 0 ? `Кардио мин (${cardioWeekKm.toFixed(1)}км)` : 'Кардио мин/нед'}
              </Text>
            </Card>
          )}
        </View>
      </FadeIn>

      <FadeIn delay={100}>
        <Card style={{ marginTop: spacing.xl }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Активность</Text>
          <WeeklyHeatmap workoutDates={workoutDates} colors={colors} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: spacing.sm, gap: spacing.xs }}>
            <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>Мало</Text>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.surface }} />
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success + '70' }} />
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success }} />
            <Text style={[typography.small, { color: colors.textTertiary, fontSize: 10 }]}>Много</Text>
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={200}>
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Объём по неделям (кг)</Text>
          <BarChart data={weeklyVolumeData} color={colors.primary} colors={colors} />
        </Card>
      </FadeIn>

      <FadeIn delay={300}>
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Тренировок в неделю</Text>
          <BarChart data={weeklyCountData} color={colors.success} height={100} colors={colors} />
        </Card>
      </FadeIn>

      {weeklyMuscleVolume.length > 0 && (
        <FadeIn delay={380}>
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Объём за неделю по мышцам (кг)</Text>
            <BarChart data={weeklyMuscleVolume} color={colors.accent} height={120} colors={colors} />
          </Card>
        </FadeIn>
      )}

      <MuscleDistributionCard distribution={muscleDistribution} delay={400} />

      {durationTrend.length >= 2 && (
        <FadeIn delay={500}>
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Длительность тренировок (мин)</Text>
            <LineChart data={durationTrend} color={colors.accent} colors={colors} suffix=" мин" />
          </Card>
        </FadeIn>
      )}

      <WorkoutHistoryList workouts={workoutHistory} delay={600} />
    </>
  );
};
