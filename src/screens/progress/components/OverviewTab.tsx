import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { BarChart } from './BarChart';
import { LineChart } from './LineChart';
import { WeeklyHeatmap } from './WeeklyHeatmap';
import { MuscleDistributionCard, computeMuscleDistribution } from './MuscleDistributionCard';
import { MuscleHeatmapCard } from './MuscleHeatmapCard';
import { WorkoutHistoryList } from './WorkoutHistoryList';
import { WeeklyInsightsCard } from './WeeklyInsightsCard';
import { useCardioStore } from '../../../store';
import { getMonday, localDateStr, formatNum, computeStreak } from '../../../utils/date';
import type { Workout } from '../../../types';

interface OverviewTabProps {
  colors: any;
  workoutHistory: Workout[];
  navigation?: any;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ colors, workoutHistory, navigation }) => {
  const { getWeekSessions } = useCardioStore();
  const weekCardio = getWeekSessions();
  const cardioWeekMinutes = weekCardio.reduce((s, c) => s + c.durationMinutes, 0);
  const cardioWeekKm = weekCardio.reduce((s, c) => s + (c.distanceKm ?? 0), 0);

  const totalWorkouts = workoutHistory.length;
  const totalVolume = workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0);
  const totalDuration = workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0);

  const streak = useMemo(() =>
    computeStreak(workoutHistory.map((w) => w.completedAt).filter(Boolean) as string[]),
  [workoutHistory]);

  const { weeklyVolumeData, weeklyCountData } = useMemo(() => {
    const volumes: { label: string; value: number }[] = [];
    const counts: { label: string; value: number }[] = [];
    const thisMonday = getMonday();
    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(thisMonday);
      weekStart.setDate(thisMonday.getDate() - w * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const weekWorkouts = workoutHistory.filter((wk) => {
        if (!wk.completedAt) return false;
        const d = new Date(wk.completedAt);
        return d >= weekStart && d < weekEnd;
      });
      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
      volumes.push({ label, value: Math.round(weekWorkouts.reduce((s, wk) => s + (wk.totalVolume || 0), 0)) });
      counts.push({ label, value: weekWorkouts.length });
    }
    return { weeklyVolumeData: volumes, weeklyCountData: counts };
  }, [workoutHistory]);

  const durationTrend = useMemo(() => workoutHistory.slice(0, 10).reverse().map((w, i) => ({ label: `${i + 1}`, value: w.durationMinutes || 0 })), [workoutHistory]);
  const workoutDates = useMemo(() => workoutHistory.filter((w) => w.completedAt).map((w) => localDateStr(new Date(w.completedAt!))), [workoutHistory]);
  const muscleDistribution = useMemo(() => computeMuscleDistribution(workoutHistory), [workoutHistory]);

  const muscleImbalances = useMemo(() => {
    const fourWeeksAgo = Date.now() - 28 * 86400000;
    const recent = workoutHistory.filter((w) => w.completedAt && new Date(w.completedAt).getTime() > fourWeeksAgo);
    if (recent.length < 4) return [];

    const sets: Record<string, number> = {};
    recent.forEach((w) => {
      w.exercises.forEach((ex) => {
        const done = ex.sets.filter((s) => s.completed).length;
        (ex.exercise?.primaryMuscles ?? []).forEach((m) => { sets[m] = (sets[m] || 0) + done; });
      });
    });

    const alerts: string[] = [];
    const PAIRS: Array<{ a: string[]; aLabel: string; b: string[]; bLabel: string }> = [
      { a: ['chest', 'triceps', 'shoulders'], aLabel: 'Жим', b: ['back', 'biceps', 'lats'], bLabel: 'Тяга' },
      { a: ['quadriceps'], aLabel: 'Квадрицепс', b: ['hamstrings', 'glutes'], bLabel: 'Задняя цепь' },
    ];
    PAIRS.forEach(({ a, aLabel, b, bLabel }) => {
      const sumA = a.reduce((s, m) => s + (sets[m] || 0), 0);
      const sumB = b.reduce((s, m) => s + (sets[m] || 0), 0);
      if (sumA === 0 || sumB === 0) return;
      const ratio = sumA / sumB;
      if (ratio >= 2.5) alerts.push(`${aLabel} (${sumA} подх.) >> ${bLabel} (${sumB} подх.) — добавь тяговые`);
      else if (ratio <= 0.4) alerts.push(`${bLabel} (${sumB} подх.) >> ${aLabel} (${sumA} подх.) — добавь жимовые`);
    });
    return alerts;
  }, [workoutHistory]);

  const MUSCLE_LABELS: Record<string, string> = {
    chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
    triceps: 'Трицепс', quadriceps: 'Квадр.', hamstrings: 'Бицепс б.', glutes: 'Ягодицы',
    calves: 'Икры', abs: 'Пресс', lats: 'Широч.', traps: 'Трапеции',
  };

  const weeklyMuscleVolume = useMemo(() => {
    const weekStart = getMonday();

    const volumeMap: Record<string, number> = {};
    workoutHistory
      .filter((w) => w.completedAt && new Date(w.completedAt) >= weekStart)
      .forEach((w) => {
        w.exercises.forEach((ex) => {
          const vol = ex.sets
            .filter((s) => s.completed && s.weight && s.reps)
            .reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
          if (vol === 0) return;
          (ex.exercise?.primaryMuscles ?? []).forEach((m) => {
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

  const weekComparison = useMemo(() => {
    const thisWeekStart = getMonday();
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeek = workoutHistory.filter(w => w.completedAt && new Date(w.completedAt) >= thisWeekStart);
    const lastWeek = workoutHistory.filter(w => {
      if (!w.completedAt) return false;
      const d = new Date(w.completedAt);
      return d >= lastWeekStart && d < thisWeekStart;
    });

    const thisCount = thisWeek.length;
    const lastCount = lastWeek.length;
    const thisVol = thisWeek.reduce((s, w) => s + (w.totalVolume || 0), 0);
    const lastVol = lastWeek.reduce((s, w) => s + (w.totalVolume || 0), 0);
    const thisDur = thisWeek.reduce((s, w) => s + (w.durationMinutes || 0), 0);
    const lastDur = lastWeek.reduce((s, w) => s + (w.durationMinutes || 0), 0);

    return { thisCount, lastCount, thisVol, lastVol, thisDur, lastDur };
  }, [workoutHistory]);

  return (
    <>
      <FadeIn delay={0}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: colors.primary }}>
            <Text style={[typography.number, { color: colors.primary }]}>{totalWorkouts}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
          </Card>
          <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: colors.success }}>
            <Text style={[typography.number, { color: colors.success }]}>{streak}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Дней подряд</Text>
          </Card>
          <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: colors.accent }}>
            <Text style={[typography.number, { color: colors.accent }]}>{Math.round(totalVolume / 1000)}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Тонн всего</Text>
          </Card>
          <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: colors.primary }}>
            <Text style={[typography.number, { color: colors.primary }]}>{totalDuration}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Минут</Text>
          </Card>
          {cardioWeekMinutes > 0 && (
            <Card style={{ flex: 1, minWidth: '45%', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: colors.info }}>
              <Text style={[typography.number, { color: colors.info }]}>{cardioWeekMinutes}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                {cardioWeekKm > 0 ? `Кардио мин (${formatNum(cardioWeekKm)}км)` : 'Кардио мин/нед'}
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

      {(weekComparison.lastCount > 0 || weekComparison.thisCount > 0) && (
        <FadeIn delay={350}>
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Неделя vs неделя</Text>
            {(() => {
              const comparisonIcon = (current: number, previous: number): { icon: string; color: string; pct: string } => {
                if (previous === 0) return { icon: '—', color: colors.textTertiary, pct: '' };
                const pct = Math.round(((current - previous) / previous) * 100);
                if (pct > 0) return { icon: '▲', color: colors.success, pct: `+${pct}%` };
                if (pct < 0) return { icon: '▼', color: colors.error, pct: `${pct}%` };
                return { icon: '=', color: colors.textTertiary, pct: '0%' };
              };
              const rows = [
                { label: 'Тренировок', current: weekComparison.thisCount, previous: weekComparison.lastCount, suffix: '' },
                { label: 'Объём', current: Math.round(weekComparison.thisVol), previous: Math.round(weekComparison.lastVol), suffix: ' кг' },
                { label: 'Время', current: weekComparison.thisDur, previous: weekComparison.lastDur, suffix: ' мин' },
              ];
              return rows.map((row) => {
                const cmp = comparisonIcon(row.current, row.previous);
                return (
                  <View key={row.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm }}>
                    <Text style={[typography.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                      {row.label}: <Text style={{ fontWeight: '700' }}>{row.current}{row.suffix}</Text> vs {row.previous}{row.suffix}
                    </Text>
                    <View style={{ backgroundColor: cmp.color + '15', borderWidth: 1, borderColor: cmp.color + '40', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, marginLeft: spacing.sm, flexShrink: 0 }}>
                      <Text style={{ color: cmp.color, fontWeight: '700', fontSize: 12 }}>
                        {cmp.icon} {cmp.pct}
                      </Text>
                    </View>
                  </View>
                );
              });
            })()}
          </Card>
        </FadeIn>
      )}

      {weeklyMuscleVolume.length > 0 && (
        <FadeIn delay={380}>
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Объём за неделю по мышцам (кг)</Text>
            <BarChart data={weeklyMuscleVolume} color={colors.accent} height={120} colors={colors} />
          </Card>
        </FadeIn>
      )}

      {muscleImbalances.length > 0 && (
        <FadeIn delay={390}>
          <Card style={{ marginTop: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.warning }}>
            <Text style={[typography.smallMedium, { color: colors.warning, marginBottom: spacing.xs }]}>
              Дисбаланс нагрузки (4 недели)
            </Text>
            {muscleImbalances.map((alert, i) => (
              <Text key={i} style={[typography.small, { color: colors.textSecondary }]}>• {alert}</Text>
            ))}
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={390}>
        <MuscleHeatmapCard colors={colors} workoutHistory={workoutHistory} />
      </FadeIn>

      <MuscleDistributionCard distribution={muscleDistribution} delay={400} />

      {durationTrend.length >= 2 && (
        <FadeIn delay={500}>
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Длительность тренировок (мин)</Text>
            <LineChart data={durationTrend} color={colors.accent} colors={colors} suffix=" мин" />
          </Card>
        </FadeIn>
      )}

      <WeeklyInsightsCard colors={colors} workoutHistory={workoutHistory} />

      <WorkoutHistoryList workouts={workoutHistory} delay={600} navigation={navigation} />
    </>
  );
};
