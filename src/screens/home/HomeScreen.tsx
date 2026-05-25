import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { ScrollView, View, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { AnimatedPressable } from '../../components';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeColors, useAuthStore, useWorkoutStore, useNutritionStore } from '../../store';
import { exercises as localExercises } from '../../data/exercises';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';
import { FadeIn, Button, Card, Icon, Spinner } from '../../components';
import { spacing, borderRadius } from '../../theme/spacing';
import { scheduleInactivityReminder, scheduleWeeklySummaryNotification, showTodayPlanNotification } from '../../services/notificationService';
import { adminService } from '../../services/adminService';
import { authService } from '../../services/authService';
import type { AnnouncementType } from '../../types';
// Round 233 (2026-05-02 audit): trimmed imports to ONLY rendered components.
// Previously 11 of these were imported but never used (~1300 LOC dead bundle).
// The files remain in ./components/ for future re-introduction.
import {
  HomeHeader,
  AICoachCard, RingStatsCard, StreakPRGrid, WeekPlanStrip, QuickActionsGrid,
  AnnouncementsBanner, FirstWorkoutBanner,
} from './components';
import { Text, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { typography } from '../../theme';

// Round 233 (2026-05-02 audit): replaced banned unicode glyph '◎' icons
// with Direction A Icon names. Each split now picks a domain-relevant icon
// from the 38-icon SVG set (src/components/Icon.tsx).
// Round 244: Icon value comes from the consolidated `../../components`
// import on line 8 (Card/Spinner sit alongside it). Just the IconName
// type alias here.
import type { IconName } from '../../components/Icon';
const SPLITS: Array<{ name: string; muscles: string[]; iconName: IconName }> = [
  { name: 'Грудь + Трицепс', muscles: ['chest', 'triceps'], iconName: 'dumbbell' },
  { name: 'Спина + Бицепс', muscles: ['back', 'biceps', 'lats'], iconName: 'dumbbell' },
  { name: 'Ноги', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves'], iconName: 'bolt' },
  { name: 'Плечи + Пресс', muscles: ['shoulders', 'abs'], iconName: 'target' },
  { name: 'Фулбоди', muscles: ['chest', 'back', 'quadriceps'], iconName: 'flame' },
];

import { todayDateStr, computeStreak } from '../../utils/date';
import { startWorkoutSafe } from '../../utils/startWorkoutSafe';
import {
  buildWeekDotsFromHistory,
  findHeaviestPR,
  todayMondayIndex,
  calorieDayProgress,
  deriveWeekPlanDays,
} from '../../utils/homeDerivations';
import { useSafeTop } from '../../hooks/useSafeTop';
const todayDate = todayDateStr;

const SectionDivider: React.FC<{ label: string; colors: any }> = ({ label, colors }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.md }}>
    <View style={{ flex: 1, height: 1.5, backgroundColor: colors.primary + '20' }} />
    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.2, marginHorizontal: spacing.md }}>{label}</Text>
    <View style={{ flex: 1, height: 1.5, backgroundColor: colors.primary + '20' }} />
  </View>
);

// Round 233 (2026-05-02 audit): banned palette '#F59E0B/#EF4444/#10B981'
// replaced with Direction A semantic tokens; emoji 'ℹ️ ⚠️ 🔧 🎁' replaced
// with Icon names. Build via builder so we can resolve theme at render.
function buildAnnouncementMeta(c: { primary: string; warning: string; error: string; success: string }):
  Record<AnnouncementType, { color: string; iconName: IconName }> {
  return {
    info: { color: c.primary, iconName: 'bell' },
    warning: { color: c.warning, iconName: 'flame' },
    maintenance: { color: c.error, iconName: 'settings' },
    promo: { color: c.success, iconName: 'spark' },
  };
}

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; body: string; type: AnnouncementType; createdAt: string }>>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false);
  const [firstWorkoutBannerDismissed, setFirstWorkoutBannerDismissed] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [showEmailVerifModal, setShowEmailVerifModal] = useState(false);
  const [emailVerifCode, setEmailVerifCode] = useState('');
  const [emailVerifLoading, setEmailVerifLoading] = useState(false);
  const [emailVerifError, setEmailVerifError] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendCountdown = (seconds = 60) => {
    setResendCountdown(seconds);
    if (countdownRef.current) clearInterval(countdownRef.current);
    const id = setInterval(() => {
      setResendCountdown((s) => {
        if (s <= 1) { clearInterval(id); countdownRef.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
    countdownRef.current = id;
  };

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);
  const { user } = useAuthStore();
  // Per-slice selectors instead of full-store destructure. Default
  // destructure subscribes to every field — including restTimeRemaining
  // which ticks every second during an active workout, re-rendering the
  // whole HomeScreen tree once per second for no reason.
  const programs = useWorkoutStore((s) => s.programs);
  const workoutHistory = useWorkoutStore((s) => s.workoutHistory);
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const weekPlan = useWorkoutStore((s) => s.weekPlan);
  const isLoadingHistory = useWorkoutStore((s) => s.isLoadingHistory);
  const customExercises = useWorkoutStore((s) => s.customExercises);
  const fetchPrograms = useWorkoutStore((s) => s.fetchPrograms);
  const fetchHistory = useWorkoutStore((s) => s.fetchHistory);
  const fetchWeekPlan = useWorkoutStore((s) => s.fetchWeekPlan);
  const startWorkoutFromRoutine = useWorkoutStore((s) => s.startWorkoutFromRoutine);
  const { getDayLog } = useNutritionStore();

  useEffect(() => {
    fetchPrograms();
    fetchHistory();
    fetchWeekPlan();
    // Fetch active announcements (fire and forget)
    adminService.getActiveAnnouncements().then(setAnnouncements).catch(() => {});
  }, []);

  const today = todayDate();
  const dayLog = getDayLog(today);
  const activeProgram = programs.find((p) => p.isActive) ?? null;
  const todayDow = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const todayPlan = weekPlan[todayDow] ?? null;
  const lastWorkout = workoutHistory[0] ?? null;
  const daysSinceLastWorkout = useMemo(() => {
    if (!lastWorkout?.completedAt) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const workoutDate = new Date(lastWorkout.completedAt);
    workoutDate.setHours(0, 0, 0, 0);
    return Math.round((today.getTime() - workoutDate.getTime()) / 86400000);
  }, [lastWorkout?.completedAt]);

  const { weekWorkoutsCount, weekVolume, bestWorkoutName } = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const weekWorkouts = workoutHistory.filter(
      (w) => w.completedAt && new Date(w.completedAt).getTime() >= sevenDaysAgo
    );
    const vol = weekWorkouts.reduce((s, w) => s + (w.totalVolume ?? 0), 0);
    const best = weekWorkouts.reduce<Workout | null>(
      (prev, curr) => (!prev || (curr.totalVolume ?? 0) > (prev.totalVolume ?? 0) ? curr : prev),
      null
    );
    return {
      weekWorkoutsCount: weekWorkouts.length,
      weekVolume: Math.round(vol),
      bestWorkoutName: best?.name,
    };
  }, [workoutHistory]);

  const streak = useMemo(() =>
    computeStreak(workoutHistory.map((w) => w.completedAt).filter(Boolean) as string[]),
  [workoutHistory]);

  useEffect(() => {
    if (daysSinceLastWorkout !== null) {
      scheduleInactivityReminder(daysSinceLastWorkout);
    }
    scheduleWeeklySummaryNotification(weekWorkoutsCount, weekVolume, bestWorkoutName);
    showTodayPlanNotification(
      todayPlan?.name ?? null,
      todayPlan?.exercises?.length ?? 0,
      streak,
    );
  }, [daysSinceLastWorkout, weekWorkoutsCount, weekVolume, bestWorkoutName, todayPlan, streak]);

  const restDayRecommendation = useMemo(() => {
    if (streak >= 4) return {
      reason: `Вы тренируетесь ${streak} ${streak < 5 ? 'дня' : 'дней'} подряд`,
      tip: 'Мышцы растут во время отдыха. Дайте телу восстановиться сегодня.',
    };
    if (lastWorkout && daysSinceLastWorkout !== null && daysSinceLastWorkout <= 1) {
      const completedSets = (lastWorkout.exercises ?? []).flatMap((ex) => ex.sets ?? []).filter((s) => s.completed && s.rpe != null);
      if (completedSets.length >= 3) {
        const avgRpe = completedSets.reduce((sum, s) => sum + (s.rpe ?? 0), 0) / completedSets.length;
        if (avgRpe >= 8.5) return {
          reason: `Последняя тренировка была очень тяжёлой (RPE ${avgRpe.toFixed(1)})`,
          tip: 'Высокая нагрузка требует полного восстановления. Отдохни сегодня.',
        };
      }
    }
    return null;
  }, [streak, lastWorkout, daysSinceLastWorkout]);

  const workoutRecommendation = useMemo(() => {
    if (activeProgram?.workouts?.length) {
      const withLastDone = activeProgram.workouts.map((pw: any) => {
        const lastMatch = workoutHistory
          .filter((h) => h.completedAt && h.name === pw.name)
          .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];
        const daysAgo = lastMatch
          ? Math.floor((Date.now() - new Date(lastMatch.completedAt!).getTime()) / 86400000)
          : 999;
        return { name: pw.name, id: pw.id, daysSince: daysAgo, programWorkout: pw };
      });
      const next = withLastDone.sort((a: any, b: any) => b.daysSince - a.daysSince)[0];
      const daysLabel = next.daysSince >= 999 ? 'Ещё не делал'
        : next.daysSince === 0 ? 'Уже сегодня'
        : `${next.daysSince} ${next.daysSince === 1 ? 'день' : next.daysSince < 5 ? 'дня' : 'дней'} назад`;
      return { name: next.name, emoji: '◎', daysLabel, programWorkout: next.programWorkout };
    }
    const splitLastDays = SPLITS.map((split) => {
      let lastDay = 999;
      workoutHistory.forEach((w) => {
        if (!w.completedAt) return;
        const hasThisSplit = w.exercises.some((ex) =>
          (ex.exercise?.primaryMuscles ?? []).some((m) => split.muscles.includes(m))
        );
        if (hasThisSplit) {
          const daysAgo = Math.floor((Date.now() - new Date(w.completedAt).getTime()) / 86400000);
          if (daysAgo < lastDay) lastDay = daysAgo;
        }
      });
      return { ...split, daysSince: lastDay };
    });
    const rec = splitLastDays.sort((a, b) => b.daysSince - a.daysSince)[0];
    const daysLabel = rec.daysSince >= 999 ? 'Ещё не тренировал'
      : rec.daysSince === 0 ? 'Уже сегодня'
      : `${rec.daysSince} ${rec.daysSince === 1 ? 'день' : rec.daysSince < 5 ? 'дня' : 'дней'} назад`;
    // Round 244: SPLITS now uses iconName (Direction A) — old code
    // referenced rec.emoji which doesn't exist on the new shape.
    return { name: rec.name, iconName: rec.iconName, daysLabel, programWorkout: null };
  }, [workoutHistory, activeProgram]);

  const handleStartPlannedWorkout = useCallback(async () => {
    if (!todayPlan) return;
    haptic.medium();
    // If the plan day is linked to a saved routine, use the progressive-overload path
    if (todayPlan.routineId) {
      try {
        const workout = await startWorkoutFromRoutine(todayPlan.routineId);
        if (workout) navigation.navigate('ActiveWorkout');
      } catch {
        haptic.error();
        Alert.alert('Ошибка', 'Не удалось запустить рутину. Проверь соединение.');
      }
      return;
    }
    if (todayPlan.exercises.length === 0) return;
    const allExercises = [...customExercises, ...localExercises];
    const workoutExercises: WorkoutExercise[] = todayPlan.exercises
      .map((exId: string, index: number) => {
        const ex = allExercises.find((e) => e.id === exId);
        if (!ex) return null;
        const sets: WorkoutSet[] = Array.from({ length: 4 }, (_, i) => ({
          id: `set-${Date.now()}-${index}-${i}`,
          setNumber: i + 1, type: 'normal' as const, reps: 10, weight: 0, completed: false,
        }));
        return { id: `we-${Date.now()}-${index}`, exerciseId: ex.id, exercise: ex, order: index, sets, restSeconds: 0 };
      })
      .filter(Boolean) as WorkoutExercise[];
    if (workoutExercises.length === 0) {
      Alert.alert('Ошибка', 'Упражнения из плана не найдены');
      return;
    }
    startWorkoutSafe(
      { id: `workout-${Date.now()}`, name: todayPlan.name, exercises: workoutExercises },
      navigation,
      { tab: 'WorkoutsTab' },
    );
  }, [todayPlan, customExercises, navigation, haptic, startWorkoutFromRoutine]);

  const handleRepeatWorkout = useCallback(() => {
    if (!lastWorkout) return;
    haptic.medium();
    const workoutExercises: WorkoutExercise[] = (lastWorkout.exercises ?? []).map((we, index) => {
      const sets: WorkoutSet[] = (we.sets ?? []).map((s, i) => ({
        id: `set-${Date.now()}-${index}-${i}`,
        setNumber: i + 1, type: s.type, reps: s.reps, weight: s.weight, completed: false,
      }));
      return { ...we, id: `we-${Date.now()}-${index}`, sets };
    });
    startWorkoutSafe(
      { id: `workout-${Date.now()}`, name: lastWorkout.name, exercises: workoutExercises },
      navigation,
      { tab: 'WorkoutsTab' },
    );
  }, [lastWorkout, navigation, haptic]);

  // ─── Memoized JSX-section computations ────────────────────────────────
  // Audit R-2026-05-22: these were inline `(() => {...})()` blocks in
  // the JSX below — every HomeScreen render re-ran the filter/map/reduce.
  // Hoisted to useMemo so they only recompute when their inputs change.
  //
  // Tier 1 item 3 (2026-05-22 follow-up): banner blocks moved into
  // proper memo subcomponents (AnnouncementsBanner, FirstWorkoutBanner).
  // The visibility check + filter now live INSIDE the components so
  // HomeScreen doesn't need to track the derived state. Stable
  // useCallback handlers below let the memoized children bail out
  // cleanly on parent re-render.

  /** Pre-built color/icon meta for each announcement type. Depends only
   *  on the 4 theme colors so it's stable across most renders. */
  const announcementMeta = useMemo(
    () =>
      buildAnnouncementMeta({
        primary: colors.primary,
        warning: colors.warning,
        error: colors.error,
        success: colors.success,
      }),
    [colors.primary, colors.warning, colors.error, colors.success],
  );

  /** Dismiss handler — stable ref so AnnouncementsBanner can bail via memo. */
  const handleDismissAnnouncement = useCallback((id: string) => {
    setDismissedIds((s) => new Set([...s, id]));
  }, []);

  /** First-workout banner: dismiss + CTA handlers, stable refs. */
  const handleDismissFirstWorkoutBanner = useCallback(() => {
    setFirstWorkoutBannerDismissed(true);
  }, []);
  const handleStartFirstWorkout = useCallback(() => {
    navigation.navigate('WorkoutsTab' as never);
  }, [navigation]);

  /** AI coach card headline — choose between active workout recommendation,
   *  rest-day tip, or generic nudge. */
  const aiCoachHeadline = useMemo(() => {
    return workoutRecommendation?.name
      ? `${workoutRecommendation.name} · ${workoutRecommendation.daysLabel ?? ''}`.trim()
      : restDayRecommendation?.tip
        ?? 'Готов начать — выбери тренировку или попроси ИИ составить план';
  }, [workoutRecommendation, restDayRecommendation]);

  /** Ring stats — daily calories/protein/workouts. The reduce was running
   *  on every render of HomeScreen; now only when dayLog or week count
   *  actually changes. */
  const ringStatsData = useMemo(() => {
    const calTarget = dayLog.targetCalories || 2400;
    const calNow = (dayLog.meals ?? []).reduce((s, m) => s + (m?.totalCalories ?? 0), 0);
    const protTarget = dayLog.targetProtein || 160;
    const protNow = (dayLog.meals ?? []).reduce((s, m) => s + (m?.totalProtein ?? 0), 0);
    const dayProgress = calorieDayProgress(calNow, calTarget);
    return { calTarget, calNow, protTarget, protNow, dayProgress };
  }, [dayLog, weekWorkoutsCount]);

  /** Week dots + best PR — both scan workoutHistory; memoize the pair. */
  const streakPRData = useMemo(() => {
    return {
      weekDots: buildWeekDotsFromHistory(workoutHistory),
      pr: findHeaviestPR(workoutHistory),
    };
  }, [workoutHistory]);

  /** Week plan strip — derive the 7 day cards. Recomputes only when the
   *  weekPlan or workoutHistory changes (not on every render). */
  const weekPlanDays = useMemo(
    () => deriveWeekPlanDays(weekPlan, workoutHistory),
    [weekPlan, workoutHistory],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: safeTop, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <FadeIn delay={0} from="top">
        <HomeHeader navigation={navigation} streakDays={streak} />
      </FadeIn>

      {/* ── Announcements ─────────────────── */}
      <AnnouncementsBanner
        announcements={announcements}
        dismissedIds={dismissedIds}
        colors={colors}
        meta={announcementMeta}
        onDismiss={handleDismissAnnouncement}
      />

      {/* ── Email verification banner ─────────── */}
      {!user?.emailVerified && !emailBannerDismissed && (
        <View style={[annStyles.banner, { borderColor: colors.primary + '40', backgroundColor: colors.primary + '10', marginBottom: spacing.md }]}>
          <Icon name="message" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[annStyles.title, { color: colors.primary }]}>Подтвердите email</Text>
            <Text style={[annStyles.body, { color: colors.textSecondary }]} numberOfLines={1}>{user?.email}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={async () => {
                if (resendingVerification || !user?.email) return;
                setResendingVerification(true);
                try {
                  await authService.resendVerification(user.email);
                  setEmailVerifCode('');
                  setEmailVerifError('');
                  startResendCountdown(60);
                  setShowEmailVerifModal(true);
                } catch { /* ignore */ } finally {
                  setResendingVerification(false);
                }
              }}
              style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#D4B07A20', borderWidth: 1, borderColor: '#D4B07A40' }}
            >
              <Text style={{ color: '#D4B07A', fontSize: 12, fontWeight: '700' }}>
                {resendingVerification ? '...' : 'Ввести код'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setEmailBannerDismissed(true)}
              hitSlop={12}
              style={{ padding: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Скрыть напоминание"
            >
              <View style={{ transform: [{ rotate: '45deg' }] }}>
                <Icon name="plus" size={16} color={colors.textSecondary} />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── First-workout nudge banner (FUNNEL-2) ──────────────────────
          Appears for users who registered >24h ago and still have zero
          completed workouts. Direct CTA into the workouts list — the
          metrics dashboard showed 0/5 first-workout conversion which is
          worse than any other funnel step. The banner is dismissable so
          users who genuinely don't want to train (or are just browsing)
          aren't nagged forever; for active users the trigger fires once
          per session and goes away the moment they complete a set. */}
      <FirstWorkoutBanner
        userCreatedAt={user?.createdAt}
        workoutHistory={workoutHistory}
        dismissed={firstWorkoutBannerDismissed}
        colors={colors}
        onDismiss={handleDismissFirstWorkoutBanner}
        onStart={handleStartFirstWorkout}
      />

      {/* Email verification modal */}
      <Modal visible={showEmailVerifModal} transparent animationType="fade" onRequestClose={() => setShowEmailVerifModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: spacing.xxl }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.xxl, width: '100%', borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: spacing.sm }}>Подтверждение email</Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 20 }}>
                Введите код из письма на{'\n'}<Text style={{ color: colors.text, fontWeight: '600' }}>{user?.email}</Text>
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.background, borderWidth: 2, borderRadius: 12,
                  borderColor: emailVerifCode.length === 6 ? '#D4B07A' : colors.border,
                  color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: 10,
                  textAlign: 'center', paddingVertical: spacing.md, marginBottom: spacing.md,
                }}
                value={emailVerifCode}
                onChangeText={async (t) => {
                  const clean = t.replace(/\D/g, '').slice(0, 6);
                  setEmailVerifCode(clean);
                  setEmailVerifError('');
                  // Auto-submit when 6 digits entered
                  if (clean.length === 6 && !emailVerifLoading && user?.email) {
                    setEmailVerifLoading(true);
                    try {
                      const valid = await authService.verifyEmail(user.email, clean);
                      if (valid) {
                        setShowEmailVerifModal(false);
                        setEmailBannerDismissed(true);
                        await useAuthStore.getState().fetchProfile();
                      } else {
                        setEmailVerifError('Неверный код');
                      }
                    } catch (e: any) {
                      setEmailVerifError(e?.response?.data?.error || 'Ошибка подтверждения');
                    } finally {
                      setEmailVerifLoading(false);
                    }
                  }
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="——————"
                placeholderTextColor={colors.textTertiary}
                autoFocus
              />
              {emailVerifError ? <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center', marginBottom: spacing.md }}>{emailVerifError}</Text> : null}
              <Button
                title={emailVerifLoading ? '...' : 'Подтвердить'}
                onPress={async () => {
                  if (emailVerifCode.length !== 6 || !user?.email || emailVerifLoading) return;
                  setEmailVerifLoading(true);
                  try {
                    const valid = await authService.verifyEmail(user.email, emailVerifCode);
                    if (valid) {
                      setShowEmailVerifModal(false);
                      setEmailBannerDismissed(true);
                      await useAuthStore.getState().fetchProfile();
                    } else {
                      setEmailVerifError('Неверный код');
                    }
                  } catch (e: any) {
                    setEmailVerifError(e?.response?.data?.error || 'Ошибка подтверждения');
                  } finally {
                    setEmailVerifLoading(false);
                  }
                }}
                disabled={emailVerifCode.length !== 6 || emailVerifLoading}
                fullWidth size="lg" style={{ marginBottom: spacing.md }}
              />
              <TouchableOpacity
                disabled={resendCountdown > 0 || resendingVerification}
                onPress={async () => {
                  if (!user?.email) return;
                  setResendingVerification(true);
                  try {
                    await authService.resendVerification(user.email);
                    setEmailVerifCode('');
                    setEmailVerifError('');
                    startResendCountdown(60);
                  } catch { /* ignore */ } finally {
                    setResendingVerification(false);
                  }
                }}
                style={{ paddingVertical: spacing.sm, alignItems: 'center', marginBottom: spacing.md }}
              >
                <Text style={{ fontSize: 13, color: resendCountdown > 0 ? colors.textTertiary : '#D4B07A', fontWeight: '600' }}>
                  {resendCountdown > 0 ? `Повторно через ${resendCountdown} с` : resendingVerification ? 'Отправка...' : 'Отправить повторно'}
                </Text>
              </TouchableOpacity>
              <Button title="Отмена" variant="outline" onPress={() => setShowEmailVerifModal(false)} fullWidth />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════
          Direction A Premium home — pixel copy of the Claude Design
          handoff bundle (Home screen, variation-a-1.jsx). Renders the
          hero stack: AI coach card → ring + macro bars → streak / PR
          grid → week plan strip → quick actions. Everything below is
          store-driven so the visual copy stays accurate to current
          state.
          ═══════════════════════════════════════════════════════════ */}

      {/* 1. AI coach hero — prefers the workout recommendation copy
             (it's the most specific signal). Rest-day recommendation is
             used when the plan says "rest", and we fall back to a
             generic nudge if neither is available. */}
      {!activeWorkout && (
        <FadeIn delay={60}>
          <AICoachCard
            navigation={navigation}
            recommendation={aiCoachHeadline}
            onPressCta={handleStartPlannedWorkout}
            onPressRefresh={() => { haptic.selection(); fetchWeekPlan(); }}
          />
        </FadeIn>
      )}

      {/* 2. Ring stats — daily percentage ring + 3 progress rows.
             Calories + protein come from today's nutrition log; the
             third row mirrors the design's "Шаги" line by showing a
             static target for now (wired to the pedometer hook later). */}
      <FadeIn delay={120}>
        <RingStatsCard
          dayProgress={ringStatsData.dayProgress}
          rows={[
            {
              label: 'Калории',
              value: `${Math.round(ringStatsData.calNow).toLocaleString('ru-RU')} / ${ringStatsData.calTarget.toLocaleString('ru-RU')}`,
              progress: ringStatsData.calNow / Math.max(1, ringStatsData.calTarget),
              color: colors.calories,
            },
            {
              label: 'Белок',
              value: `${Math.round(ringStatsData.protNow)} / ${ringStatsData.protTarget} г`,
              progress: ringStatsData.protNow / Math.max(1, ringStatsData.protTarget),
              color: colors.primary,
            },
            {
              label: 'Тренировки/нед.',
              value: `${weekWorkoutsCount} / 4`,
              progress: weekWorkoutsCount / 4,
              color: colors.carbs,
            },
          ]}
        />
      </FadeIn>

      {/* 3. Streak + PR side-by-side grid. Weekly dots look at the
             last 7 calendar days; PR picks the heaviest completed set
             across all history. */}
      <FadeIn delay={180}>
        <StreakPRGrid
          streakDays={streak}
          weekDots={streakPRData.weekDots}
          prKg={streakPRData.pr.kg}
          prLabel={streakPRData.pr.exerciseName}
        />
      </FadeIn>

      {/* 4. Week plan strip — weekPlan is keyed by dow (0=Mon..6=Sun),
             not an array. We iterate 0..6 explicitly so the strip
             renders all 7 cards even on days with null entries. */}
      <FadeIn delay={240}>
        <WeekPlanStrip
          days={weekPlanDays}
          onPressAll={() => navigation.navigate('WorkoutsTab', { screen: 'WorkoutsList' })}
          onPressDay={() => navigation.navigate('WorkoutsTab', { screen: 'WorkoutsList' })}
        />
      </FadeIn>

      {/* 5. Quick actions — scanner + weight log. One-tap entries to
             the two highest-velocity tasks (matches the design's 2-up
             layout exactly). */}
      <FadeIn delay={300}>
        <QuickActionsGrid
          actions={[
            {
              icon: 'scan',
              label: 'Сканировать еду',
              subtitle: 'ИИ определит КБЖУ',
              onPress: () => navigation.navigate('NutritionTab', { screen: 'FoodScanner' }),
            },
            {
              icon: 'chart',
              label: 'Добавить вес',
              subtitle: 'Утреннее взвешивание',
              onPress: () => navigation.navigate('WorkoutsTab', { screen: 'Progress' }),
            },
            {
              icon: 'spark',
              label: 'Прогресс',
              subtitle: 'Графики и статистика',
              onPress: () => navigation.navigate('WorkoutsTab', { screen: 'Progress' }),
            },
          ]}
        />
      </FadeIn>
    </ScrollView>

    {/* Floating "Start workout" button — shown when no active workout */}
    {!activeWorkout && (
      <View style={{
        position: 'absolute', bottom: 24, right: spacing.xl,
      }}>
        <AnimatedPressable
          onPress={() => { haptic.medium(); navigation.navigate('WorkoutsTab', { screen: 'WorkoutsList' }); }}
          haptic={false}
          scaleDown={0.94}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
            borderRadius: borderRadius.full, backgroundColor: colors.primary,
            shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
          }}
        >
          <Icon name="play" size={16} color={colors.textInverse} />
          {/* Round 233: was '#FFF' on gold = 1.9:1 WCAG fail. Direction A
              rule: gold CTA always pairs with DARK text via textInverse. */}
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textInverse, letterSpacing: 0.5 }}>Начать</Text>
        </AnimatedPressable>
      </View>
    )}
    </View>
  );
};

const annStyles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    borderRadius: 12, borderWidth: 1, padding: 12,
    marginBottom: 10,
  },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  body: { fontSize: 12, lineHeight: 18 }, // color now applied per-instance from theme
});
