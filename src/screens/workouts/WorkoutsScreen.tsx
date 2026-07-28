import React, { useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeBottom } from '../../hooks/useSafeBottom';
import { useWorkoutStore, useThemeColors, useSubscriptionStore } from '../../store';
import { AnimatedPressable, Icon, PaywallModal } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { builtInPrograms } from '../../data/programs';
import { startPlannedDay, repeatWorkout } from '../../utils/startFromPlan';
import { startWorkoutSafe } from '../../utils/startWorkoutSafe';
import type { Workout, WorkoutExercise, WorkoutSet } from '../../types';
import {
  WorkoutsHeader,
  UtilityMenu,
  TodayCard,
  ShelfStrip,
  type ShelfItem,
} from './components';

/** Ready-made splits for someone with no plan and no templates yet. */
const QUICK_SPLITS: { name: string; icon: 'dumbbell' | 'flame' | 'bolt' | 'spark' | 'trophy' | 'target' | 'heart'; exercises: string[] }[] = [
  { name: 'Грудь + трицепс', icon: 'dumbbell', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-fly', 'tricep-pushdown', 'overhead-tricep-ext'] },
  { name: 'Спина + бицепс', icon: 'dumbbell', exercises: ['deadlift', 'barbell-row', 'lat-pulldown', 'pull-ups', 'barbell-curl', 'hammer-curl'] },
  { name: 'Ноги', icon: 'flame', exercises: ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'leg-extension', 'calf-raise'] },
  { name: 'Плечи + пресс', icon: 'bolt', exercises: ['overhead-press', 'lateral-raise', 'arnold-press', 'face-pull', 'plank', 'cable-crunch'] },
  { name: 'Фулбоди', icon: 'spark', exercises: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'barbell-curl'] },
  { name: 'Базовая тройка', icon: 'trophy', exercises: ['squat', 'bench-press', 'deadlift'] },
  { name: 'Руки', icon: 'dumbbell', exercises: ['barbell-curl', 'hammer-curl', 'preacher-curl', 'tricep-pushdown', 'french-press', 'close-grip-bench'] },
  { name: 'Пресс + кор', icon: 'target', exercises: ['plank', 'cable-crunch', 'hanging-leg-raise', 'bicycle-crunch', 'russian-twist', 'side-plank'] },
];

/** Two letters as a program cover — the app has no artwork and emoji are banned. */
function cover(name: string): string {
  const words = name.trim().split(/\s+/);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}

const LEVEL_SHORT: Record<string, string> = { beginner: 'новичок', intermediate: 'опыт', advanced: 'продвинутый' };

/**
 * Workouts root — one screen that answers "what do I train today".
 *
 * It used to be three tabs (Начать / Программы / Библиотека) under a generic
 * "Начать" button. Nothing on it said what today's session was, the tab bar
 * made the user choose a category before seeing anything, and the ready
 * programs sat two taps deep behind a tab nobody opened.
 *
 * Now: today's answer at the top, saved templates and the program library on
 * shelves you scan with your eyes, and a single gold action pinned to the
 * bottom where the thumb already rests.
 */
export const WorkoutsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const safeBottom = useSafeBottom();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [showPaywall, setShowPaywall] = React.useState(false);

  const {
    fetchPrograms, fetchRoutines, activeWorkout, weekPlan, workoutHistory,
    routines, savedTemplates, customExercises, startWorkoutFromRoutine,
  } = useWorkoutStore();
  const { isPremiumActive } = useSubscriptionStore();

  useEffect(() => {
    fetchPrograms();
    if (routines.length === 0) fetchRoutines().catch(() => {});
  }, []);

  // JS weeks start on Sunday; the plan starts on Monday.
  const todayDow = useMemo(() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }, []);
  const todayPlan = weekPlan[todayDow] ?? null;
  const lastWorkout = workoutHistory[0] ?? null;
  const allExercises = useMemo(() => [...customExercises, ...localExercises], [customExercises]);

  const daysSinceLast = useMemo(() => {
    if (!lastWorkout?.completedAt) return null;
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(lastWorkout.completedAt); b.setHours(0, 0, 0, 0);
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }, [lastWorkout?.completedAt]);

  const planCount = useMemo(() => {
    if (!todayPlan) return 0;
    if (todayPlan.routineId) return routines.find((x) => x.id === todayPlan.routineId)?.exercises.length ?? 0;
    return todayPlan.exercises.length;
  }, [todayPlan, routines]);

  const hasPlan = !!todayPlan && (!!todayPlan.routineId || todayPlan.exercises.length > 0);

  const startToday = useCallback(async () => {
    haptic.medium();
    if (activeWorkout) { navigation.navigate('ActiveWorkout'); return; }

    const result = startPlannedDay(todayPlan, allExercises, navigation);
    if (result.status === 'routine') {
      try {
        const workout = await startWorkoutFromRoutine(todayPlan!.routineId!);
        if (workout) navigation.navigate('ActiveWorkout');
      } catch {
        haptic.error();
        Alert.alert('Ошибка', 'Не удалось запустить шаблон. Проверь соединение.');
      }
      return;
    }
    if (result.status === 'missing') {
      Alert.alert('Упражнения не найдены', 'Похоже, план ссылается на удалённые упражнения. Собери тренировку заново.');
      navigation.navigate('CustomWorkout');
      return;
    }
    // Nothing planned — the CTA reads "Собрать тренировку", so build one.
    if (result.status === 'empty') navigation.navigate('CustomWorkout');
  }, [activeWorkout, todayPlan, allExercises, navigation, haptic, startWorkoutFromRoutine]);

  const handleRepeat = useCallback(() => {
    if (!lastWorkout) return;
    haptic.medium();
    repeatWorkout(lastWorkout, navigation);
  }, [lastWorkout, navigation, haptic]);

  const startSplit = useCallback((split: typeof QUICK_SPLITS[0]) => {
    haptic.medium();
    const stamp = Date.now();
    const workoutExercises: WorkoutExercise[] = split.exercises
      .map((exId, index) => {
        const ex = allExercises.find((e) => e.id === exId);
        if (!ex) return null;
        const sets: WorkoutSet[] = Array.from({ length: 4 }, (_, i) => ({
          id: `set-${stamp}-${index}-${i}`,
          setNumber: i + 1, type: 'normal' as const, reps: 10, weight: 0, completed: false,
        }));
        return { id: `we-${stamp}-${index}`, exerciseId: ex.id, exercise: ex, order: index, sets, restSeconds: 0 };
      })
      .filter(Boolean) as WorkoutExercise[];
    if (workoutExercises.length === 0) {
      Alert.alert('Ошибка', 'Упражнения этого комплекса не найдены');
      return;
    }
    startWorkoutSafe({ id: `workout-${stamp}`, name: split.name, exercises: workoutExercises }, navigation);
  }, [allExercises, navigation, haptic]);

  const startTemplate = useCallback(async (item: { kind: 'routine' | 'template'; id: string; source: any }) => {
    haptic.medium();
    if (item.kind === 'routine') {
      try {
        const workout = await startWorkoutFromRoutine(item.id);
        if (workout) navigation.navigate('ActiveWorkout');
      } catch {
        haptic.error();
        Alert.alert('Ошибка', 'Не удалось запустить шаблон. Проверь соединение.');
      }
      return;
    }
    const tpl = item.source as Workout;
    const stamp = Date.now();
    startWorkoutSafe({
      ...tpl,
      id: `workout-${stamp}`,
      exercises: tpl.exercises.map((ex, ei) => ({
        ...ex,
        id: `we-${stamp}-${ei}`,
        sets: ex.sets.map((s, si) => ({ ...s, id: `set-${stamp}-${ei}-${si}`, completed: false })),
      })),
    }, navigation);
  }, [navigation, haptic, startWorkoutFromRoutine]);

  // Routines (server-backed, support progression) and local templates are one
  // idea to the user: "a workout I saved to repeat". Shown as one shelf.
  const templateItems = useMemo<ShelfItem[]>(() => [
    ...routines.map((r) => ({
      id: `r-${r.id}`,
      title: r.name,
      subtitle: `${r.exercises.length} упр.`,
      icon: 'bookmark' as const,
      onPress: () => startTemplate({ kind: 'routine', id: r.id, source: r }),
      onLongPress: () => navigation.navigate('RoutineDetail', { routineId: r.id }),
    })),
    ...savedTemplates.map((t) => ({
      id: `t-${t.id}`,
      title: t.name,
      subtitle: `${t.exercises.length} упр.`,
      icon: 'bookmark' as const,
      onPress: () => startTemplate({ kind: 'template', id: t.id, source: t }),
    })),
  ], [routines, savedTemplates, startTemplate, navigation]);

  const programItems = useMemo<ShelfItem[]>(() =>
    builtInPrograms.slice(0, 8).map((p, i) => {
      const locked = !isPremiumActive() && i >= 3;
      return {
        id: p.id,
        title: p.name,
        subtitle: `${p.daysPerWeek} дн · ${LEVEL_SHORT[p.level] ?? p.level}`,
        cover: cover(p.name),
        locked,
        onPress: () => {
          haptic.selection();
          if (locked) { haptic.warning(); setShowPaywall(true); }
          else navigation.navigate('ProgramDetail', { program: p });
        },
      };
    }), [isPremiumActive, navigation, haptic]);

  const splitItems = useMemo<ShelfItem[]>(() =>
    QUICK_SPLITS.map((s) => ({
      id: s.name,
      title: s.name,
      subtitle: `${s.exercises.length} упр.`,
      icon: s.icon,
      onPress: () => startSplit(s),
    })), [startSplit]);

  const ctaLabel = activeWorkout
    ? 'Продолжить тренировку'
    : hasPlan
      // Not "Начать: День 3 · Грудь и трицепс" — the card directly above
      // already says which session this is, and the name wrapped the button.
      ? 'Начать тренировку'
      : 'Собрать тренировку';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <WorkoutsHeader
        onSearchPress={() => navigation.navigate('ExerciseLibrary', { focusSearch: true })}
        onMenuPress={() => setMenuOpen((v) => !v)}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 96 + safeBottom }]}
        showsVerticalScrollIndicator={false}
      >
        <TodayCard
          activeName={activeWorkout ? (activeWorkout.workout.name || 'Тренировка') : null}
          plan={todayPlan}
          progressLabel={hasPlan && planCount > 0 ? `${planCount} упражнений · ~${Math.round(planCount * 11)} мин` : null}
          lastWorkout={lastWorkout}
          daysSinceLast={daysSinceLast}
          onPress={startToday}
          onRepeat={handleRepeat}
        />

        <ShelfStrip
          title="МОИ ШАБЛОНЫ"
          items={templateItems}
          moreLabel={templateItems.length > 3 ? `все ${templateItems.length}` : undefined}
          onMore={() => navigation.navigate('Routines')}
          onAdd={() => navigation.navigate('CustomWorkout')}
          addLabel="Своя"
          emptyText="Появятся, когда сохранишь тренировку"
        />

        <ShelfStrip
          title="БИБЛИОТЕКА ПРОГРАММ"
          items={programItems}
          moreLabel={`все ${builtInPrograms.length}`}
          onMore={() => navigation.navigate('ProgramLibrary')}
          onAdd={() => navigation.navigate('CreateProgram')}
          addLabel="Своя программа"
        />

        <ShelfStrip
          title="ГОТОВЫЕ КОМПЛЕКСЫ"
          items={splitItems}
        />

        {/* Week plan is what fills the card above — reachable from it. */}
        <AnimatedPressable
          onPress={() => { haptic.selection(); navigation.navigate('WeeklyPlan'); }}
          haptic={false}
          scaleDown={0.98}
          style={[styles.planRow, { borderColor: colors.border, backgroundColor: colors.surface }] as any}
          accessibilityRole="button"
          accessibilityLabel="Настроить недельный план"
        >
          <Icon name="grid" size={18} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={[typography.bodySemibold, { color: colors.text }]}>Недельный план</Text>
            {!hasPlan && (
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 1 }]}>
                Задай дни тренировок
              </Text>
            )}
          </View>
          <Icon name="chev" size={16} color={colors.textTertiary} />
        </AnimatedPressable>
      </ScrollView>

      {/* One gold action, pinned to the thumb. */}
      <View style={[styles.dock, { paddingBottom: safeBottom + spacing.md, backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <AnimatedPressable
          onPress={startToday}
          haptic={false}
          scaleDown={0.98}
          style={[styles.cta, { backgroundColor: activeWorkout ? colors.success : colors.primary }] as any}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Icon name="play" size={18} color={colors.textInverse} />
          <Text style={[typography.bodySemibold, { color: colors.textInverse }]} numberOfLines={1}>
            {ctaLabel}
          </Text>
        </AnimatedPressable>
      </View>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        reason="programs_limit"
        navigation={navigation}
      />

      <UtilityMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={(screen) => navigation.navigate(screen)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1, minHeight: 60,
  },
  dock: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1,
  },
  cta: {
    minHeight: 54, borderRadius: borderRadius.lg, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
});
