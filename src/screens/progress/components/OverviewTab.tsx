import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { WeeklyHeatmap } from './WeeklyHeatmap';
import type { Workout } from '../../../types';

interface OverviewTabProps {
  colors: any;
  workoutHistory: Workout[];
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ colors, workoutHistory }) => {
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
      if (workoutHistory.some((w) => w.completedAt && w.completedAt.startsWith(dateStr))) {
        s++;
      } else if (i > 0) {
        break;
      }
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
        .filter((wk) => {
          if (!wk.completedAt) return false;
          const d = new Date(wk.completedAt);
          return d >= weekStart && d < weekEnd;
        })
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
      const count = workoutHistory.filter((wk) => {
        if (!wk.completedAt) return false;
        const d = new Date(wk.completedAt);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeks.push({ label: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`, value: count });
    }
    return weeks;
  }, [workoutHistory]);

  const durationTrend = useMemo(() => {
    return workoutHistory
      .slice(0, 10)
      .reverse()
      .map((w, i) => ({ label: `${i + 1}`, value: w.durationMinutes || 0 }));
  }, [workoutHistory]);

  const workoutDates = useMemo(() => {
    return workoutHistory.filter((w) => w.completedAt).map((w) => w.completedAt!);
  }, [workoutHistory]);

  const muscleDistribution = useMemo(() => {
    const muscles: Record<string, number> = {};
    const labels: Record<string, string> = {
      chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
      triceps: 'Трицепс', quadriceps: 'Ноги', hamstrings: 'Задняя', glutes: 'Ягодицы',
      abs: 'Пресс', calves: 'Икры',
    };
    workoutHistory.forEach((w) => {
      w.exercises.forEach((ex) => {
        const completedSets = ex.sets.filter((s) => s.completed).length;
        ex.exercise.primaryMuscles.forEach((m) => {
          muscles[m] = (muscles[m] || 0) + completedSets;
        });
      });
    });
    return Object.entries(muscles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([key, value]) => ({ label: labels[key] || key, value }));
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

      {muscleDistribution.length > 0 && (
        <FadeIn delay={400}>
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Распределение нагрузки</Text>
            {muscleDistribution.map((m, i) => {
              const maxSets = Math.max(1, muscleDistribution[0].value);
              const pct = (m.value / maxSets) * 100;
              return (
                <View key={i} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                    <Text style={[typography.smallMedium, { color: colors.text }]}>{m.label}</Text>
                    <Text style={[typography.small, { color: colors.textSecondary }]}>{m.value} подх.</Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surface }}>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.primary, width: `${pct}%` }} />
                  </View>
                </View>
              );
            })}
          </Card>
        </FadeIn>
      )}

      {durationTrend.length >= 2 && (
        <FadeIn delay={500}>
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Длительность тренировок (мин)</Text>
            <LineChart data={durationTrend} color={colors.accent} colors={colors} suffix=" мин" />
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={600}>
        <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
          Последние тренировки
        </Text>
        {workoutHistory.length === 0 ? (
          <Card>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Нет завершённых тренировок. Начни первую!
            </Text>
          </Card>
        ) : (
          workoutHistory.slice(0, 10).map((workout, i) => (
            <FadeIn key={workout.id} delay={650 + i * 50}>
              <Card style={{ marginBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typography.bodySemibold, { color: colors.text }]}>{workout.name}</Text>
                    <Text style={[typography.small, { color: colors.textSecondary }]}>
                      {workout.exercises.length} упр. {'\u2022'} {workout.durationMinutes || 0} мин
                      {workout.totalVolume ? ` \u2022 ${Math.round(workout.totalVolume)} кг` : ''}
                    </Text>
                  </View>
                  <Text style={[typography.caption, { color: colors.textTertiary }]}>
                    {workout.completedAt
                      ? new Date(workout.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
                      : ''}
                  </Text>
                </View>
              </Card>
            </FadeIn>
          ))
        )}
      </FadeIn>
    </>
  );
};
