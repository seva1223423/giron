import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Share, Platform, Animated, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useThemeStore, useWorkoutStore, useNutritionStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { Workout } from '../../types';
import { computeAchievements, getNewlyUnlocked } from '../../utils/achievements';
import { aiService } from '../../services/aiService';
import { scheduleStreakRiskNotification } from '../../services/notificationService';

const PR_EMOJIS = ['🏆', '🎉', '⭐', '💪', '🔥', '✨', '🥇', '💫'];
const PARTICLE_COUNT = 18;

const PRCelebration: React.FC = () => {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
      return {
        anim: new Animated.Value(0),
        angle,
        distance: 90 + Math.floor(i * 17 % 100),
        emoji: PR_EMOJIS[i % PR_EMOJIS.length],
        size: 18 + (i % 3) * 6,
      };
    })
  ).current;

  useEffect(() => {
    Animated.parallel(
      particles.map((p) =>
        Animated.timing(p.anim, {
          toValue: 1,
          duration: 900 + (p.size % 4) * 150,
          useNativeDriver: true,
        })
      )
    ).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => {
        const destX = Math.cos(p.angle) * p.distance;
        const destY = Math.sin(p.angle) * p.distance;
        const translateX = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, destX] });
        const translateY = p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, destY] });
        const opacity = p.anim.interpolate({ inputRange: [0, 0.15, 0.65, 1], outputRange: [0, 1, 1, 0] });
        const scale = p.anim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.4, 1.4, 0.7] });
        return (
          <Animated.Text
            key={i}
            style={{
              position: 'absolute',
              top: '25%',
              left: '50%',
              fontSize: p.size,
              transform: [{ translateX }, { translateY }, { scale }],
              opacity,
            }}
          >
            {p.emoji}
          </Animated.Text>
        );
      })}
    </View>
  );
};

export const WorkoutSummaryScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { workoutHistory, updateWorkoutInHistory } = useWorkoutStore();
  const { dailyLog } = useNutritionStore();
  const workout: Workout = route.params?.workout;
  const [rating, setRating] = useState<number>(workout?.rating ?? 0);
  const [sessionNote, setSessionNote] = useState<string>(workout?.notes ?? '');
  const shareCardRef = useRef<View>(null);
  const [insights, setInsights] = useState<string | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

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

  // Detect newly unlocked achievements after this workout
  const newAchievements = useMemo(() => {
    if (!workout) return [];
    const nutritionDaysLogged = Object.values(dailyLog).filter((d) => d.meals.length > 0).length;
    // Streak from workout history: consecutive days ending today
    const sortedDates = workoutHistory
      .filter((w) => w.completedAt)
      .map((w) => new Date(w.completedAt!).toDateString())
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      if (sortedDates[i] === expected.toDateString()) streak++;
      else break;
    }
    // Achievements BEFORE this workout (history without current)
    const prevHistory = workoutHistory.filter((w) => w.id !== workout.id);
    const prevAchievements = computeAchievements({ workoutHistory: prevHistory, nutritionDaysLogged, currentStreak: Math.max(0, streak - 1) });
    const prevUnlockedIds = prevAchievements.filter((a) => a.unlocked).map((a) => a.id);
    const currentAchievements = computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak: streak });
    return getNewlyUnlocked(prevUnlockedIds, currentAchievements);
  }, [workout, workoutHistory, dailyLog]);

  useEffect(() => {
    if (newPRs.length > 0 || newAchievements.length > 0) {
      haptic.success();
      setTimeout(() => haptic.success(), 400);
    } else {
      haptic.success();
    }
    // Schedule 48h streak-risk reminder so user doesn't miss next workout
    scheduleStreakRiskNotification().catch(() => {});
  }, [newPRs.length, newAchievements.length]);

  useEffect(() => {
    if (!workout) return;
    const fetchInsights = async () => {
      setLoadingInsights(true);
      try {
        const result = await aiService.getWorkoutInsights({
          name: workout.name,
          durationMinutes: workout.durationMinutes || 0,
          totalVolume: workout.totalVolume,
          notes: workout.notes,
          exercises: workout.exercises.map((ex) => ({
            name: ex.exercise.name,
            sets: ex.sets.map((s) => ({ weight: s.weight, reps: s.reps, completed: s.completed, rpe: s.rpe })),
          })),
        });
        setInsights(result);
      } catch {
        // Silently fail — insights are non-critical
      } finally {
        setLoadingInsights(false);
      }
    };
    fetchInsights();
  }, [workout?.id]);

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
    haptic.light();
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.95, result: 'tmpfile' });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Поделиться тренировкой' });
      } else {
        // Fallback: text share
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
      }
    } catch {
      // Fallback to text share on error
      const lines: string[] = [];
      lines.push(`🏋️ ${workout.name}`);
      lines.push(`⏱ ${workout.durationMinutes || 0} мин  •  📦 ${((workout.totalVolume || 0) / 1000).toFixed(1)} т`);
      lines.push(`${workout.exercises.length} упражнений  •  ${totalSets} подходов`);
      lines.push('Тренировки с Iron Gym 💪');
      await Share.share({ message: lines.join('\n') });
    }
  };

  const dateStr = workout.completedAt
    ? new Date(workout.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
    <ScrollView
      style={{ flex: 1 }}
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

      {/* Achievement unlocks banner */}
      {newAchievements.length > 0 && (
        <FadeIn delay={150}>
          <Card style={{ marginBottom: spacing.lg, backgroundColor: '#FFD70015', borderLeftWidth: 4, borderLeftColor: '#FFD700' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={{ fontSize: 24, marginRight: spacing.sm }}>🏅</Text>
              <Text style={[typography.h4, { color: '#B8860B' }]}>
                {newAchievements.length === 1 ? 'Новое достижение!' : `${newAchievements.length} новых достижения!`}
              </Text>
            </View>
            {newAchievements.map((a, i) => (
              <View
                key={a.id}
                style={[
                  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
                  i < newAchievements.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#FFD70030' },
                ]}
              >
                <Text style={{ fontSize: 22 }}>{a.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[typography.bodySemibold, { color: colors.text }]}>{a.title}</Text>
                  <Text style={[typography.small, { color: colors.textSecondary }]}>{a.description}</Text>
                </View>
                <Text style={{ fontSize: 16 }}>✅</Text>
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

      {/* AI Iron Coach Insights */}
      {(loadingInsights || insights) && (
        <FadeIn delay={610}>
          <Card style={{ marginBottom: spacing.lg, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm }}>
              <Text style={{ fontSize: 22 }}>🤖</Text>
              <Text style={[typography.captionMedium, { color: colors.primary }]}>АНАЛИЗ IRON COACH</Text>
            </View>
            {loadingInsights ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[typography.small, { color: colors.textSecondary }]}>Анализирую тренировку...</Text>
              </View>
            ) : (
              <Text style={[typography.body, { color: colors.text, lineHeight: 22 }]}>{insights}</Text>
            )}
          </Card>
        </FadeIn>
      )}

      {/* Workout rating */}
      <FadeIn delay={620}>
        <Card style={{ marginBottom: spacing.lg, alignItems: 'center' }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>
            КАК ПРОШЛА ТРЕНИРОВКА?
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => {
                  haptic.light();
                  const newRating = rating === star ? 0 : star;
                  setRating(newRating);
                  updateWorkoutInHistory(workout.id, { rating: newRating });
                }}
                style={{ padding: spacing.xs }}
              >
                <Text style={{ fontSize: 32, opacity: star <= rating ? 1 : 0.25 }}>⭐</Text>
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm }]}>
              {rating === 1 ? 'Тяжело, еле добрался' : rating === 2 ? 'Средне, бывало лучше' : rating === 3 ? 'Нормально' : rating === 4 ? 'Хорошая тренировка' : 'Огонь! Всё по максимуму 🔥'}
            </Text>
          )}
        </Card>
      </FadeIn>

      {/* Session note */}
      <FadeIn delay={640}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            ЗАМЕТКИ О ТРЕНИРОВКЕ
          </Text>
          <TextInput
            value={sessionNote}
            onChangeText={setSessionNote}
            onBlur={() => {
              if (sessionNote !== (workout.notes ?? '')) {
                updateWorkoutInHistory(workout.id, { notes: sessionNote.trim() || undefined });
              }
            }}
            placeholder="Как прошло? Самочувствие, замечания..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            style={[typography.body, { color: colors.text, backgroundColor: colors.background, borderRadius: borderRadius.md, padding: spacing.md, minHeight: 72, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.border }]}
          />
        </Card>
      </FadeIn>

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

      {/* Hidden share card — captured as image */}
      <View style={styles.shareCardWrapper}>
        <View ref={shareCardRef} style={styles.shareCard} collapsable={false}>
          {/* Background */}
          <View style={StyleSheet.absoluteFillObject}>
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#0D0D0D' }]} />
            {/* Top-right glow — red brand color */}
            <View style={styles.shareCardGlow} />
            {/* Bottom-left glow — accent complement */}
            <View style={styles.shareCardGlow2} />
          </View>

          {/* Header */}
          <View style={styles.shareCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 14 }}>🏋️</Text>
              <Text style={styles.shareCardBrand}>IRON GYM</Text>
            </View>
            <Text style={styles.shareCardDate}>{dateStr}</Text>
          </View>

          {/* Workout title */}
          <Text style={styles.shareCardTitle}>{workout.name}</Text>

          {/* PR badge — prominent if any */}
          {newPRs.length > 0 ? (
            <View style={styles.shareCardPRBadge}>
              <Text style={styles.shareCardPRText}>
                🏆 {newPRs.length === 1 ? `ЛИЧНЫЙ РЕКОРД • ${newPRs[0].name}` : `${newPRs.length} ЛИЧНЫХ РЕКОРДА`}
              </Text>
            </View>
          ) : null}

          {/* Stats row */}
          <View style={styles.shareCardStats}>
            <View style={styles.shareCardStat}>
              <Text style={styles.shareCardStatValue}>{workout.durationMinutes || 0}</Text>
              <Text style={styles.shareCardStatLabel}>МИН</Text>
            </View>
            <View style={styles.shareCardStatDivider} />
            <View style={styles.shareCardStat}>
              <Text style={styles.shareCardStatValue}>{totalSets}</Text>
              <Text style={styles.shareCardStatLabel}>ПОДХ.</Text>
            </View>
            <View style={styles.shareCardStatDivider} />
            <View style={styles.shareCardStat}>
              <Text style={styles.shareCardStatValue}>{totalReps}</Text>
              <Text style={styles.shareCardStatLabel}>ПОВТ.</Text>
            </View>
            <View style={styles.shareCardStatDivider} />
            <View style={styles.shareCardStat}>
              <Text style={[styles.shareCardStatValue, { color: '#4FC3F7' }]}>
                {((workout.totalVolume || 0) / 1000).toFixed(1)}т
              </Text>
              <Text style={styles.shareCardStatLabel}>ОБЪЁМ</Text>
            </View>
          </View>

          {/* Exercises list (top 5) */}
          <View style={styles.shareCardExercises}>
            {workout.exercises.slice(0, 5).map((ex, i) => {
              const completedSets = ex.sets.filter((s) => s.completed);
              const topSet = completedSets.reduce<{ weight: number; reps: number } | null>((best, s) => {
                const v = (s.weight || 0) * (s.reps || 0);
                return !best || v > (best.weight * best.reps) ? { weight: s.weight || 0, reps: s.reps || 0 } : best;
              }, null);
              const isExPR = newPRs.some((pr) => pr.name === ex.exercise.name);
              return (
                <View key={i} style={styles.shareCardExRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 5 }}>
                    {isExPR && <Text style={{ fontSize: 10 }}>🏆</Text>}
                    <Text style={[styles.shareCardExName, isExPR && { color: '#FFD700' }]} numberOfLines={1}>
                      {ex.exercise.name}
                    </Text>
                  </View>
                  {topSet && topSet.weight > 0 ? (
                    <Text style={styles.shareCardExSet}>
                      {topSet.weight}кг × {topSet.reps}
                    </Text>
                  ) : topSet ? (
                    <Text style={styles.shareCardExSet}>
                      {completedSets.length} подх.
                    </Text>
                  ) : null}
                </View>
              );
            })}
            {workout.exercises.length > 5 && (
              <Text style={styles.shareCardMore}>+{workout.exercises.length - 5} ещё</Text>
            )}
          </View>

          {/* Footer */}
          <View style={styles.shareCardFooter}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 9, color: '#333' }}>●</Text>
              <Text style={styles.shareCardFooterText}>СДЕЛАНО В IRON GYM</Text>
              <Text style={{ fontSize: 9, color: '#333' }}>●</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
    {/* PR confetti celebration overlay — positioned over the whole screen */}
    {newPRs.length > 0 && <PRCelebration />}
    </View>
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

  // Share card — hidden off-screen
  shareCardWrapper: {
    position: 'absolute',
    left: -9999,
    top: 0,
  },
  shareCard: {
    width: 360,
    backgroundColor: '#0D0D0D',
    borderRadius: 24,
    padding: 28,
    overflow: 'hidden',
  },
  shareCardGlow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#E53935',
    opacity: 0.18,
  },
  shareCardGlow2: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#1565C0',
    opacity: 0.14,
  },
  shareCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  shareCardBrand: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#E53935',
  },
  shareCardDate: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  shareCardTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 14,
    letterSpacing: -0.5,
  },
  shareCardPRBadge: {
    backgroundColor: '#FFD700' + '22',
    borderWidth: 1,
    borderColor: '#FFD700' + '60',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  shareCardPRText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFD700',
    letterSpacing: 1,
  },
  shareCardStats: {
    flexDirection: 'row',
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  shareCardStat: {
    flex: 1,
    alignItems: 'center',
  },
  shareCardStatValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  shareCardStatLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  shareCardStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#2A2A2A',
  },
  shareCardExercises: {
    marginBottom: 20,
  },
  shareCardExRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  shareCardExName: {
    flex: 1,
    fontSize: 13,
    color: '#CCCCCC',
    fontWeight: '500',
  },
  shareCardExSet: {
    fontSize: 13,
    color: '#E53935',
    fontWeight: '700',
    marginLeft: 8,
  },
  shareCardMore: {
    fontSize: 11,
    color: '#555',
    marginTop: 6,
    fontStyle: 'italic',
  },
  shareCardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
    paddingTop: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  shareCardFooterText: {
    fontSize: 10,
    color: '#444',
    fontWeight: '700',
    letterSpacing: 2,
  },
});
