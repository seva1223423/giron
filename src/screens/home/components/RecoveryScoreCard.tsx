import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useThemeStore, useWorkoutStore, useCardioStore } from '../../../store';
import { useSleepStore } from '../../../store/useSleepStore';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

export const RecoveryScoreCard: React.FC = () => {
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const { getAverageDuration, getAverageQuality, getLastEntries } = useSleepStore();
  const { getWeekSessions } = useCardioStore();

  const recovery = useMemo(() => {
    let score = 100;
    const reasons: string[] = [];

    // Factor 1: Days since last workout
    const lastWorkout = workoutHistory[0];
    const daysSince = lastWorkout?.completedAt
      ? Math.round((Date.now() - new Date(lastWorkout.completedAt).getTime()) / 86400000)
      : 999;

    if (daysSince === 0) { score -= 30; reasons.push('Тренировался сегодня'); }
    else if (daysSince === 1) { score -= 15; reasons.push('Тренировался вчера'); }

    // Factor 2: Training frequency (last 7 days)
    const weekAgo = Date.now() - 7 * 86400000;
    const weekWorkouts = workoutHistory.filter(w => w.completedAt && new Date(w.completedAt).getTime() > weekAgo).length;
    if (weekWorkouts >= 6) { score -= 25; reasons.push(`${weekWorkouts} тренировок за неделю`); }
    else if (weekWorkouts >= 5) { score -= 15; reasons.push(`${weekWorkouts} тренировок за неделю`); }

    // Factor 3: Average RPE last workout
    if (lastWorkout && daysSince <= 2) {
      const rpes = lastWorkout.exercises.flatMap(e => e.sets.filter(s => s.rpe).map(s => s.rpe!));
      if (rpes.length > 0) {
        const avgRpe = rpes.reduce((a, b) => a + b, 0) / rpes.length;
        if (avgRpe >= 9) { score -= 20; reasons.push(`Высокий RPE: ${avgRpe.toFixed(1)}`); }
        else if (avgRpe >= 8) { score -= 10; reasons.push(`RPE: ${avgRpe.toFixed(1)}`); }
      }
    }

    // Factor 4: Sleep duration (last 3 nights)
    const avgSleep = getAverageDuration(3);
    if (avgSleep > 0 && avgSleep < 6) { score -= 20; reasons.push(`Мало сна: ${avgSleep}ч`); }
    else if (avgSleep > 0 && avgSleep < 7) { score -= 10; reasons.push(`Недостаточно сна: ${avgSleep}ч`); }
    else if (avgSleep >= 7) { score += 5; }

    // Factor 5: Sleep quality (last 3 nights)
    const avgQuality = getAverageQuality(3);
    if (avgQuality > 0 && avgQuality < 2.5) { score -= 15; reasons.push(`Плохое качество сна: ${avgQuality.toFixed(1)}/5`); }
    else if (avgQuality >= 4) { score += 5; reasons.push(`Хороший сон: ${avgQuality.toFixed(1)}/5`); }

    // Factor 6: Cardio load (last 7 days)
    const cardioSessions = getWeekSessions();
    if (cardioSessions.length > 0) {
      const totalCardioMin = cardioSessions.reduce((s, c) => s + c.durationMinutes, 0);
      const highIntensity = cardioSessions.filter(c => c.type === 'hiit' || (c.avgHeartRate && c.avgHeartRate > 160));
      if (highIntensity.length >= 3) { score -= 15; reasons.push(`${highIntensity.length} HIIT-сессии за неделю`); }
      else if (totalCardioMin >= 300) { score -= 10; reasons.push(`${Math.round(totalCardioMin / 60)}ч кардио за неделю`); }
    }

    score = Math.max(0, Math.min(100, score));

    const label = score >= 80 ? 'Готов к тренировке' : score >= 50 ? 'Умеренное восстановление' : 'Нужен отдых';
    const color = score >= 80 ? colors.success : score >= 50 ? colors.warning : colors.error;
    const icon = score >= 80 ? '▲' : score >= 50 ? '●' : '▼';

    // Last sleep entry detail
    const lastSleep = getLastEntries(1)[0] ?? null;

    return { score, label, color, icon, reasons, lastSleep, avgSleep, avgQuality };
  }, [workoutHistory, getAverageDuration, getAverageQuality, getLastEntries, getWeekSessions]);

  return (
    <FadeIn delay={180}>
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: recovery.color + '18', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: recovery.color }}>{recovery.icon}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
              <Text style={[typography.h3, { color: recovery.color }]}>{recovery.score}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>/ 100</Text>
            </View>
            <Text style={[typography.smallMedium, { color: recovery.color }]}>{recovery.label}</Text>
          </View>
          {/* Last sleep detail */}
          {recovery.lastSleep && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[typography.captionMedium, { color: colors.primary }]}>
                🌙 {recovery.lastSleep.durationHours.toFixed(1)}ч
              </Text>
              {recovery.lastSleep.quality && (
                <Text style={[typography.caption, { color: colors.textTertiary }]}>
                  {'★'.repeat(recovery.lastSleep.quality)}{'☆'.repeat(5 - recovery.lastSleep.quality)}
                </Text>
              )}
            </View>
          )}
        </View>
        {recovery.reasons.length > 0 && (
          <View style={{ marginTop: spacing.sm }}>
            {recovery.reasons.map((r, i) => (
              <Text key={i} style={[typography.small, { color: colors.textTertiary }]}>• {r}</Text>
            ))}
          </View>
        )}
      </Card>
    </FadeIn>
  );
};
