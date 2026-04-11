import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useSubscriptionStore } from '../../store';
import { Card, Button, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { PlanSelector, FeaturesTable } from './components';

const TESTIMONIALS = [
  { name: 'Алексей', text: 'Iron Coach перестроил всю программу под моё плечо. За 3 месяца жим вырос с 90 до 120 кг.' },
  { name: 'Мария', text: 'Фото-сканер КБЖУ — волшебство. Больше не считаю вручную, похудела на 7 кг за 2 месяца.' },
];

export const SubscriptionScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { isPremiumActive, syncWithBackend, activateOnBackend, cancelOnBackend, trialUsed } = useSubscriptionStore();
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('annual');
  const [loading, setLoading] = useState(false);
  const isActivePro = isPremiumActive();

  useEffect(() => { syncWithBackend(); }, []);

  const handleSubscribe = async () => {
    haptic.success();
    setLoading(true);
    try {
      const durationDays = trialUsed ? (selectedPlan === 'annual' ? 365 : 30) : 7;
      await activateOnBackend('pro', durationDays);
      Alert.alert(
        'Iron Gym Pro активирован!',
        trialUsed ? `Подписка активна на ${durationDays} дней` : 'Пробный период 7 дней активирован. Все функции Pro открыты!',
        [{ text: 'Отлично!', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось активировать подписку');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelPremium = () => {
    Alert.alert('Отменить подписку?', 'Вы потеряете доступ к Pro-функциям.', [
      { text: 'Не отменять', style: 'cancel' },
      { text: 'Отменить', style: 'destructive', onPress: async () => {
        setLoading(true);
        try {
          const result = await cancelOnBackend();
          Alert.alert('Подписка отменена', result.message || 'Доступ к Pro будет до конца оплаченного периода.');
        } catch (e: any) {
          Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось отменить подписку');
        } finally {
          setLoading(false);
        }
      }},
    ]);
  };

  const handleRestore = async () => {
    setLoading(true);
    try {
      await syncWithBackend();
      const isNowPremium = useSubscriptionStore.getState().isPremiumActive();
      Alert.alert(isNowPremium ? 'Подписка восстановлена!' : 'Покупки не найдены', isNowPremium ? 'Ваша Pro-подписка активна.' : 'Активных подписок не найдено.');
    } catch {
      Alert.alert('Ошибка', 'Не удалось восстановить покупки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ width: 60 }}>
          <Text style={[typography.body, { color: colors.primary }]}>← Назад</Text>
        </TouchableOpacity>
        <Text style={[typography.h4, { color: colors.text }]}>Iron Gym Pro</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <FadeIn delay={0}>
          <View style={styles.hero}>
            <View style={[styles.crownBadge, { backgroundColor: isActivePro ? colors.accent + '30' : colors.accent + '20' }]}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: isActivePro ? colors.accent : colors.primary }}>{isActivePro ? 'PRO' : 'PRO'}</Text>
            </View>
            {isActivePro ? (
              <>
                <Text style={[typography.h1, { color: colors.text, marginTop: spacing.lg, textAlign: 'center' }]}>Iron Gym Pro{'\n'}активен</Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>Все функции открыты без ограничений</Text>
              </>
            ) : (
              <>
                <Text style={[typography.h1, { color: colors.text, marginTop: spacing.lg, textAlign: 'center' }]}>Раскрой полный{'\n'}потенциал</Text>
                <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>Iron Coach, аналитика и программы{'\n'}без ограничений</Text>
              </>
            )}
          </View>
        </FadeIn>

        <FadeIn delay={100}>
          <PlanSelector selectedPlan={selectedPlan} onSelect={setSelectedPlan} />
        </FadeIn>

        {/* CTA */}
        <FadeIn delay={150}>
          {isActivePro ? (
            <>
              <View style={[styles.activeProBadge, { backgroundColor: colors.success + '18', borderColor: colors.success + '40' }]}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.success }}>✓</Text>
                <Text style={[typography.bodySemibold, { color: colors.success }]}>Pro активен</Text>
              </View>
              <TouchableOpacity onPress={handleCancelPremium} style={{ alignItems: 'center', marginTop: spacing.lg }}>
                <Text style={[typography.small, { color: colors.textTertiary }]}>Отменить подписку</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Button title={trialUsed ? 'Оформить подписку' : 'Начать бесплатный период — 7 дней'} onPress={handleSubscribe} fullWidth style={{ marginTop: spacing.lg }} />
              <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>
                {trialUsed ? `${selectedPlan === 'annual' ? '1 990₽/год' : '299₽/мес'} · Отмена в любой момент` : `Затем ${selectedPlan === 'annual' ? '1 990₽/год' : '299₽/мес'} · Отмена в любой момент`}
              </Text>
            </>
          )}
        </FadeIn>

        <FadeIn delay={200}><FeaturesTable /></FadeIn>

        {/* Social proof */}
        <FadeIn delay={300}>
          <View style={styles.socialProof}>
            <Text style={[typography.number, { color: colors.text }]}>4.9</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>Средняя оценка от пользователей Iron Gym</Text>
          </View>
        </FadeIn>

        {/* Testimonials */}
        <FadeIn delay={350}>
          {TESTIMONIALS.map((t, i) => (
            <Card key={i} style={{ marginBottom: spacing.sm }}>
              <Text style={[typography.bodySemibold, { color: colors.text }]}>{t.name}</Text>
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs }]}>"{t.text}"</Text>
            </Card>
          ))}
        </FadeIn>

        {/* Restore + Terms */}
        <FadeIn delay={400}>
          <TouchableOpacity onPress={handleRestore} style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <Text style={[typography.small, { color: colors.textSecondary }]}>Восстановить покупки</Text>
          </TouchableOpacity>
          <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 16 }]}>
            Подписка автоматически продлевается. Отменить можно в любой момент в настройках устройства.
          </Text>
        </FadeIn>
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  hero: { alignItems: 'center', paddingVertical: spacing.xxl },
  crownBadge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  activeProBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, borderRadius: borderRadius.xl, borderWidth: 1 },
  socialProof: { alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.lg },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
});
