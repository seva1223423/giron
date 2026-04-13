import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useAuthStore, useWorkoutStore, useNutritionStore } from '../../store';
import { Card, Button, AnimatedPressable } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { computeAchievements } from '../../utils/achievements';
import { LifetimeStatsCard } from './components';
import { userService } from '../../services';
import { authService } from '../../services/authService';
import type { BodyWeight } from '../../types';

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

// Single row in the navigation menu
const MenuRow: React.FC<{
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  isLast?: boolean;
  colors: any;
  badge?: string;
  badgeColor?: string;
}> = ({ icon, iconBg, iconColor, title, subtitle, onPress, isLast, colors, badge, badgeColor }) => (
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
      <Text style={{ fontSize: 15, fontWeight: '700', color: iconColor }}>{icon}</Text>
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
    <Text style={[typography.body, { color: colors.textTertiary }]}>›</Text>
  </AnimatedPressable>
);

export const ProfileScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { workoutHistory } = useWorkoutStore();
  const { dailyLog } = useNutritionStore();

  const [weightHistory, setWeightHistory] = useState<BodyWeight[]>([]);
  const [resendingVerif, setResendingVerif] = useState(false);

  useEffect(() => {
    userService.getWeightHistory().then(setWeightHistory).catch(() => {});
  }, []);

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
    const nutritionDaysLogged = Object.values(dailyLog).filter((d) => d.meals.length > 0).length;
    const sortedDates = workoutHistory
      .filter((w) => w.completedAt)
      .map((w) => w.completedAt!.split('T')[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => b.localeCompare(a));
    let currentStreak = 0;
    const today = new Date();
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      if (sortedDates[i] === expected.toISOString().split('T')[0]) currentStreak++;
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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: safeTop }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile header ── */}
      <View style={styles.profileHeader}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#FFF', fontSize: 32, fontWeight: '800' }}>{(user?.firstName?.[0] || 'A').toUpperCase()}</Text>
        </View>
        <Text style={[typography.h2, { color: colors.text, marginTop: spacing.lg }]}>{user?.firstName} {user?.lastName}</Text>
        <Text style={[typography.body, { color: colors.textSecondary }]}>{user?.email}</Text>
        {daysWithUs !== null && (
          <View style={{ backgroundColor: colors.primary + '15', borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: 3, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.primary + '30' }}>
            <Text style={[typography.caption, { color: colors.primary, fontWeight: '700' }]}>
              С нами {daysWithUs} {daysWithUs === 1 ? 'день' : daysWithUs < 5 ? 'дня' : 'дней'}
            </Text>
          </View>
        )}
      </View>

      {/* ── Stats row ── */}
      <View style={[styles.statsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.statItem}>
          <Text style={[typography.numberSmall, { color: colors.primary }]}>{workoutHistory.length}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Тренировок</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[typography.numberSmall, { color: colors.primary }]}>{user?.weightKg || '—'}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>кг</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
        <View style={styles.statItem}>
          <Text style={[typography.numberSmall, { color: colors.primary }]}>{unlockedAchievements.length}</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>Ачивок</Text>
        </View>
      </View>

      {/* ── Weight trend (compact inline, only if data exists) ── */}
      {weightTrend && (
        <View style={[styles.trendRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28 }}>
            {weightTrend.entries.map((e, i) => {
              const vals = weightTrend.entries.map((x) => x.weightKg);
              const min = Math.min(...vals); const max = Math.max(...vals);
              const h = Math.max(4, Math.round(((e.weightKg - min) / (max - min || 1)) * 24) + 4);
              return <View key={i} style={{ width: 8, height: h, borderRadius: 2, backgroundColor: i === weightTrend.entries.length - 1 ? colors.primary : colors.border }} />;
            })}
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
        <ProfileRow label="Пол" value={user?.gender === 'male' ? 'Мужской' : user?.gender === 'female' ? 'Женский' : 'Не указан'} colors={colors} />
        <ProfileRow label="Цель" value={user?.goal ? GOAL_LABELS[user.goal] ?? user.goal : 'Не указана'} colors={colors} />
        <ProfileRow label="Уровень" value={user?.fitnessLevel ? LEVEL_LABELS[user.fitnessLevel] ?? user.fitnessLevel : 'Не указан'} colors={colors} />
        <ProfileRow label="Стаж" value={user?.trainingExperienceYears ? `${user.trainingExperienceYears} лет` : 'Не указан'} colors={colors} isLast />
      </Card>

      {/* ── Section: Достижения ── */}
      {unlockedAchievements.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>ДОСТИЖЕНИЯ</Text>
          <Card style={{ marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <Text style={[typography.h4, { color: colors.text }]}>{unlockedAchievements.length} из {achievements.length}</Text>
              <TouchableOpacity onPress={() => { haptic.selection(); navigation.navigate('ProgressTab' as any); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[typography.smallMedium, { color: colors.primary }]}>Все →</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {unlockedAchievements.slice(0, 4).map((ach) => (
                <View key={ach.id} style={{ alignItems: 'center', flex: 1, minWidth: '22%' }}>
                  <Text style={{ fontSize: 24 }}>{ach.emoji}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textSecondary, marginTop: 2, textAlign: 'center' }} numberOfLines={2}>{ach.title}</Text>
                </View>
              ))}
            </View>
          </Card>
        </>
      )}

      {/* ── Section: Меню ── */}
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>ПРИЛОЖЕНИЕ</Text>

      <Card style={{ marginBottom: spacing.lg }}>
        <MenuRow
          icon="⚙"
          iconBg={colors.border}
          iconColor={colors.textSecondary}
          title="Настройки"
          subtitle="Тема, уведомления, единицы"
          onPress={() => { haptic.selection(); navigation.navigate('Settings'); }}
          colors={colors}
        />
        <MenuRow
          icon="T"
          iconBg={colors.primary + '18'}
          iconColor={colors.primary}
          title="Режим тренера"
          subtitle="Клиенты, программы, прогресс"
          onPress={() => { haptic.selection(); navigation.navigate('TrainerDashboard'); }}
          colors={colors}
        />
        <MenuRow
          icon="★"
          iconBg={colors.accent + '18'}
          iconColor={colors.accent}
          title="Подписка"
          subtitle="Iron Gym Pro — 7 дней бесплатно"
          badge="PRO"
          badgeColor={colors.accent}
          onPress={() => { haptic.selection(); navigation.navigate('Subscription'); }}
          colors={colors}
        />
        <MenuRow
          icon="◫"
          iconBg={colors.border}
          iconColor={colors.textSecondary}
          title="Новости спорта"
          subtitle="Лента, категории, сохранённое"
          onPress={() => { haptic.selection(); navigation.navigate('NewsScreen'); }}
          colors={colors}
        />
        <MenuRow
          icon="?"
          iconBg="#6366F118"
          iconColor="#6366F1"
          title="Техническая поддержка"
          subtitle="Вопросы, проблемы, предложения"
          onPress={() => { haptic.selection(); navigation.navigate('SupportScreen'); }}
          isLast={!(user?.role === 'admin' || user?.role === 'support')}
          colors={colors}
        />
        {(user?.role === 'admin' || user?.role === 'support') && (
          <MenuRow
            icon="A"
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
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: user?.phoneVerified ? '#34C75920' : colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Text style={{ fontSize: 15 }}>{user?.phoneVerified ? '✓' : '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>Телефон</Text>
            <Text style={[typography.caption, { color: user?.phoneVerified ? '#34C759' : colors.textTertiary }]}>
              {user?.phone
                ? (user?.phoneVerified ? `${user.phone} · подтверждён` : `${user.phone} · не подтверждён`)
                : 'Не привязан'}
            </Text>
          </View>
        </View>

        {/* Email verification */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: user?.emailVerified ? '#34C75920' : colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Text style={{ fontSize: 15 }}>{user?.emailVerified ? '✓' : '@'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>Email</Text>
            <Text style={[typography.caption, { color: user?.emailVerified ? '#34C759' : colors.textTertiary }]}>
              {user?.email}
              {user?.emailVerified ? ' · подтверждён' : ' · не подтверждён'}
            </Text>
          </View>
          {!user?.emailVerified && (
            <TouchableOpacity
              onPress={async () => {
                if (resendingVerif || !user?.email) return;
                setResendingVerif(true);
                try {
                  await authService.resendVerification(user.email);
                  Alert.alert('Готово', 'Код подтверждения отправлен на ' + user.email);
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
        </View>

        {/* Linked social accounts */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textSecondary }}>ВК</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[typography.smallMedium, { color: colors.text }]}>VK ID</Text>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>
              {user?.vkId ? 'Привязан' : 'Не привязан'}
            </Text>
          </View>
        </View>

        {/* Change password */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md }}
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
      </Card>

      {/* ── Logout ── */}
      <Button
        title="Выйти из аккаунта"
        variant="ghost"
        onPress={handleLogout}
        fullWidth
        textStyle={{ color: colors.error }}
        style={{ marginBottom: spacing.huge }}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  profileHeader: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(139,92,246,0.3)' },
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
