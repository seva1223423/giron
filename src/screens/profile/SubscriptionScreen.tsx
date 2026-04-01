import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore, useSubscriptionStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FEATURES = [
  { icon: '🤖', title: 'Iron Coach без ограничений', free: '10 сообщений/день', pro: 'Безлимитно' },
  { icon: '📊', title: 'Расширенная аналитика', free: 'Базовая', pro: 'Полная + тренды' },
  { icon: '📋', title: 'Готовые программы', free: '3 шаблона', pro: '20+ программ' },
  { icon: '🥗', title: 'КБЖУ сканер фото', free: '5 сканов/день', pro: 'Безлимитно' },
  { icon: '🏆', title: 'Клубный лидерборд', free: 'Просмотр', pro: 'Участие + рекорды' },
  { icon: '📈', title: 'Динамика 1ПМ', free: 'Последние 10', pro: 'Полная история' },
  { icon: '⚡', title: 'Приоритетный AI-ответ', free: '—', pro: 'Есть' },
  { icon: '🔔', title: 'Умные напоминания', free: 'Базовые', pro: 'Персонализированные' },
];

const PLANS = [
  {
    id: 'monthly',
    label: 'Месяц',
    price: '299',
    period: 'мес',
    pricePerMonth: '299',
    badge: null,
  },
  {
    id: 'annual',
    label: 'Год',
    price: '1 990',
    period: 'год',
    pricePerMonth: '166',
    badge: 'СКИДКА 44%',
  },
];

export const SubscriptionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { isPremiumActive, activatePremium, deactivatePremium, markTrialUsed, trialUsed } = useSubscriptionStore();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const isActivePro = isPremiumActive();

  const handleSubscribe = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // TODO: Integrate RevenueCat / ЮKassa for real payment processing
    // For now: activate premium locally as a demo/trial
    const daysToAdd = trialUsed ? (selectedPlan === 'annual' ? 365 : 30) : 7;
    const expiresAt = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
    activatePremium(expiresAt);
    markTrialUsed();
    Alert.alert(
      '🎉 Iron Gym Pro активирован!',
      trialUsed
        ? `Подписка активна на ${daysToAdd} дней`
        : 'Пробный период 7 дней активирован. Все функции Pro открыты!',
      [{ text: 'Отлично!', onPress: () => navigation.goBack() }]
    );
  };

  const handleCancelPremium = () => {
    Alert.alert(
      'Отменить подписку?',
      'Вы потеряете доступ к Pro-функциям.',
      [
        { text: 'Не отменять', style: 'cancel' },
        {
          text: 'Отменить',
          style: 'destructive',
          onPress: () => {
            deactivatePremium();
            Alert.alert('Подписка отменена', 'Доступ к Pro будет до конца оплаченного периода.');
          },
        },
      ]
    );
  };

  const handleRestore = () => {
    Alert.alert('Восстановление покупок', 'Предыдущие покупки не найдены.');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
        </TouchableOpacity>
        <Text style={[typography.h4, { color: colors.text }]}>Iron Gym Pro</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <FadeIn delay={0}>
          <View style={styles.hero}>
            <View style={[styles.crownBadge, { backgroundColor: isActivePro ? colors.accent + '30' : colors.accent + '20' }]}>
              <Text style={{ fontSize: 40 }}>{isActivePro ? '✨' : '👑'}</Text>
            </View>
            {isActivePro ? (
              <>
                <Text style={[typography.h1, { color: colors.text, marginTop: spacing.lg, textAlign: 'center' }]}>
                  Iron Gym Pro{'\n'}активен
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                  Все функции открыты без ограничений
                </Text>
              </>
            ) : (
              <>
                <Text style={[typography.h1, { color: colors.text, marginTop: spacing.lg, textAlign: 'center' }]}>
                  Раскрой полный{'\n'}потенциал
                </Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
                  Iron Coach, аналитика и программы{'\n'}без ограничений
                </Text>
              </>
            )}
          </View>
        </FadeIn>

        {/* Plans */}
        <FadeIn delay={100}>
          <View style={styles.plansRow}>
            {PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              return (
                <TouchableOpacity
                  key={plan.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedPlan(plan.id as 'monthly' | 'annual');
                  }}
                  style={[
                    styles.planCard,
                    {
                      backgroundColor: isSelected ? colors.accent : colors.surface,
                      borderColor: isSelected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  {plan.badge && (
                    <View style={[styles.planBadge, { backgroundColor: '#fff' }]}>
                      <Text style={[typography.small, { color: colors.accent, fontWeight: '800', fontSize: 10 }]}>
                        {plan.badge}
                      </Text>
                    </View>
                  )}
                  <Text style={[typography.captionMedium, { color: isSelected ? '#fff' : colors.textSecondary }]}>
                    {plan.label.toUpperCase()}
                  </Text>
                  <Text style={[typography.h2, { color: isSelected ? '#fff' : colors.text, marginTop: spacing.xs }]}>
                    {plan.price}₽
                  </Text>
                  <Text style={[typography.small, { color: isSelected ? 'rgba(255,255,255,0.7)' : colors.textTertiary }]}>
                    / {plan.period}
                  </Text>
                  {plan.id === 'annual' && (
                    <Text style={[typography.caption, { color: isSelected ? 'rgba(255,255,255,0.85)' : colors.textSecondary, marginTop: spacing.xs }]}>
                      ~{plan.pricePerMonth}₽/мес
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </FadeIn>

        {/* CTA */}
        <FadeIn delay={150}>
          {isActivePro ? (
            <>
              <View style={[styles.activeProBadge, { backgroundColor: colors.success + '18', borderColor: colors.success + '40' }]}>
                <Text style={{ fontSize: 18 }}>✅</Text>
                <Text style={[typography.bodySemibold, { color: colors.success }]}>Pro активен</Text>
              </View>
              <TouchableOpacity onPress={handleCancelPremium} style={{ alignItems: 'center', marginTop: spacing.lg }}>
                <Text style={[typography.small, { color: colors.textTertiary }]}>Отменить подписку</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Button
                title={trialUsed ? `Оформить подписку` : `Начать бесплатный период — 7 дней`}
                onPress={handleSubscribe}
                fullWidth
                style={{ marginTop: spacing.lg }}
              />
              <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>
                {trialUsed
                  ? `${selectedPlan === 'annual' ? '1 990₽/год' : '299₽/мес'} · Отмена в любой момент`
                  : `Затем ${selectedPlan === 'annual' ? '1 990₽/год' : '299₽/мес'} · Отмена в любой момент`
                }
              </Text>
            </>
          )}
        </FadeIn>

        {/* Features comparison */}
        <FadeIn delay={200}>
          <Card style={{ marginTop: spacing.xxl }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
              Что входит в Pro
            </Text>

            {/* Table header */}
            <View style={[styles.tableRow, { borderBottomWidth: 2, borderBottomColor: colors.border, paddingBottom: spacing.sm }]}>
              <View style={{ flex: 1 }} />
              <Text style={[typography.captionMedium, { color: colors.textSecondary, width: 72, textAlign: 'center' }]}>
                Бесплатно
              </Text>
              <View style={[styles.proHeader, { backgroundColor: colors.accent }]}>
                <Text style={[typography.captionMedium, { color: '#fff', width: 64, textAlign: 'center' }]}>Pro</Text>
              </View>
            </View>

            {FEATURES.map((f, i) => (
              <View
                key={i}
                style={[
                  styles.tableRow,
                  { paddingVertical: spacing.md },
                  i < FEATURES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
              >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingRight: spacing.sm }}>
                  <Text style={{ fontSize: 16 }}>{f.icon}</Text>
                  <Text style={[typography.small, { color: colors.text, flex: 1 }]}>{f.title}</Text>
                </View>
                <Text style={[typography.small, { color: colors.textTertiary, width: 72, textAlign: 'center', fontSize: 11 }]}>
                  {f.free}
                </Text>
                <Text style={[typography.small, { color: colors.accent, width: 64, textAlign: 'center', fontWeight: '700', fontSize: 11 }]}>
                  {f.pro}
                </Text>
              </View>
            ))}
          </Card>
        </FadeIn>

        {/* Social proof */}
        <FadeIn delay={300}>
          <View style={styles.socialProof}>
            <Text style={[typography.number, { color: colors.text }]}>⭐ 4.9</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>
              Средняя оценка от пользователей Iron Gym
            </Text>
          </View>
        </FadeIn>

        {/* Testimonials */}
        <FadeIn delay={350}>
          {[
            { name: 'Алексей', text: 'Iron Coach перестроил всю программу под моё плечо. За 3 месяца жим вырос с 90 до 120 кг.' },
            { name: 'Мария', text: 'Фото-сканер КБЖУ — волшебство. Больше не считаю вручную, похудела на 7 кг за 2 месяца.' },
          ].map((t, i) => (
            <Card key={i} style={{ marginBottom: spacing.sm }}>
              <Text style={[typography.bodySemibold, { color: colors.text }]}>{t.name}</Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>"{t.text}"</Text>
            </Card>
          ))}
        </FadeIn>

        {/* Restore + Terms */}
        <FadeIn delay={400}>
          <TouchableOpacity onPress={handleRestore} style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <Text style={[typography.small, { color: colors.textSecondary }]}>
              Восстановить покупки
            </Text>
          </TouchableOpacity>
          <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 16 }]}>
            Подписка автоматически продлевается. Отменить можно в любой момент в настройках устройства.
          </Text>
        </FadeIn>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: 60,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { width: 60 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  hero: { alignItems: 'center', paddingVertical: spacing.xxl },
  crownBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plansRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  planCard: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    padding: spacing.lg,
    alignItems: 'center',
    position: 'relative',
    paddingTop: spacing.xl,
  },
  planBadge: {
    position: 'absolute',
    top: -12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  proHeader: {
    width: 64,
    borderRadius: borderRadius.sm,
    paddingVertical: 3,
    alignItems: 'center',
  },
  socialProof: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  activeProBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
});
