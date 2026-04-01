import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Share } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { Workout } from '../../types';

export const WorkoutSummaryScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const workout: Workout = route.params?.workout;

  // Detect new personal records: compare this workout's 1RM per exercise vs history
  const newPRs = useMemo(() => {
    if (!workout) return [];

    // Build previous bests from history (excluding current workout)
    const prevBests: Record<string, number> = {};
    workoutHistory.forEach((w) => {
      if (w.id === workout.id) return;
      w.exercises.forEach((ex) => {
        ex.sets.filter((s) => s.completed && s.weight && s.reps).forEach((s) => {
          const est1rm = (s.weight || 0) * (1 + (s.reps || 0) / 30);
          if (!prevBests[ex.exerciseId] || est1rm > prevBests[ex.exerciseId]) {
            prevBests[ex.exerciseId] = est1rm;
          }
        });
      });
    });

    // Find exercises where this workout beat the previous best
    const prs: { name: string; weight: number; reps: number; est1rm: number }[] = [];
    workout.exercises.forEach((ex) => {
      let best1rm = 0;
      let bestWeight = 0;
      let bestReps = 0;
      ex.sets.filter((s) => s.completed && s.weight && s.reps).forEach((s) => {
        const est1rm = (s.weight || 0) * (1 + (s.reps || 0) / 30);
        if (est1rm > best1rm) {
          best1rm = est1rm;
          bestWeight = s.weight || 0;
          bestReps = s.reps || 0;
        }
      });

      if (best1rm > 0 && (!prevBests[ex.exerciseId] || best1rm > prevBests[ex.exerciseId])) {
        prs.push({ name: ex.exercise.name, weight: bestWeight, reps: bestReps, est1rm: Math.round(best1rm) });
      }
    });

    return prs;
  }, [workout, workoutHistory]);

  useEffect(() => {
    if (newPRs.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 400);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [newPRs.length]);

  if (!workout) {
    navigation.goBack();
    return null;
  }

  const totalSets = workout.exercises.reduce((s, e) => s + e.sets.filter((set) => set.completed).length, 0);
  const totalReps = workout.exercises.reduce(
    (s, e) => s + e.sets.filter((set) => set.completed).reduce((r, set) => r + (set.reps || 0), 0), 0
  );

  // Average RPE (if any sets have RPE)
  const rpeValues = workout.exercises
    .flatMap((e) => e.sets.filter((s) => s.completed && s.rpe))
    .map((s) => s.rpe as number);
  const avgRpe = rpeValues.length > 0
    ? (rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1)
    : null;

  // Compare vs previous same-name workout
  const prevSameWorkout = workoutHistory.find(
    (w) => w.id !== workout.id && w.name === workout.name && w.completedAt
  );
  const volumeDiff = prevSameWorkout && workout.totalVolume && prevSameWorkout.totalVolume
    ? Math.round(workout.totalVolume - prevSameWorkout.totalVolume)
    : null;
  const durationDiff = prevSameWorkout && workout.durationMinutes && prevSameWorkout.durationMinutes
    ? workout.durationMinutes - prevSameWorkout.durationMinutes
    : null;

  // Find best set by volume (weight * reps)
  let bestExerciseName = '';
  let bestSetWeight = 0;
  let bestSetReps = 0;
  workout.exercises.forEach((ex) => {
    ex.sets.filter((s) => s.completed).forEach((s) => {
      const volume = (s.weight || 0) * (s.reps || 0);
      if (volume > bestSetWeight * bestSetReps) {
        bestExerciseName = ex.exercise.name;
        bestSetWeight = s.weight || 0;
        bestSetReps = s.reps || 0;
      }
    });
  });

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lines: string[] = [];
    lines.push(`🏋️ ${workout.name}`);
    lines.push(`⏱ ${workout.durationMinutes || 0} мин  •  📦 ${((workout.totalVolume || 0) / 1000).toFixed(1)} т`);
    lines.push(`${workout.exercises.length} упражнений  •  ${totalSets} подходов  •  ${totalReps} повторений`);
    if (newPRs.length > 0) {
      lines.push('');
      lines.push(`🏆 Личные рекорды (${newPRs.length}):`);
      newPRs.forEach((pr) => lines.push(`  • ${pr.name}: ${pr.weight}кг × ${pr.reps} = ~${pr.est1rm}кг 1ПМ`));
    }
    lines.push('');
    lines.push('Тренировки с Iron Gym 💪');
    await Share.share({ message: lines.join('\n') });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Trophy */}
      <FadeIn delay={0} from="top">
        <View style={styles.trophySection}>
          <Text style={{ fontSize: 64 }}>🏆</Text>
          <Text style={[typography.h1, { color: colors.text, marginTop: spacing.lg }]}>
            Отличная работа!
          </Text>
          <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>
            Тренировка завершена
          </Text>
        </View>
      </FadeIn>

      {/* Personal Records celebration */}
      {newPRs.length > 0 && (
        <FadeIn delay={100}>
          <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.accent + '15', borderLeftWidth: 4, borderLeftColor: colors.accent }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ fontSize: 24, marginRight: spacing.sm }}>🎉</Text>
              <Text style={[typography.h4, { color: colors.accent }]}>
                {newPRs.length === 1 ? 'Новый личный рекорд!' : `${newPRs.length} новых рекорда!`}
              </Text>
            </View>
            {newPRs.map((pr, i) => (
              <View key={i} style={[{ paddingVertical: spacing.xs }, i < newPRs.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.accent + '30' }]}>
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{pr.name}</Text>
                <Text style={[typography.small, { color: colors.textSecondary }]}>
                  {pr.weight} кг × {pr.reps} повт. • ~1ПМ: {pr.est1rm} кг
                </Text>
              </View>
            ))}
          </Card>
        </FadeIn>
      )}

      {/* Main stats */}
      <FadeIn delay={200}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xl, textAlign: 'center' }]}>
            {workout.name}
          </Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCell}>
              <Text style={[typography.number, { color: colors.primary }]}>
                {workout.durationMinutes || 0}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>минут</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[typography.number, { color: colors.calories }]}>
                {workout.exercises.length}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>упражнений</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[typography.number, { color: colors.protein }]}>
                {totalSets}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>подходов</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[typography.number, { color: colors.accent }]}>
                {totalReps}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>повторений</Text>
            </View>
          </View>
        </Card>
      </FadeIn>

      {/* Volume */}
      <FadeIn delay={350}>
        <Card style={{ marginBottom: spacing.lg, backgroundColor: colors.primary + '10' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={[typography.captionMedium, { color: colors.primary }]}>ОБЩИЙ ОБЪЁМ</Text>
              <Text style={[typography.h1, { color: colors.primary, marginTop: spacing.xs }]}>
                {Math.round(workout.totalVolume || 0).toLocaleString()} кг
              </Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                {((workout.totalVolume || 0) / 1000).toFixed(1)} тонн
              </Text>
            </View>
            {avgRpe && (
              <View style={{ alignItems: 'center' }}>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Ср. RPE</Text>
                <Text style={[typography.numberSmall, { color: parseFloat(avgRpe) >= 9 ? colors.error : parseFloat(avgRpe) >= 8 ? colors.accent : colors.success }]}>
                  {avgRpe}
                </Text>
              </View>
            )}
          </View>
        </Card>
      </FadeIn>

      {/* Comparison vs previous */}
      {prevSameWorkout && volumeDiff !== null && (
        <FadeIn delay={420}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>
              VS ПРОШЛЫЙ РАЗ ({new Date(prevSameWorkout.completedAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })})
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.xxl, marginTop: spacing.md }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={[typography.numberSmall, {
                    color: volumeDiff > 0 ? colors.success : volumeDiff < 0 ? colors.error : colors.textSecondary,
                    fontSize: 22,
                  }]}>
                    {volumeDiff > 0 ? '+' : ''}{volumeDiff}
                  </Text>
                  <Text style={[typography.caption, { color: volumeDiff > 0 ? colors.success : volumeDiff < 0 ? colors.error : colors.textSecondary }]}>
                    {volumeDiff > 0 ? '▲' : volumeDiff < 0 ? '▼' : '—'}
                  </Text>
                </View>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>кг объём</Text>
              </View>
              {durationDiff !== null && (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Text style={[typography.numberSmall, {
                      color: durationDiff < 0 ? colors.success : durationDiff > 5 ? colors.error : colors.textSecondary,
                      fontSize: 22,
                    }]}>
                      {durationDiff > 0 ? '+' : ''}{durationDiff}
                    </Text>
                    <Text style={[typography.caption, { color: durationDiff < 0 ? colors.success : durationDiff > 5 ? colors.error : colors.textSecondary }]}>
                      {durationDiff < 0 ? '▲' : durationDiff > 0 ? '▼' : '—'}
                    </Text>
                  </View>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>мин</Text>
                </View>
              )}
            </View>
          </Card>
        </FadeIn>
      )}

      {/* Best set */}
      {bestExerciseName && (
        <FadeIn delay={450}>
          <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.accent }}>
            <Text style={[typography.captionMedium, { color: colors.accent }]}>ЛУЧШИЙ ПОДХОД</Text>
            <Text style={[typography.h4, { color: colors.text, marginTop: spacing.xs }]}>
              {bestExerciseName}
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
              {bestSetWeight} кг x {bestSetReps} повт.
            </Text>
          </Card>
        </FadeIn>
      )}

      {/* Exercise breakdown */}
      <FadeIn delay={550}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Упражнения
          </Text>
          {workout.exercises.map((ex, i) => {
            const completedSets = ex.sets.filter((s) => s.completed);
            const exVolume = completedSets.reduce((s, set) => s + (set.weight || 0) * (set.reps || 0), 0);

            return (
              <View
                key={ex.id}
                style={[
                  styles.exerciseRow,
                  i < workout.exercises.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>
                    {ex.exercise.name}
                  </Text>
                  <Text style={[typography.small, { color: colors.textSecondary }]}>
                    {completedSets.length} подх. • {Math.round(exVolume)} кг
                  </Text>
                  {ex.notes ? (
                    <Text style={[typography.small, { color: colors.textTertiary, marginTop: 2, fontStyle: 'italic' }]} numberOfLines={2}>
                      📝 {ex.notes}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {completedSets.map((s, si) => (
                    <Text key={si} style={[typography.caption, { color: colors.textTertiary }]}>
                      {s.weight || 0}x{s.reps || 0}
                    </Text>
                  ))}
                </View>
              </View>
            );
          })}
        </Card>
      </FadeIn>

      {/* Progressive overload suggestions */}
      {(() => {
        const suggestions = workout.exercises.flatMap((ex) => {
          const completedSets = ex.sets.filter((s) => s.completed && s.weight && s.reps);
          if (completedSets.length === 0) return [];
          const allDone = completedSets.length === ex.sets.length;
          if (!allDone) return [];
          const avgReps = completedSets.reduce((s, set) => s + (set.reps || 0), 0) / completedSets.length;
          const maxWeight = Math.max(...completedSets.map((s) => s.weight || 0));
          if (avgReps < 10) return [];
          const increment = maxWeight >= 100 ? 5 : 2.5;
          return [{ name: ex.exercise.name, currentWeight: maxWeight, nextWeight: maxWeight + increment }];
        });
        if (suggestions.length === 0) return null;
        return (
          <FadeIn delay={600}>
            <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.success }}>
              <Text style={[typography.captionMedium, { color: colors.success }]}>ПРОГРЕССИВНАЯ НАГРУЗКА</Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md }]}>
                Все подходы выполнены — попробуй прибавить вес в следующий раз:
              </Text>
              {suggestions.map((s, i) => (
                <View key={i} style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }, i < suggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
                  <Text style={[typography.small, { color: colors.text, flex: 1 }]}>{s.name}</Text>
                  <Text style={[typography.smallMedium, { color: colors.success }]}>{s.currentWeight} → {s.nextWeight} кг</Text>
                </View>
              ))}
            </Card>
          </FadeIn>
        );
      })()}

      {/* Actions */}
      <FadeIn delay={650}>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.huge }}>
          <Button
            title="📤 Поделиться"
            variant="outline"
            onPress={handleShare}
            style={{ flex: 1 }}
          />
          <Button
            title="Готово"
            onPress={() => navigation.popToTop()}
            style={{ flex: 1 }}
            size="lg"
          />
        </View>
      </FadeIn>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  trophySection: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCell: {
    width: '48%',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  exerciseRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
  },
});
