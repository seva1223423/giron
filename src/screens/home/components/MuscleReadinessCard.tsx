import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { Workout } from '../../../types';

const MUSCLE_RECOVERY_HOURS: Record<string, number> = {
  chest: 48, back: 48, shoulders: 48, biceps: 36, triceps: 36,
  quadriceps: 72, hamstrings: 72, glutes: 72, calves: 36, abs: 24,
};
const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
  triceps: 'Трицепс', quadriceps: 'Квадрицепс', hamstrings: 'Бицепс бедра',
  glutes: 'Ягодицы', calves: 'Икры', abs: 'Пресс',
};

interface Props {
  workoutHistory: Workout[];
}

export const MuscleReadinessCard: React.FC<Props> = ({ workoutHistory }) => {
  const { colors } = useThemeStore();

  const muscleReadiness = useMemo(() => {
    const lastTrained: Record<string, number> = {};
    workoutHistory.forEach((w) => {
      if (!w.completedAt) return;
      const completedMs = new Date(w.completedAt).getTime();
      w.exercises.forEach((ex) => {
        (ex.exercise?.primaryMuscles ?? []).forEach((m) => {
          if (!lastTrained[m] || completedMs > lastTrained[m]) lastTrained[m] = completedMs;
        });
      });
    });
    const now = Date.now();
    return Object.keys(MUSCLE_RECOVERY_HOURS).map((muscle) => {
      const lastMs = lastTrained[muscle];
      if (!lastMs) return { muscle, status: 'ready' as const, hoursLeft: 0 };
      const hoursSince = (now - lastMs) / 3600000;
      const needed = MUSCLE_RECOVERY_HOURS[muscle];
      const hoursLeft = Math.max(0, needed - hoursSince);
      const status = hoursLeft > 12 ? 'recovering' as const : hoursLeft > 0 ? 'almost' as const : 'ready' as const;
      return { muscle, status, hoursLeft: Math.round(hoursLeft) };
    });
  }, [workoutHistory]);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <Text style={[typography.h4, { color: colors.text }]}>Готовность мышц</Text>
        <Text style={[typography.small, { color: colors.textSecondary }]}>
          {muscleReadiness.filter((m) => m.status === 'ready').length}/{muscleReadiness.length} готовы
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {muscleReadiness.map(({ muscle, status, hoursLeft }) => {
          const dotColor = status === 'ready' ? colors.success : status === 'almost' ? colors.warning : colors.error;
          return (
            <View key={muscle} style={{
              flexDirection: 'row', alignItems: 'center', gap: 5,
              backgroundColor: dotColor + '18', borderRadius: borderRadius.sm,
              paddingVertical: 4, paddingHorizontal: spacing.sm,
              borderWidth: 1, borderColor: dotColor + '35',
            }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor }} />
              <Text style={[typography.caption, { color: colors.text, fontSize: 11 }]} numberOfLines={1}>
                {MUSCLE_LABELS[muscle]}
              </Text>
              {status !== 'ready' && (
                <Text style={[typography.caption, { color: dotColor, fontSize: 10 }]}>{hoursLeft}ч</Text>
              )}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm }}>
        {[
          { color: colors.success, label: 'Готова' },
          { color: colors.warning, label: 'Почти' },
          { color: colors.error, label: 'Восстанавливается' },
        ].map(({ color, label }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={[typography.caption, { color: colors.textTertiary, fontSize: 10 }]}>{label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
};
