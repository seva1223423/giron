import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../store';
import { useSubscriptionStore, FREE_LIMITS } from '../store/useSubscriptionStore';
import { typography } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import { Button } from './Button';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  reason: 'ai_limit' | 'food_scan_limit' | 'feature';
  featureName?: string;
  navigation?: any;
}

const REASON_CONFIGS = {
  ai_limit: {
    emoji: '🤖',
    title: 'Лимит Iron Coach исчерпан',
    subtitle: `${FREE_LIMITS.AI_MESSAGES_PER_DAY} сообщений в день для бесплатного плана`,
    ctaTitle: 'Безлимитный AI за 299₽/мес',
  },
  food_scan_limit: {
    emoji: '📸',
    title: 'Лимит сканов исчерпан',
    subtitle: `${FREE_LIMITS.FOOD_SCANS_PER_DAY} сканов в день для бесплатного плана`,
    ctaTitle: 'Безлимитные сканы за 299₽/мес',
  },
  feature: {
    emoji: '👑',
    title: 'Функция Pro',
    subtitle: 'Это функция Iron Gym Pro',
    ctaTitle: 'Открыть Pro за 299₽/мес',
  },
};

const PRO_PERKS = [
  { icon: '🤖', text: 'Iron Coach без ограничений' },
  { icon: '📸', text: 'Безлимитный сканер КБЖУ' },
  { icon: '📊', text: 'Расширенная аналитика' },
  { icon: '📋', text: '20+ готовых программ' },
  { icon: '🏆', text: 'Клубный лидерборд' },
];

export const PaywallModal: React.FC<PaywallModalProps> = ({
  visible,
  onClose,
  reason,
  featureName,
  navigation,
}) => {
  const { colors } = useThemeStore();
  const { trialUsed } = useSubscriptionStore();
  const config = REASON_CONFIGS[reason];

  const handleOpenSubscription = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    if (navigation) {
      navigation.navigate('Subscription');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: colors.accent + '18' }]}>
              <Text style={{ fontSize: 36 }}>{config.emoji}</Text>
            </View>
            <Text style={[typography.h3, { color: colors.text, marginTop: spacing.lg, textAlign: 'center' }]}>
              {featureName ?? config.title}
            </Text>
            <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
              {config.subtitle}
            </Text>
          </View>

          {/* Perks */}
          <View style={[styles.perksContainer, { backgroundColor: colors.background, borderRadius: borderRadius.xl }]}>
            {PRO_PERKS.map((perk, i) => (
              <View
                key={i}
                style={[
                  styles.perkRow,
                  i < PRO_PERKS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider },
                ]}
              >
                <Text style={{ fontSize: 18 }}>{perk.icon}</Text>
                <Text style={[typography.small, { color: colors.text, flex: 1 }]}>{perk.text}</Text>
                <Text style={{ color: colors.success, fontSize: 16 }}>✓</Text>
              </View>
            ))}
          </View>

          {/* Pricing */}
          <View style={styles.pricingRow}>
            <View style={[styles.pricingCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>МЕСЯЦ</Text>
              <Text style={[typography.h3, { color: colors.text }]}>299₽</Text>
            </View>
            <View style={[styles.pricingCard, styles.pricingCardAccent, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
              <View style={[styles.badgeChip, { backgroundColor: '#fff' }]}>
                <Text style={[typography.caption, { color: colors.accent, fontWeight: '800', fontSize: 9 }]}>СКИДКА 44%</Text>
              </View>
              <Text style={[typography.captionMedium, { color: 'rgba(255,255,255,0.75)' }]}>ГОД</Text>
              <Text style={[typography.h3, { color: '#fff' }]}>1 990₽</Text>
              <Text style={[typography.caption, { color: 'rgba(255,255,255,0.7)' }]}>~166₽/мес</Text>
            </View>
          </View>

          {/* CTA */}
          <Button
            title={trialUsed ? config.ctaTitle : 'Начать бесплатный период — 7 дней'}
            onPress={handleOpenSubscription}
            fullWidth
            style={{ marginTop: spacing.lg }}
          />
          {!trialUsed && (
            <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>
              Затем от 166₽/мес · Отмена в любой момент
            </Text>
          )}

          <TouchableOpacity onPress={onClose} style={styles.skipBtn}>
            <Text style={[typography.small, { color: colors.textSecondary }]}>Не сейчас</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.huge,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perksContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  pricingRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  pricingCard: {
    flex: 1,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    padding: spacing.lg,
    alignItems: 'center',
  },
  pricingCardAccent: {
    paddingTop: spacing.xl + 4,
    position: 'relative',
  },
  badgeChip: {
    position: 'absolute',
    top: -10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
});
