import React from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
  triceps: 'Трицепс', quadriceps: 'Ноги', hamstrings: 'Задняя', glutes: 'Ягодицы',
  abs: 'Пресс', calves: 'Икры',
};

interface MuscleEntry { label: string; value: number }

interface Props {
  distribution: MuscleEntry[];
  delay?: number;
}

export const MuscleDistributionCard: React.FC<Props> = ({ distribution, delay = 400 }) => {
  const { colors } = useThemeStore();
  if (distribution.length === 0) return null;
  const maxSets = Math.max(1, distribution[0].value);
  return (
    <FadeIn delay={delay}>
      <Card style={{ marginTop: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Распределение нагрузки</Text>
        {distribution.map((m, i) => {
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
  );
};

export function computeMuscleDistribution(workoutHistory: { exercises: { sets: { completed: boolean }[]; exercise: { primaryMuscles: string[] } }[] }[]): MuscleEntry[] {
  const muscles: Record<string, number> = {};
  workoutHistory.forEach((w) => {
    w.exercises.forEach((ex) => {
      const completedSets = ex.sets.filter((s) => s.completed).length;
      (ex.exercise?.primaryMuscles ?? []).forEach((m) => {
        muscles[m] = (muscles[m] || 0) + completedSets;
      });
    });
  });
  return Object.entries(muscles)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, value]) => ({ label: MUSCLE_LABELS[key] || key, value }));
}
