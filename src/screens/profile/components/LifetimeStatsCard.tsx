import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useThemeStore, useWorkoutStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { localDateStr } from '../../../utils/date';

export const LifetimeStatsCard: React.FC<{ delay?: number }> = ({ delay = 100 }) => {
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();

  const stats = useMemo(() => {
    if (workoutHistory.length === 0) return null;
    const totalTonnage = workoutHistory.reduce((s, w) => s + (w.totalVolume || 0), 0);
    const totalMinutes = workoutHistory.reduce((s, w) => s + (w.durationMinutes || 0), 0);

    const sortedDates = workoutHistory
      .filter((w) => w.completedAt)
      .map((w) => localDateStr(new Date(w.completedAt!)))
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort();

    let bestStreak = 0;
    let currentStreak = 0;
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        currentStreak = 1;
      } else {
        const diffDays = Math.round((new Date(sortedDates[i]).getTime() - new Date(sortedDates[i - 1]).getTime()) / 86400000);
        currentStreak = diffDays === 1 ? currentStreak + 1 : 1;
      }
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    }

    const exCount: Record<string, { name: string; count: number }> = {};
    workoutHistory.forEach((w) => {
      w.exercises.forEach((we) => {
        const id = we.exerciseId || we.exercise?.id;
        if (!id || !we.exercise) return;
        if (!exCount[id]) exCount[id] = { name: we.exercise?.name ?? '', count: 0 };
        exCount[id].count++;
      });
    });
    const topExercise = Object.values(exCount).sort((a, b) => b.count - a.count)[0] || null;

    if (sortedDates.length === 0) return { totalTonnage, totalMinutes, bestStreak, topExercise, avgPerWeek: 0 };
    const first = new Date(sortedDates[0]);
    const last = new Date(sortedDates[sortedDates.length - 1]);
    const weeks = Math.max(1, Math.round((last.getTime() - first.getTime()) / (7 * 86400000)));
    const avgPerWeek = +(workoutHistory.length / weeks).toFixed(1);

    return { totalTonnage, totalMinutes, bestStreak, topExercise, avgPerWeek };
  }, [workoutHistory]);

  if (!stats) return null;

  return (
    <FadeIn delay={delay}>
      <Card style={{ marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>Статистика за всё время</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <StatBox emoji="◎" value={stats.totalTonnage >= 1000000 ? `${(stats.totalTonnage / 1000000).toFixed(1)}M` : stats.totalTonnage >= 1000 ? `${Math.round(stats.totalTonnage / 1000)}K` : `${stats.totalTonnage}`} label="кг поднято" bg={colors.primary + '15'} color={colors.primary} textSecondary={colors.textSecondary} />
          <StatBox emoji="◉" value={stats.totalMinutes >= 60 ? `${Math.round(stats.totalMinutes / 60)}` : `${stats.totalMinutes}`} label={stats.totalMinutes >= 60 ? 'часов в зале' : 'минут'} bg={colors.success + '15'} color={colors.success} textSecondary={colors.textSecondary} />
          <StatBox emoji="◈" value={`${stats.bestStreak}`} label="лучший стрик" bg={colors.accent + '15'} color={colors.accent} textSecondary={colors.textSecondary} />
          <StatBox emoji="◧" value={`${stats.avgPerWeek}`} label="трен/неделю" bg={colors.primary + '10'} color={colors.primary} textSecondary={colors.textSecondary} />
        </View>
        {stats.topExercise && (
          <View style={{ marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.divider }}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>Любимое упражнение</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <Text style={[typography.bodyMedium, { color: colors.text, flex: 1 }]} numberOfLines={1}>{stats.topExercise.name}</Text>
              <Text style={[typography.small, { color: colors.textSecondary }]}>{stats.topExercise.count} раз</Text>
            </View>
          </View>
        )}
      </Card>
    </FadeIn>
  );
};

const StatBox: React.FC<{ emoji: string; value: string; label: string; bg: string; color: string; textSecondary: string }> = ({ emoji, value, label, bg, color, textSecondary }) => (
  <View style={{ borderRadius: 12, padding: 12, alignItems: 'center', flex: 1, minWidth: '45%', backgroundColor: bg, borderWidth: 1, borderColor: color + '30' }}>
    <Text style={{ fontSize: 16, fontWeight: '700', color }}>{emoji}</Text>
    <Text style={[typography.number, { color, marginTop: 4 }]}>{value}</Text>
    <Text style={[typography.caption, { color: textSecondary }]} numberOfLines={1}>{label}</Text>
  </View>
);
