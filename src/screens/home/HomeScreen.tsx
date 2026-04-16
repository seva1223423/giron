import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { ScrollView, View, TouchableOpacity, StyleSheet } from 'react-native';
import { AnimatedPressable } from '../../components';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useAuthStore, useWorkoutStore, useNutritionStore } from '../../store';
import { exercises as localExercises } from '../../data/exercises';
import { Workout, WorkoutExercise, WorkoutSet } from '../../types';
import { FadeIn, Button, Card } from '../../components';
import { spacing, borderRadius } from '../../theme/spacing';
import { scheduleInactivityReminder, scheduleWeeklySummaryNotification, showTodayPlanNotification } from '../../services/notificationService';
import { adminService } from '../../services/adminService';
import { authService } from '../../services/authService';
import type { AnnouncementType } from '../../types';
import {
  HomeHeader, WorkoutStatusCard, TodayPlanCard, RecommendationCard,
  LastWorkoutCard, NutritionCard, WaterCard,
  RecoveryScoreCard, TodaySummaryCard, StepsCard,
} from './components';
import { Text, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { typography } from '../../theme';

const SPLITS = [
  { name: 'Грудь + Трицепс', muscles: ['chest', 'triceps'], emoji: '◎' },
  { name: 'Спина + Бицепс', muscles: ['back', 'biceps', 'lats'], emoji: '◎' },
  { name: 'Ноги', muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves'], emoji: '◎' },
  { name: 'Плечи + Пресс', muscles: ['shoulders', 'abs'], emoji: '◎' },
  { name: 'Фулбоди', muscles: ['chest', 'back', 'quadriceps'], emoji: '◎' },
];

import { todayDateStr, localDateStr } from '../../utils/date';
import { useSafeTop } from '../../hooks/useSafeTop';
const todayDate = todayDateStr;

const SectionDivider: React.FC<{ label: string; colors: any }> = ({ label, colors }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.md }}>
    <View style={{ flex: 1, height: 1.5, backgroundColor: colors.primary + '20' }} />
    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 1.2, marginHorizontal: spacing.md }}>{label}</Text>
    <View style={{ flex: 1, height: 1.5, backgroundColor: colors.primary + '20' }} />
  </View>
);

const ANN_COLORS: Record<AnnouncementType, string> = {
  info: '#6366F1', warning: '#F59E0B', maintenance: '#EF4444', promo: '#10B981',
};
const ANN_ICONS: Record<AnnouncementType, string> = {
  info: 'ℹ️', warning: '⚠️', maintenance: '🔧', promo: '🎁',
};

export const HomeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const { colors } = useThemeStore();
  const [announcements, setAnnouncements] = useState<Array<{ id: string; title: string; body: string; type: AnnouncementType; createdAt: string }>>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [emailBannerDismissed, setEmailBannerDismissed] = useState(false);
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
    countdownRef.current = setInterval(() => {
      setResendCountdown((s) => {
        if (s <= 1) { clearInterval(countdownRef.current!); countdownRef.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);
  const { user } = useAuthStore();
  const { programs, workoutHistory, activeWorkout, weekPlan, isLoadingHistory, fetchPrograms, fetchHistory, startWorkout, customExercises, fetchWeekPlan } = useWorkoutStore();
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

  const streak = useMemo(() => {
    if (workoutHistory.length === 0) return 0;
    let s = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ds = localDateStr(d);
      if (workoutHistory.some((w) => w.completedAt?.startsWith(ds))) s++;
      else if (i > 0) break;
    }
    return s;
  }, [workoutHistory]);

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
    return { name: rec.name, emoji: rec.emoji, daysLabel, programWorkout: null };
  }, [workoutHistory, activeProgram]);

  const handleStartPlannedWorkout = useCallback(() => {
    if (!todayPlan || todayPlan.exercises.length === 0) return;
    haptic.medium();
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
    startWorkout({ id: `workout-${Date.now()}`, name: todayPlan.name, exercises: workoutExercises });
    navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' });
  }, [todayPlan, customExercises, startWorkout, navigation, haptic]);

  const handleRepeatWorkout = useCallback(() => {
    if (!lastWorkout || activeWorkout) return;
    haptic.medium();
    const workoutExercises: WorkoutExercise[] = (lastWorkout.exercises ?? []).map((we, index) => {
      const sets: WorkoutSet[] = we.sets.map((s, i) => ({
        id: `set-${Date.now()}-${index}-${i}`,
        setNumber: i + 1, type: s.type, reps: s.reps, weight: s.weight, completed: false,
      }));
      return { ...we, id: `we-${Date.now()}-${index}`, sets };
    });
    startWorkout({ id: `workout-${Date.now()}`, name: lastWorkout.name, exercises: workoutExercises });
    navigation.navigate('WorkoutsTab', { screen: 'ActiveWorkout' });
  }, [lastWorkout, activeWorkout, startWorkout, navigation, haptic]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: safeTop, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <FadeIn delay={0} from="top">
        <HomeHeader navigation={navigation} />
      </FadeIn>

      {/* ── Announcements ─────────────────── */}
      {announcements.filter((a) => !dismissedIds.has(a.id)).map((a) => {
        const c = ANN_COLORS[a.type];
        return (
          <View key={a.id} style={[annStyles.banner, { borderColor: c + '40', backgroundColor: c + '10' }]}>
            <Text style={{ fontSize: 16 }}>{ANN_ICONS[a.type]}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[annStyles.title, { color: c }]}>{a.title}</Text>
              <Text style={annStyles.body} numberOfLines={3}>{a.body}</Text>
            </View>
            <TouchableOpacity onPress={() => setDismissedIds((s) => new Set([...s, a.id]))}>
              <Text style={{ color: '#6B7280', fontSize: 16, paddingHorizontal: 4 }}>✕</Text>
            </TouchableOpacity>
          </View>
        );
      })}

      {/* ── Email verification banner ─────────── */}
      {!user?.emailVerified && !emailBannerDismissed && (
        <View style={[annStyles.banner, { borderColor: '#6366F140', backgroundColor: '#6366F110', marginBottom: spacing.md }]}>
          <Text style={{ fontSize: 16 }}>✉️</Text>
          <View style={{ flex: 1 }}>
            <Text style={[annStyles.title, { color: '#6366F1' }]}>Подтвердите email</Text>
            <Text style={annStyles.body} numberOfLines={1}>{user?.email}</Text>
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
              style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#6366F120', borderWidth: 1, borderColor: '#6366F140' }}
            >
              <Text style={{ color: '#6366F1', fontSize: 12, fontWeight: '700' }}>
                {resendingVerification ? '...' : 'Ввести код'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEmailBannerDismissed(true)} style={{ padding: 4 }}>
              <Text style={{ color: '#6B7280', fontSize: 16 }}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
                  borderColor: emailVerifCode.length === 6 ? '#6366F1' : colors.border,
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
              {emailVerifError ? <Text style={{ color: '#EF4444', fontSize: 13, textAlign: 'center', marginBottom: spacing.md }}>{emailVerifError}</Text> : null}
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
                <Text style={{ fontSize: 13, color: resendCountdown > 0 ? colors.textTertiary : '#6366F1', fontWeight: '600' }}>
                  {resendCountdown > 0 ? `Повторно через ${resendCountdown} с` : resendingVerification ? 'Отправка...' : 'Отправить повторно'}
                </Text>
              </TouchableOpacity>
              <Button title="Отмена" variant="outline" onPress={() => setShowEmailVerifModal(false)} fullWidth />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── СЕГОДНЯ ──────────────────────────────── */}
      <FadeIn delay={60}>
        <TodaySummaryCard navigation={navigation} />
      </FadeIn>

      <FadeIn delay={100}>
        <WorkoutStatusCard navigation={navigation} />
      </FadeIn>

      {!activeWorkout && todayPlan && todayPlan.type !== 'cardio' && (
        <FadeIn delay={140}>
          <TodayPlanCard todayPlan={todayPlan} onStart={handleStartPlannedWorkout} />
        </FadeIn>
      )}

      {!activeWorkout && todayPlan?.type === 'cardio' && (
        <FadeIn delay={140}>
          <Card style={{ marginBottom: spacing.lg }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm }}>{todayPlan.emoji}</Text>
            <Text style={[typography.h4, { color: colors.text }]}>{todayPlan.name}</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.md }]}>Запланировано на сегодня</Text>
            <Button title="Открыть кардио" onPress={() => navigation.navigate('WorkoutsTab', { screen: 'Cardio' })} fullWidth />
          </Card>
        </FadeIn>
      )}

      {!activeWorkout && (
        <FadeIn delay={150}>
          <RecommendationCard
            restDayRecommendation={restDayRecommendation}
            workoutRecommendation={workoutRecommendation}
            activeProgram={activeProgram}
            haptic={haptic}
            startWorkout={startWorkout}
            navigation={navigation}
          />
        </FadeIn>
      )}

      {/* ── ТРЕНИРОВКИ ─────────────────────────── */}
      <SectionDivider label="ТРЕНИРОВКИ" colors={colors} />

      <RecoveryScoreCard />

      {isLoadingHistory && workoutHistory.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {lastWorkout && daysSinceLastWorkout !== null && daysSinceLastWorkout <= 7 && (
        <FadeIn delay={175}>
          <LastWorkoutCard
            lastWorkout={lastWorkout}
            daysSinceLastWorkout={daysSinceLastWorkout}
            activeWorkout={activeWorkout}
            onRepeat={handleRepeatWorkout}
          />
        </FadeIn>
      )}

      {/* ── ПИТАНИЕ ────────────────────────────── */}
      <SectionDivider label="ПИТАНИЕ" colors={colors} />

      <FadeIn delay={300}>
        <NutritionCard dayLog={dayLog} navigation={navigation} />
      </FadeIn>

      <FadeIn delay={320}>
        <WaterCard dayLog={dayLog} today={today} />
      </FadeIn>

      <StepsCard />
    </ScrollView>

    {/* Floating "Start workout" button — shown when no active workout */}
    {!activeWorkout && (
      <View style={{
        position: 'absolute', bottom: 24, right: spacing.xl,
      }}>
        <AnimatedPressable
          onPress={() => { haptic.medium(); navigation.navigate('WorkoutsTab', { screen: 'Workouts' }); }}
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
          <Text style={{ fontSize: 16 }}>▷</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 }}>Начать</Text>
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
  body: { fontSize: 12, color: '#9CA3AF', lineHeight: 18 },
});
