import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useThemeStore } from '../store';
import { useSubscriptionStore, FREE_LIMITS } from '../store/useSubscriptionStore';
import { useHaptic } from '../hooks/useHaptic';
import { Icon, type IconName } from './Icon';
import { typography } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  reason: 'ai_limit' | 'food_scan_limit' | 'feature' | 'programs_limit' | 'history_limit' | 'leaderboard';
  featureName?: string;
  navigation?: any;
}

/** Reason-specific eyebrow shown above the hero headline. Kept short
 *  so the main "Полный доступ..." copy stays the focal point. */
const REASON_EYEBROW: Record<PaywallModalProps['reason'], string> = {
  ai_limit: `Лимит ${FREE_LIMITS.AI_MESSAGES_PER_DAY} AI/день исчерпан`,
  food_scan_limit: `Лимит ${FREE_LIMITS.FOOD_SCANS_PER_DAY} сканов/день исчерпан`,
  feature: 'Функция доступна в Pro',
  programs_limit: '3 программы бесплатно',
  history_limit: 'История ограничена',
  leaderboard: 'Клубный лидерборд',
};

/** Value props shown in the feature list — matches the design's 4-row
 *  layout with spark / camera / dumbbell / chart icons and a check on
 *  the right. Icon names feed the shared Icon component. */
const PRO_FEATURES: Array<{ icon: IconName; title: string; subtitle: string }> = [
  {
    icon: 'spark',
    title: 'Безлимитный ИИ‑тренер',
    subtitle: `Было ${FREE_LIMITS.AI_MESSAGES_PER_DAY} сообщений в день`,
  },
  {
    icon: 'camera',
    title: 'Сканер еды по фото',
    subtitle: 'Точный КБЖУ за 3 секунды',
  },
  {
    icon: 'dumbbell',
    title: 'Все программы',
    subtitle: '50+ профессиональных',
  },
  {
    icon: 'chart',
    title: 'Глубокая аналитика',
    subtitle: 'Тренды, PR, прогнозы',
  },
];

// Pricing from the design: annual 2990₽ (effective 249₽/mo), monthly
// 569₽. Was 6788₽ annual without discount (−56%).
const PRICE_YEAR_RUB = 2990;
const PRICE_YEAR_OLD_RUB = 6788;
const PRICE_MONTH_RUB = 569;
const PRICE_YEAR_MONTHLY_EFFECTIVE_RUB = Math.round(PRICE_YEAR_RUB / 12);
const ANNUAL_DISCOUNT_PCT = Math.round(100 - (PRICE_YEAR_RUB / PRICE_YEAR_OLD_RUB) * 100);

/**
 * Premium paywall sheet — pixel copy of the Claude Design handoff
 * (variation-a-3.jsx → A_Paywall). Sits on a warm graphite sheet with
 * a gold radial glow at the top, IRON · PRO logo mark, hero headline
 * with gold italic word, 4-row feature list, annual/monthly plan toggle,
 * Russian payment method strip, and tall 58pt gold CTA.
 *
 * The annual plan is pre-selected (matches design) and shows the
 * strike-through old price + "ВЫГОДА −56%" gold chip badge.
 */
export const PaywallModal: React.FC<PaywallModalProps> = ({
  visible,
  onClose,
  reason,
  featureName,
  navigation,
}) => {
  const { colors } = useThemeStore();
  const { trialUsed } = useSubscriptionStore();
  const haptic = useHaptic();
  // Plan selection — design opens with annual highlighted; user can tap
  // the monthly card to switch the primary CTA target.
  const [selectedPlan, setSelectedPlan] = useState<'year' | 'month'>('year');

  const handleSubscribe = () => {
    haptic.medium();
    onClose();
    if (navigation) {
      navigation.navigate('Subscription', { preselect: selectedPlan });
    }
  };

  const selectedPrice = selectedPlan === 'year' ? PRICE_YEAR_RUB : PRICE_MONTH_RUB;
  const ctaTitle = trialUsed
    ? `Оформить за ${selectedPrice.toLocaleString('ru-RU')} ₽`
    : 'Начать 7 дней бесплатно';
  const ctaFineprint = trialUsed
    ? 'Отмена в любой момент'
    : selectedPlan === 'year'
    ? `Далее ${PRICE_YEAR_RUB.toLocaleString('ru-RU')} ₽ / год · можно отменить в любой момент`
    : `Далее ${PRICE_MONTH_RUB.toLocaleString('ru-RU')} ₽ / мес · можно отменить в любой момент`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel="Закрыть подписку"
      />
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Radial gold glow at the top — design spec. SVG absolute
            behind the content so the glow reads as ambient warmth. */}
        <Svg
          width="100%"
          height={360}
          style={styles.glow}
          pointerEvents="none"
          preserveAspectRatio="none"
        >
          <Defs>
            <RadialGradient id="paywallGlow" cx="50%" cy="0%" rx="75%" ry="70%">
              <Stop offset="0" stopColor={colors.primary} stopOpacity={0.28} />
              <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#paywallGlow)" />
        </Svg>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Header row — logo/brand on left, close X on right */}
          <View style={styles.headerRow}>
            <View style={styles.brand}>
              <Icon name="logo" size={20} color={colors.primary} />
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 12,
                  fontWeight: '600',
                  letterSpacing: 3,
                }}
              >
                IRON · PRO
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { haptic.light(); onClose(); }}
              accessibilityLabel="Закрыть"
              accessibilityRole="button"
              style={[
                styles.closeBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Eyebrow: meta uppercase either the reason the paywall fired
              OR the trial badge "7 ДНЕЙ БЕСПЛАТНО" for trial-eligible users. */}
          <Text
            style={[
              typography.metaLabel,
              {
                color: colors.primary,
                textTransform: 'uppercase',
                marginTop: spacing.lg,
              },
            ]}
          >
            {trialUsed ? REASON_EYEBROW[reason] : '7 дней бесплатно'}
          </Text>

          {/* Hero headline. The middle word ("персональному") is gold + italic
              to match the design's typographic accent. featureName override
              keeps the paywall targeted when triggered by a specific screen. */}
          <Text
            style={[
              typography.h1,
              { color: colors.text, fontSize: 40, lineHeight: 42, marginTop: 14 },
            ]}
          >
            Полный доступ{'\n'}к{' '}
            <Text
              style={{
                color: colors.primary,
                fontStyle: 'italic',
                fontWeight: '500',
              }}
            >
              персональному
            </Text>
            {'\n'}тренеру.
          </Text>
          <Text
            style={[
              typography.small,
              { color: colors.textSecondary, marginTop: 14, lineHeight: 20 },
            ]}
          >
            {featureName
              ?? 'Безлимитный ИИ, программы под вас, анализ фото еды, углублённая аналитика.'}
          </Text>

          {/* Feature rows */}
          <View style={{ marginTop: spacing.xl }}>
            {PRO_FEATURES.map((f, i) => (
              <View
                key={i}
                style={[
                  styles.featureRow,
                  i < PRO_FEATURES.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.featureIconTile,
                    { backgroundColor: colors.primary + '18' },
                  ]}
                >
                  <Icon name={f.icon} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                    {f.title}
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                  >
                    {f.subtitle}
                  </Text>
                </View>
                <Icon name="check" size={16} color={colors.text} strokeWidth={2.4} />
              </View>
            ))}
          </View>

          {/* Plan cards. Annual has the gold border + "Выгода −56%" badge
              + strike-through old price. Monthly is the quieter option. */}
          <View style={{ marginTop: spacing.lg, gap: 8 }}>
            <TouchableOpacity
              onPress={() => { haptic.selection(); setSelectedPlan('year'); }}
              activeOpacity={0.9}
              accessibilityLabel={`Годовая подписка ${PRICE_YEAR_RUB} рублей, выгода ${ANNUAL_DISCOUNT_PCT} процентов`}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedPlan === 'year' }}
              style={[
                styles.planCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: selectedPlan === 'year' ? colors.primary : colors.border,
                  borderWidth: selectedPlan === 'year' ? 2 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.planBadge,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={{
                    color: colors.textInverse,
                    fontSize: 10,
                    fontWeight: '700',
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                  }}
                >
                  Выгода −{ANNUAL_DISCOUNT_PCT}%
                </Text>
              </View>
              <View style={styles.planRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Год</Text>
                  <Text
                    style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                  >
                    {PRICE_YEAR_MONTHLY_EFFECTIVE_RUB} ₽ / мес · списание раз в год
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[typography.h3, { color: colors.text }]}>
                    {PRICE_YEAR_RUB.toLocaleString('ru-RU')} ₽
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 11,
                      textDecorationLine: 'line-through',
                    }}
                  >
                    {PRICE_YEAR_OLD_RUB.toLocaleString('ru-RU')} ₽
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { haptic.selection(); setSelectedPlan('month'); }}
              activeOpacity={0.9}
              accessibilityLabel={`Месячная подписка ${PRICE_MONTH_RUB} рублей`}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedPlan === 'month' }}
              style={[
                styles.planCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: selectedPlan === 'month' ? colors.primary : colors.border,
                  borderWidth: selectedPlan === 'month' ? 2 : 1,
                  paddingTop: spacing.lg,
                },
              ]}
            >
              <View style={styles.planRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>Месяц</Text>
                  <Text
                    style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}
                  >
                    Отмена в любой момент
                  </Text>
                </View>
                <Text style={[typography.h3, { color: colors.text }]}>
                  {PRICE_MONTH_RUB} ₽
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Payment methods strip — design lists these explicitly as
              trust signals for the Russian market. */}
          <View style={styles.paymentRow}>
            <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>ЮKassa</Text>
            <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>·</Text>
            <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>СБП</Text>
            <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>·</Text>
            <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>МИР</Text>
            <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>·</Text>
            <Text style={[styles.paymentLabel, { color: colors.textSecondary }]}>Apple Pay</Text>
          </View>

          {/* CTA — tall gold pill with dark text. 58pt per design spec. */}
          <TouchableOpacity
            onPress={handleSubscribe}
            activeOpacity={0.9}
            accessibilityLabel={ctaTitle}
            accessibilityRole="button"
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text
              style={{
                color: colors.textInverse,
                fontSize: 16,
                fontWeight: '600',
              }}
            >
              {ctaTitle}
            </Text>
            <View style={{ marginLeft: 8 }}>
              <Icon name="arrow" size={18} color={colors.textInverse} strokeWidth={2.2} />
            </View>
          </TouchableOpacity>

          <Text
            style={[
              typography.caption,
              { color: colors.textTertiary, textAlign: 'center', marginTop: 10 },
            ]}
          >
            {ctaFineprint}
          </Text>

          <TouchableOpacity
            onPress={() => { haptic.light(); onClose(); }}
            style={styles.skipBtn}
            accessibilityLabel="Не сейчас"
            accessibilityRole="button"
          >
            <Text style={[typography.small, { color: colors.textSecondary }]}>Не сейчас</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: spacing.huge,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandGlyph: { fontSize: 20, fontWeight: '700' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  featureIconTile: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCard: {
    padding: 16,
    borderRadius: 18,
    position: 'relative',
  },
  planBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    zIndex: 1,
  },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: spacing.lg,
  },
  paymentLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '500',
  },
  cta: {
    height: 58,
    borderRadius: 20,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
});
