import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors, useAuthStore, useWorkoutStore, useNutritionStore, useSubscriptionStore, useThemeIsDark } from '../../store';
import { Card, Button, AnimatedPressable, Icon, type IconName } from '../../components';
import { AchievementSticker } from '../../components/Sticker';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { computeAchievements } from '../../utils/achievements';
import { LifetimeStatsCard } from './components';
import { userService } from '../../services';
import { authService } from '../../services/authService';
import { localDateStr } from '../../utils/date';
import type { BodyWeight } from '../../types';
import { normalizeGender } from '../../utils/gender';

const GOAL_LABELS: Record<string, string> = {
  WEIGHT_LOSS: 'Похудение', weight_loss: 'Похудение',
  MUSCLE_GAIN: 'Набор массы', muscle_gain: 'Набор массы',
  STRENGTH: 'Сила', strength: 'Сила',
  ENDURANCE: 'Выносливость', endurance: 'Выносливость',
  FLEXIBILITY: 'Гибкость', flexibility: 'Гибкость',
  GENERAL_FITNESS: 'Общая форма', general_fitness: 'Общая форма',
};

const LEVEL_LABELS: Record<string, string> = {
  BEGINNER: 'Новичок', beginner: 'Новичок',
  INTERMEDIATE: 'Средний', intermediate: 'Средний',
  ADVANCED: 'Продвинутый', advanced: 'Продвинутый',
  EXPERT: 'Эксперт', expert: 'Эксперт',
};

const ProfileRow: React.FC<{ label: string; value: string; colors: any; isLast?: boolean }> = ({ label, value, colors, isLast }) => (
  <View style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.md }, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
    <Text style={[typography.body, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
    <Text style={[typography.bodyMedium, { color: colors.text }]} numberOfLines={1}>{value}</Text>
  </View>
);

// Single row in the navigation menu. Uses the shared Icon set for the
// left leading glyph so every menu line looks like the Direction A
// profile list spec.
const MenuRow: React.FC<{
  iconName: IconName;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  isLast?: boolean;
  colors: any;
  badge?: string;
  badgeColor?: string;
}> = ({ iconName, iconBg, iconColor, title, subtitle, onPress, isLast, colors, badge, badgeColor }) => (
  <AnimatedPressable
    onPress={onPress}
    haptic={false}
    scaleDown={0.985}
    style={[
      { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md } as any,
      !isLast && { borderBottomWidth: 1, borderBottomColor: colors.divider },
    ]}
  >
    <View style={{ width: 36, height: 36, borderRadius: borderRadius.md, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: iconColor + '35' }}>
      <Icon name={iconName} size={18} color={iconColor} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>{title}</Text>
      {subtitle && <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 1 }]} numberOfLines={1}>{subtitle}</Text>}
    </View>
    {badge && (
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full, backgroundColor: (badgeColor || colors.primary) + '20', borderWidth: 1, borderColor: (badgeColor || colors.primary) + '40' }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: badgeColor || colors.primary }}>{badge}</Text>
      </View>
    )}
    <View style={{ transform: [{ rotate: '0deg' }] }}>
      <Icon name="chev" size={16} color={colors.textTertiary} />
    </View>
  </AnimatedPressable>
);

export const ProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const colors = useThemeColors();
  const isDark = useThemeIsDark();
  // The hero is a dark slab in both themes, and "dark" has to mean something
  // different depending on what surrounds it. Against graphite these
  // near-black stops are right; against cream they read as a hole in the
  // page. Same hues, lifted, so the card stays an accent — the light text
  // pinned below still clears 10:1 on them.
  const heroStops = isDark
    ? { a: '#1E1810', b: '#2A1F12' }
    : { a: '#3B2F21', b: '#5A4527' };
  const { user, logout } = useAuthStore();
  const { workoutHistory } = useWorkoutStore();
  const { dailyLog } = useNutritionStore();

  const [weightHistory, setWeightHistory] = useState<BodyWeight[]>([]);
  const [resendingVerif, setResendingVerif] = useState(false);
  const [showEmailVerifModal, setShowEmailVerifModal] = useState(false);
  const [emailVerifCode, setEmailVerifCode] = useState('');
  const [emailVerifLoading, setEmailVerifLoading] = useState(false);
  const [emailVerifError, setEmailVerifError] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Round 234: cancel-on-unmount guard. Without it, navigating away
    // mid-fetch triggered a setState-on-unmounted-component warning.
    let cancelled = false;
    userService.getWeightHistory()
      .then((wh) => { if (!cancelled) setWeightHistory(wh); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  const daysWithUs = useMemo(() => {
    if (!user?.createdAt) return null;
    const created = new Date(user.createdAt);
    return Math.max(1, Math.floor((Date.now() - created.getTime()) / 86400000));
  }, [user?.createdAt]);

  const weightTrend = useMemo(() => {
    if (weightHistory.length < 2) return null;
    const last = weightHistory.slice(-3);
    const diff = Math.round((last[last.length - 1].weightKg - last[0].weightKg) * 10) / 10;
    return { entries: last, diff };
  }, [weightHistory]);

  const achievements = useMemo(() => {
    const nutritionDaysLogged = Object.values(dailyLog).filter((d) => (d.meals?.length ?? 0) > 0).length;
    const sortedDates = workoutHistory
      .filter((w) => w.completedAt)
      .map((w) => localDateStr(new Date(w.completedAt!)))
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => b.localeCompare(a));
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      if (sortedDates[i] === localDateStr(expected)) currentStreak++;
      else break;
    }
    return computeAchievements({ workoutHistory, nutritionDaysLogged, currentStreak });
  }, [workoutHistory, dailyLog]);

  const unlockedAchievements = achievements.filter((a) => a.unlockedAt);

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <>
    {/* Email verification modal */}
    <Modal visible={showEmailVerifModal} transparent animationType="fade" onRequestClose={() => setShowEmailVerifModal(false)}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: spacing.xxl }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: spacing.xxl, width: '100%', borderWidth: 1, borderColor: colors.border }}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.sm }]}>Подтверждение email</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
              Введите 6-значный код, отправленный на{'\n'}{user?.email}
            </Text>
            <TextInput
              style={{
                backgroundColor: colors.background, borderWidth: 2, borderRadius: 12,
                borderColor: emailVerifCode.length === 6 ? colors.primary : colors.border,
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
                      await useAuthStore.getState().fetchProfile();
                      Alert.alert('Готово', 'Email успешно подтверждён!');
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
            {emailVerifError ? <Text style={[typography.small, { color: colors.error, textAlign: 'center', marginBottom: spacing.md }]}>{emailVerifError}</Text> : null}
            <Button
              title="Подтвердить"
              onPress={async () => {
                if (emailVerifCode.length !== 6 || !user?.email) return;
                setEmailVerifLoading(true);
                try {
                  const valid = await authService.verifyEmail(user.email, emailVerifCode);
                  if (valid) {
                    setShowEmailVerifModal(false);
                    await useAuthStore.getState().fetchProfile();
                    Alert.alert('Готово', 'Email успешно подтверждён!');
                  } else {
                    setEmailVerifError('Неверный код');
                  }
                } catch (e: any) {
                  setEmailVerifError(e?.response?.data?.error || 'Ошибка подтверждения');
                } finally {
                  setEmailVerifLoading(false);
                }
              }}
              loading={emailVerifLoading}
              disabled={emailVerifCode.length !== 6 || emailVerifLoading}
              fullWidth size="lg" style={{ marginBottom: spacing.sm }}
            />
            <TouchableOpacity
              disabled={resendCountdown > 0 || resendingVerif}
              onPress={async () => {
                if (!user?.email) return;
                setResendingVerif(true);
                try {
                  await authService.resendVerification(user.email);
                  setEmailVerifCode('');
                  setEmailVerifError('');
                  startResendCountdown(60);
                } catch (e: any) {
                  Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось отправить');
                } finally {
                  setResendingVerif(false);
                }
              }}
              style={{ paddingVertical: spacing.sm, alignItems: 'center', marginBottom: spacing.md }}
            >
              <Text style={[typography.small, { color: resendCountdown > 0 ? colors.textTertiary : colors.primary, fontWeight: '600' }]}>
                {resendCountdown > 0 ? `Отправить повторно через ${resendCountdown} с` : resendingVerif ? 'Отправка...' : 'Отправить код повторно'}
              </Text>
            </TouchableOpacity>
            <Button title="Отмена" variant="outline" onPress={() => setShowEmailVerifModal(false)} fullWidth />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ═══════════════════════════════════════════════════════════
          Direction A premium profile hero — gradient graphite→amber
          card with avatar tile, name, subtitle (days with us / level),
          IRON PRO chip, and 3 stat tiles below (Тренировок / Стрик /
          Ачивок). Pixel copy of A_Profile.
          ═══════════════════════════════════════════════════════════ */}
      <View style={styles.heroCard}>
        {/* Gradient background — permanent warm-amber dark hero (looks correct
            in both themes; gold avatar is keyed to a dark surface). Text
            colors below are pinned to fixed light values for the same reason. */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="profileBg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={heroStops.a} stopOpacity={1} />
              <Stop offset="1" stopColor={heroStops.b} stopOpacity={1} />
            </LinearGradient>
            <RadialGradient id="profileGlow" cx="95%" cy="0%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.2} />
              <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#profileBg)" />
          <Rect width="100%" height="100%" fill="url(#profileGlow)" />
        </Svg>

        <View style={{ padding: 22, position: 'relative' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {/* Gold avatar tile with dark initial */}
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                backgroundColor: colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#17171A', fontSize: 28, fontWeight: '600' }}>
                {(user?.firstName?.[0] || 'A').toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[typography.h3, { color: '#F4F1EA' }]}
                numberOfLines={1}
              >
                {user?.firstName || 'Атлет'} {user?.lastName ?? ''}
              </Text>
              <Text
                style={{ color: '#A8A49C', fontSize: 12, marginTop: 2 }}
                numberOfLines={1}
              >
                {daysWithUs !== null
                  ? `С нами ${daysWithUs} ${daysWithUs === 1 ? 'день' : daysWithUs < 5 ? 'дня' : 'дней'}`
                  : (user?.email ?? '—')}
              </Text>
              {useSubscriptionStore.getState().isPremiumActive() && (
                <View
                  style={{
                    alignSelf: 'flex-start',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    marginTop: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                  }}
                >
                  <Icon name="bolt" size={11} color="#17171A" />
                  <Text
                    style={{
                      color: '#17171A',
                      fontSize: 11,
                      fontWeight: '700',
                      letterSpacing: 0.5,
                    }}
                  >
                    IRON PRO
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* 3 stat tiles on translucent dark — stands out on the amber bg */}
          <View style={styles.heroStats}>
            {[
              { label: 'Тренировок', value: String(workoutHistory.length) },
              { label: 'Вес', value: user?.weightKg ? `${user.weightKg} кг` : '—' },
              { label: 'Ачивок', value: `${unlockedAchievements.length}/20` },
            ].map((s) => (
              <View key={s.label} style={styles.heroStatTile}>
                <Text style={[typography.h4, { color: '#F4F1EA' }]}>{s.value}</Text>
                <Text
                  style={{ color: '#A8A49C', fontSize: 10, marginTop: 2, letterSpacing: 0.5 }}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ── Weight trend (compact inline, only if data exists) ── */}
      {weightTrend && (
        <View style={[styles.trendRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28 }}>
            {(() => {
              const vals = weightTrend.entries.map((x) => x.weightKg);
              const min = Math.min(...vals); const max = Math.max(...vals);
              return weightTrend.entries.map((e, i) => {
                const h = Math.max(4, Math.round(((e.weightKg - min) / (max - min || 1)) * 24) + 4);
                return <View key={i} style={{ width: 8, height: h, borderRadius: 2, backgroundColor: i === weightTrend.entries.length - 1 ? colors.primary : colors.border }} />;
              });
            })()}
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренд веса</Text>
          <Text style={[typography.bodyMedium, { color: weightTrend.diff > 0 ? colors.warning : weightTrend.diff < 0 ? colors.success : colors.text }]}>
            {weightTrend.diff > 0 ? '+' : ''}{weightTrend.diff} кг
          </Text>
        </View>
      )}

      {/* ── Section: Данные ── */}
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>ДАННЫЕ</Text>

      <LifetimeStatsCard delay={0} />

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <Text style={[typography.h4, { color: colors.text }]}>Личные данные</Text>
          <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('EditProfile'); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[typography.smallMedium, { color: colors.primary }]}>Изменить</Text>
          </TouchableOpacity>
        </View>
        <ProfileRow label="Рост" value={user?.heightCm ? `${user.heightCm} см` : 'Не указан'} colors={colors} />
        <ProfileRow label="Вес" value={user?.weightKg ? `${user.weightKg} кг` : 'Не указан'} colors={colors} />
        <ProfileRow label="Пол" value={(() => { const g = normalizeGender(user?.gender); return g === 'male' ? 'Мужской' : g === 'female' ? 'Женский' : 'Не указан'; })()} colors={colors} />
        <ProfileRow label="Цель" value={user?.goal ? GOAL_LABELS[user.goal] ?? user.goal : 'Не указана'} colors={colors} />
        <ProfileRow label="Уровень" value={user?.fitnessLevel ? LEVEL_LABELS[user.fitnessLevel] ?? user.fitnessLevel : 'Не указан'} colors={colors} />
        <ProfileRow label="Стаж" value={user?.trainingExperienceYears ? `${user.trainingExperienceYears} лет` : 'Не указан'} colors={colors} isLast />
      </Card>

      {/* ── Section: Achievements (horizontal strip per Direction A) ──
             Pixel copy of A_Profile's strip: 6 tiles wide, unlocked
             get gold icon bg + surface fill, locked get border-only
             + 35% opacity. "Все N →" link on the right. */}
      {achievements.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 }}>
            <Text style={[typography.h4, { color: colors.text }]}>Ачивки</Text>
            <TouchableOpacity
              // 'ProgressTab' is not a route — Progress lives inside
              // WorkoutsStack, so this tap did nothing. The `as any` was
              // hiding the mistake from TypeScript (audit R10).
              onPress={() => { haptic.selection(); navigation.navigate('WorkoutsTab', { screen: 'Progress' }); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Открыть все ${achievements.length} достижений`}
              accessibilityRole="button"
            >
              <Text style={[typography.smallMedium, { color: colors.primary, fontWeight: '500' }]}>
                Все {achievements.length} →
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 2, paddingBottom: 2 }}
            style={{ marginBottom: spacing.lg }}
          >
            {achievements.slice(0, 12).map((ach) => {
              const unlocked = unlockedAchievements.some((u) => u.id === ach.id);
              return (
                <View
                  key={ach.id}
                  style={{
                    width: 88,
                    aspectRatio: 1 / 1.1,
                    borderRadius: 18,
                    backgroundColor: unlocked ? colors.surface : 'transparent',
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: unlocked ? 1 : 0.35,
                  }}
                  accessibilityLabel={`${ach.title}${unlocked ? ', получено' : ', закрыто'}`}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AchievementSticker achievement={ach} size={40} />
                  </View>
                  <Text
                    style={{
                      fontSize: 10,
                      color: unlocked ? colors.text : colors.textTertiary,
                      fontWeight: '600',
                      textAlign: 'center',
                      paddingHorizontal: 4,
                    }}
                    numberOfLines={1}
                  >
                    {unlocked ? 'Получено' : 'Закрыто'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </>
      )}

      {/* ── Section: Меню ── */}
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>ПРИЛОЖЕНИЕ</Text>

      <Card style={{ marginBottom: spacing.lg }}>
        <MenuRow
          iconName="heart"
          iconBg={colors.primary + '18'}
          iconColor={colors.primary}
          title="Здоровье и часы"
          subtitle="Пульс, сон, VO₂max, Health Connect"
          onPress={() => { haptic.selection(); navigation.navigate('Health'); }}
          colors={colors}
        />
        <MenuRow
          iconName="settings"
          iconBg={colors.border}
          iconColor={colors.textSecondary}
          title="Настройки"
          subtitle="Тема, уведомления, единицы"
          onPress={() => { haptic.selection(); navigation.navigate('Settings'); }}
          colors={colors}
        />
        <MenuRow
          iconName="user"
          iconBg={colors.primary + '18'}
          iconColor={colors.primary}
          title="Режим тренера"
          subtitle="Клиенты, программы, прогресс"
          onPress={() => { haptic.selection(); navigation.navigate('TrainerDashboard'); }}
          colors={colors}
        />
        <MenuRow
          iconName="bolt"
          iconBg={colors.accent + '18'}
          iconColor={colors.accent}
          title="Подписка"
          subtitle="Giron Pro — 7 дней бесплатно"
          badge="PRO"
          badgeColor={colors.accent}
          onPress={() => { haptic.selection(); navigation.navigate('Subscription'); }}
          colors={colors}
        />
        <MenuRow
          iconName="news"
          iconBg={colors.border}
          iconColor={colors.textSecondary}
          title="Новости спорта"
          subtitle="Лента, категории, сохранённое"
          onPress={() => { haptic.selection(); navigation.navigate('NewsScreen'); }}
          colors={colors}
        />
        <MenuRow
          iconName="message"
          iconBg="#D4B07A18"
          iconColor="#D4B07A"
          title="Техническая поддержка"
          subtitle="Вопросы, проблемы, предложения"
          onPress={() => { haptic.selection(); navigation.navigate('SupportScreen'); }}
          isLast={!(user?.role === 'admin' || user?.role === 'support')}
          colors={colors}
        />
        {(user?.role === 'admin' || user?.role === 'support') && (
          <MenuRow
            iconName="lock"
            iconBg="#EF444418"
            iconColor="#EF4444"
            title="Панель администратора"
            subtitle="Пользователи, поддержка, статистика"
            onPress={() => { haptic.selection(); navigation.navigate('AdminDashboardScreen'); }}
            isLast
            colors={colors}
          />
        )}
      </Card>

      {/* ── Section: Безопасность ── */}
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>АККАУНТ И БЕЗОПАСНОСТЬ</Text>
      <Card style={{ marginBottom: spacing.xl }}>
        {/* Phone verification */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: user?.phoneVerified ? colors.success + '20' : colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Icon name={user?.phoneVerified ? 'check' : 'mic'} size={15} color={user?.phoneVerified ? colors.success : colors.textSecondary} strokeWidth={user?.phoneVerified ? 2.4 : 1.6} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>Телефон</Text>
            <Text style={[typography.caption, { color: user?.phoneVerified ? '#34C759' : colors.textTertiary }]}>
              {user?.phone
                ? (user?.phoneVerified ? `${user.phone} · подтверждён` : `${user.phone} · не подтверждён`)
                : 'Не привязан'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('ChangePhoneScreen')} style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, backgroundColor: colors.primary + '15' }}>
            <Text style={[typography.caption, { color: colors.primary, fontWeight: '700' }]}>
              {user?.phone ? 'Сменить' : 'Привязать'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Email verification */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: user?.emailVerified ? colors.success + '20' : colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Icon name={user?.emailVerified ? 'check' : 'message'} size={15} color={user?.emailVerified ? colors.success : colors.textSecondary} strokeWidth={user?.emailVerified ? 2.4 : 1.6} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>Email</Text>
            <Text style={[typography.caption, { color: user?.emailVerified ? '#34C759' : colors.textTertiary }]}>
              {user?.email}
              {user?.emailVerified ? ' · подтверждён' : ' · не подтверждён'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            {!user?.emailVerified && (
              <TouchableOpacity
                onPress={async () => {
                  if (resendingVerif || !user?.email) return;
                  setResendingVerif(true);
                  try {
                    await authService.resendVerification(user.email);
                    setEmailVerifCode('');
                    setEmailVerifError('');
                    startResendCountdown(60);
                    setShowEmailVerifModal(true);
                  } catch (e: any) {
                    Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось отправить');
                  } finally {
                    setResendingVerif(false);
                  }
                }}
                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.primary + '60', backgroundColor: colors.primary + '10' }}
              >
                <Text style={[typography.caption, { color: colors.primary, fontWeight: '600' }]}>
                  {resendingVerif ? '...' : 'Подтвердить'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => navigation.navigate('ChangeEmailScreen')}
              style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.sm, backgroundColor: colors.primary + '15' }}
            >
              <Text style={[typography.caption, { color: colors.primary, fontWeight: '700' }]}>Сменить</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Привязанные аккаунты — отдельный экран. Раньше тут были 3 строки
            (VK / Яндекс / Google) inline; вынесли в LinkedAccountsScreen,
            чтобы профиль не превращался в простыню. */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
          onPress={() => navigation.navigate('LinkedAccountsScreen')}
        >
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary + '18', borderWidth: 1, borderColor: colors.primary + '40', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Icon name="link" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>Привязанные аккаунты</Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>VK · Яндекс · Google</Text>
          </View>
          {(() => {
            const linkedCount = [user?.hasVk, (user?.yandexId || user?.hasYandex), (user?.googleId || user?.hasGoogle)].filter(Boolean).length;
            return (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full, backgroundColor: linkedCount > 0 ? '#34C75920' : colors.border, marginRight: spacing.sm }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: linkedCount > 0 ? '#34C759' : colors.textTertiary }}>{linkedCount}/3</Text>
              </View>
            );
          })()}
          <Text style={{ color: colors.textTertiary, fontSize: 18 }}>›</Text>
        </TouchableOpacity>

        {/* Change password */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
          onPress={() => navigation.navigate('ChangePassword')}
        >
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.primary + '18', borderWidth: 1, borderColor: colors.primary + '40', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Text style={{ fontSize: 15, color: colors.primary }}>🔑</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>Сменить пароль</Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>Изменить пароль от аккаунта</Text>
          </View>
          <Text style={{ color: colors.textTertiary, fontSize: 18 }}>›</Text>
        </TouchableOpacity>

        {/* 2FA */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
          onPress={() => navigation.navigate('TwoFactorScreen')}
        >
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#D4B07A18', borderWidth: 1, borderColor: '#D4B07A40', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Text style={{ fontSize: 15, color: colors.primary }}>A</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>Двухфакторная аутентификация</Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>Защита входа кодом из приложения</Text>
          </View>
          <Text style={{ color: colors.textTertiary, fontSize: 18 }}>›</Text>
        </TouchableOpacity>

        {/* Sessions */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
          onPress={() => navigation.navigate('SessionsScreen')}
        >
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#D4B07A18', borderWidth: 1, borderColor: '#D4B07A40', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Text style={{ fontSize: 15 }}>◻</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>Активные сессии</Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>Управление устройствами</Text>
          </View>
          <Text style={{ color: colors.textTertiary, fontSize: 18 }}>›</Text>
        </TouchableOpacity>

        {/* Security history */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md }}
          onPress={() => navigation.navigate('SecurityEventsScreen')}
        >
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#F59E0B18', borderWidth: 1, borderColor: '#F59E0B40', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#F59E0B' }}>⚠</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>История безопасности</Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>Входы, смены пароля, попытки взлома</Text>
          </View>
          <Text style={{ color: colors.textTertiary, fontSize: 18 }}>›</Text>
        </TouchableOpacity>
      </Card>

      {/* ── Logout ── */}
      <Button
        title="Выйти из аккаунта"
        variant="ghost"
        onPress={handleLogout}
        fullWidth
        textStyle={{ color: colors.error }}
        style={{ marginBottom: spacing.md }}
      />

      {/* ── Delete account ── */}
      <TouchableOpacity
        onPress={() => {
          Alert.alert(
            'Удалить аккаунт',
            'Все ваши данные будут безвозвратно удалены. Это действие нельзя отменить.',
            [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Удалить',
                style: 'destructive',
                onPress: () => navigation.navigate('DeleteAccountScreen'),
              },
            ],
          );
        }}
        style={{ alignSelf: 'center', marginBottom: spacing.huge }}
      >
        <Text style={[typography.small, { color: colors.textTertiary }]}>Удалить аккаунт</Text>
      </TouchableOpacity>
    </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  // Premium hero gradient card — replaces the old centered avatar block
  heroCard: {
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  heroStatTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  // Legacy stats row, kept for callers that haven't migrated
  profileHeader: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(212,176,122,0.3)' },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    borderRadius: borderRadius.lg, borderWidth: 1,
    paddingVertical: spacing.lg, marginBottom: spacing.md,
  },
  statItem: { alignItems: 'center' },
  statDivider: { width: 1, height: 30 },
  trendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: borderRadius.md, borderWidth: 1,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    marginBottom: spacing.sm, marginTop: spacing.xs,
  },
});
