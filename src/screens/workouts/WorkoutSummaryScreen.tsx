import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Share } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useThemeStore, useWorkoutStore, useNutritionStore } from '../../store';
import { Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing } from '../../theme/spacing';
import { computeAchievements, getNewlyUnlocked } from '../../utils/achievements';
import { scheduleStreakRiskNotification } from '../../services/notificationService';
import {
  PRCelebration,
  PRsCard,
  AchievementsCard,
  StatsCard,
  VolumeCard,
  ComparisonCard,
  BestSetCard,
  ExercisesCard,
  ProgressionCard,
  AIInsightsCard,
  WorkoutRatingCard,
  SessionNoteCard,
  ShareImageCard,
} from './summary';

export const WorkoutSummaryScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { workoutHistory } = useWorkoutStore();
  const { dailyLog } = useNutritionStore();
  const workout = route.params?.workout;
  const shareCardRef = useRef<View>(null);

  const newPRs = useMemo(() => {
    if (!workout) return [];
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
    const prs: { name: string; weight: number; reps: number; est1rm: number }[] = [];
    workout.exercises.forEach((ex: any) => {
      let best1rm = 0;
      let bestWeight = 0;
      let bestReps = 0;
      ex.sets.filter((s: any) => s.completed && s.weight && s.reps).forEach((s: any) => {
        const est1rm = (s.weight || 0) * (1 + (s.reps || 0) / 30);
        if (est1rm > best1rm) { best1rm = est1rm; bestWeight = s.weight || 0; bestReps = s.reps || 0; }
      });
      if (best1rm > 0 && (!prevBests[ex.exerciseId] || best1rm > prevBests[ex.exerciseId])) {
        prs.push({ name: ex.exercise.name, weight: bestWeight, reps: bestReps, est1rm: Math.round(best1rm) });
      }
    });
    return prs;
  }, [workout, workoutHistory]);

  const newAchievements = useMemo(() => {
    if (!workout) return [];
    const nutritionDaysLogged = Object.values(dailyLog).filter((d: any) => d.meals.length > 0).length;
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
    const prevHistory = workoutHistory.filter((w) => w.id !== workout.id);
    const prevAchievements = computeAchievements({ workoutHistory: prevHistory, nutritionDaysLogged, currentStreak: Math.max(0, streak - 1) });
    const prevUnlockedIds = prevAchievements.filter((a) => a.unlocked).map((a) => a.id);
    const currentAchievements = computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak: streak });
    return getNewlyUnlocked(prevUnlockedIds, currentAchievements);
  }, [workout, workoutHistory, dailyLog]);

  const totalSets = workout?.exercises.reduce((s: number, e: any) => s + e.sets.filter((set: any) => set.completed).length, 0) ?? 0;
  const totalReps = workout?.exercises.reduce(
    (s: number, e: any) => s + e.sets.filter((set: any) => set.completed).reduce((r: number, set: any) => r + (set.reps || 0), 0), 0
  ) ?? 0;

  const dateStr = workout?.completedAt
    ? new Date(workout.completedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    if (newPRs.length > 0 || newAchievements.length > 0) {
      haptic.success();
      setTimeout(() => haptic.success(), 400);
    } else {
      haptic.success();
    }
    scheduleStreakRiskNotification().catch(() => {});
  }, [newPRs.length, newAchievements.length]);

  const handleShare = async () => {
    haptic.light();
    try {
      const uri = await captureRef(shareCardRef, { format: 'png', quality: 0.95, result: 'tmpfile' });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Поделиться тренировкой' });
      } else {
        const lines = [
          `${workout.name}`,
          `${workout.durationMinutes || 0} мин  •  📦 ${((workout.totalVolume || 0) / 1000).toFixed(1)} т`,
          `${workout.exercises.length} упражнений  •  ${totalSets} подходов  •  ${totalReps} повторений`,
        ];
        if (newPRs.length > 0) {
          lines.push('', `Личные рекорды (${newPRs.length}):`);
          newPRs.forEach((pr) => lines.push(`  • ${pr.name}: ${pr.weight}кг × ${pr.reps} = ~${pr.est1rm}кг 1ПМ`));
        }
        lines.push('', 'Тренировки с Iron Gym');
        await Share.share({ message: lines.join('\n') });
      }
    } catch {
      await Share.share({
        message: `${workout.name}\n${workout.durationMinutes || 0} мин  •  ${totalSets} подходов\nТренировки с Iron Gym`,
      });
    }
  };

  useEffect(() => {
    if (!workout) navigation.goBack();
  }, [workout, navigation]);

  if (!workout) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingTop: safeTop }]} showsVerticalScrollIndicator={false}>
        <FadeIn delay={0} from="top">
          <View style={styles.trophySection}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: colors.accent }}>PR</Text>
            <Text style={[typography.h1, { color: colors.text, marginTop: spacing.lg }]}>Отличная работа!</Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>Тренировка завершена</Text>
          </View>
        </FadeIn>

        <FadeIn delay={100}><PRsCard prs={newPRs} /></FadeIn>
        <FadeIn delay={150}><AchievementsCard achievements={newAchievements} /></FadeIn>
        <FadeIn delay={200}><StatsCard workout={workout} totalSets={totalSets} totalReps={totalReps} /></FadeIn>
        <FadeIn delay={350}><VolumeCard workout={workout} /></FadeIn>
        <FadeIn delay={420}><ComparisonCard workout={workout} /></FadeIn>
        <FadeIn delay={450}><BestSetCard workout={workout} /></FadeIn>
        <FadeIn delay={550}><ExercisesCard workout={workout} /></FadeIn>
        <FadeIn delay={600}><ProgressionCard workout={workout} /></FadeIn>
        <FadeIn delay={610}><AIInsightsCard workout={workout} /></FadeIn>
        <FadeIn delay={620}><WorkoutRatingCard workout={workout} /></FadeIn>
        <FadeIn delay={640}><SessionNoteCard workout={workout} /></FadeIn>

        <FadeIn delay={650}>
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.huge }}>
            <Button title="Поделиться" variant="outline" onPress={handleShare} style={{ flex: 1 }} />
            <Button title="Готово" onPress={() => navigation.popToTop()} style={{ flex: 1 }} size="lg" />
          </View>
        </FadeIn>

        <ShareImageCard
          ref={shareCardRef}
          workout={workout}
          totalSets={totalSets}
          totalReps={totalReps}
          newPRs={newPRs}
          dateStr={dateStr}
        />
      </ScrollView>
      {newPRs.length > 0 && <PRCelebration />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  trophySection: { alignItems: 'center', marginBottom: spacing.xxl },
});
