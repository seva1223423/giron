import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Share, Modal, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useThemeColors, useWorkoutStore, useNutritionStore } from '../../store';
import { Button, FadeIn, Card } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { computeAchievements, getNewlyUnlocked } from '../../utils/achievements';
import { computeStreak } from '../../utils/date';
import { scheduleStreakRiskNotification } from '../../services/notificationService';
import { workoutService } from '../../services';
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
  const colors = useThemeColors();
  const { workoutHistory, routines, addRoutine } = useWorkoutStore();

  // Save-as-routine modal state — lives here rather than in a card component so
  // the async call + error handling is close to the workout object.
  const [showSaveRoutine, setShowSaveRoutine] = useState(false);
  const [routineName, setRoutineName] = useState('');
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [routineSavedId, setRoutineSavedId] = useState<string | null>(null);
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
        prs.push({ name: ex.exercise?.name ?? 'Упражнение', weight: bestWeight, reps: bestReps, est1rm: Math.round(best1rm) });
      }
    });
    return prs;
  }, [workout, workoutHistory]);

  const newAchievements = useMemo(() => {
    if (!workout) return [];
    const nutritionDaysLogged = Object.values(dailyLog).filter((d: any) => (d.meals?.length ?? 0) > 0).length;
    const streak = computeStreak(workoutHistory.map((w) => w.completedAt).filter(Boolean) as string[]);
    const prevHistory = workoutHistory.filter((w) => w.id !== workout.id);
    const prevStreak = computeStreak(prevHistory.map((w) => w.completedAt).filter(Boolean) as string[]);
    const prevAchievements = computeAchievements({ workoutHistory: prevHistory, nutritionDaysLogged, currentStreak: prevStreak });
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
        lines.push('', 'Тренировки с Giron');
        await Share.share({ message: lines.join('\n') });
      }
    } catch {
      await Share.share({
        message: `${workout.name}\n${workout.durationMinutes || 0} мин  •  ${totalSets} подходов\nТренировки с Giron`,
      });
    }
  };

  useEffect(() => {
    if (!workout) navigation.goBack();
  }, [workout, navigation]);

  const openSaveRoutineModal = () => {
    haptic.selection();
    // Default name = workout name + " рутина" unless it already ends with the
    // word, so repeating this gesture doesn't keep tacking more suffixes on.
    const base = workout.name || 'Тренировка';
    const isAutoName = /^Тренировка( \d+| \w+ \d+)?$/i.test(base);
    const proposed = isAutoName ? `Рутина ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : base;
    setRoutineName(proposed);
    setShowSaveRoutine(true);
  };

  const handleSaveRoutine = async () => {
    const name = routineName.trim();
    if (!name) {
      Alert.alert('Введи название рутины');
      return;
    }
    if (routines.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert(
        'Уже существует',
        `Рутина «${name}» уже есть. Выбери другое название или переименуй старую.`,
      );
      return;
    }
    setSavingRoutine(true);
    try {
      // Keep only completed working sets for the routine template — warmups and
      // skipped sets don't represent the intended structure.
      const mapped = workout.exercises.map((ex: any, idx: number) => ({
        exerciseId: ex.exerciseId,
        order: idx,
        restSeconds: typeof ex.restSeconds === 'number' ? ex.restSeconds : 90,
        notes: ex.notes || undefined,
        sets: (ex.sets || [])
          .filter((s: any) => s.type !== 'warmup')
          .map((s: any, si: number) => ({
            setNumber: si + 1,
            type: s.type ?? 'normal',
            reps: typeof s.reps === 'number' ? s.reps : undefined,
            weight: typeof s.weight === 'number' ? s.weight : undefined,
            rpe: typeof s.rpe === 'number' ? s.rpe : undefined,
          })),
      })).filter((ex: any) => ex.sets.length > 0);

      if (mapped.length === 0) {
        Alert.alert('Нечего сохранять', 'В тренировке нет рабочих подходов.');
        setSavingRoutine(false);
        return;
      }

      const created = await workoutService.createRoutine({ name, exercises: mapped });
      addRoutine(created);
      setRoutineSavedId(created.id);
      haptic.success();
      setShowSaveRoutine(false);
    } catch {
      haptic.error();
      Alert.alert('Не удалось сохранить', 'Проверь соединение и попробуй снова.');
    } finally {
      setSavingRoutine(false);
    }
  };

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

        <FadeIn delay={645}>
          <Card style={{ marginBottom: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, marginRight: spacing.md }}>
                <Text style={[typography.bodySemibold, { color: colors.text }]}>
                  {routineSavedId ? 'Сохранено как рутина' : 'Сохранить как рутину'}
                </Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                  {routineSavedId
                    ? 'Запускай из «Мои рутины» — сервер сам будет прибавлять вес.'
                    : 'Следующий раз запустишь в один тап, с авто-прогрессией +2.5 кг.'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={routineSavedId ? () => navigation.navigate('RoutineDetail', { routineId: routineSavedId }) : openSaveRoutineModal}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 8,
                  borderRadius: borderRadius.md,
                  backgroundColor: routineSavedId ? colors.success + '18' : colors.primary + '18',
                  borderWidth: 1,
                  borderColor: routineSavedId ? colors.success + '60' : colors.primary + '60',
                }}
              >
                <Text style={[typography.captionMedium, { color: routineSavedId ? colors.success : colors.primary, fontWeight: '700' }]}>
                  {routineSavedId ? 'Открыть' : 'Сохранить'}
                </Text>
              </TouchableOpacity>
            </View>
          </Card>
        </FadeIn>

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

      <Modal visible={showSaveRoutine} transparent animationType="fade" onRequestClose={() => !savingRoutine && setShowSaveRoutine(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>
              Название рутины
            </Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.md }]}>
              Например «Грудь A» или «PPL — толкай». Сохранится на сервер, ты найдёшь её в «Мои рутины».
            </Text>
            <TextInput
              value={routineName}
              onChangeText={setRoutineName}
              placeholder="Название"
              placeholderTextColor={colors.inputPlaceholder}
              maxLength={80}
              autoFocus
              style={[styles.modalInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              editable={!savingRoutine}
            />
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
              <Button
                title="Отмена"
                variant="outline"
                onPress={() => { if (!savingRoutine) setShowSaveRoutine(false); }}
                style={{ flex: 1 }}
              />
              {savingRoutine ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : (
                <Button title="Сохранить" onPress={handleSaveRoutine} style={{ flex: 1 }} />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  trophySection: { alignItems: 'center', marginBottom: spacing.xxl },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    padding: spacing.xl,
    borderRadius: 16,
  },
  modalInput: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
  },
});
