import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import {
  PRICE_MONTH_RUB,
  PRICE_YEAR_RUB,
  PRICE_YEAR_MONTHLY_EFFECTIVE_RUB,
  ANNUAL_DISCOUNT_PCT,
} from '../../../utils/paywall';

// Prices come from utils/paywall — never retype them here. This screen used
// to hardcode 1990/299 while the paywall modal hardcoded 2990/569, so the
// price changed between tapping "Оформить" and landing here (audit R3).
const PLANS = [
  {
    id: 'monthly' as const,
    label: 'Месяц',
    price: PRICE_MONTH_RUB.toLocaleString('ru-RU'),
    period: 'мес',
    pricePerMonth: null,
    badge: null,
  },
  {
    id: 'annual' as const,
    label: 'Год',
    price: PRICE_YEAR_RUB.toLocaleString('ru-RU'),
    period: 'год',
    pricePerMonth: PRICE_YEAR_MONTHLY_EFFECTIVE_RUB.toLocaleString('ru-RU'),
    badge: `СКИДКА ${ANNUAL_DISCOUNT_PCT}%`,
  },
];

interface Props {
  selectedPlan: 'monthly' | 'annual';
  onSelect: (plan: 'monthly' | 'annual') => void;
}

export const PlanSelector: React.FC<Props> = ({ selectedPlan, onSelect }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();

  return (
    <View style={styles.row}>
      {PLANS.map((plan) => {
        const isSelected = selectedPlan === plan.id;
        return (
          <TouchableOpacity
            key={plan.id}
            onPress={() => { haptic.selection(); onSelect(plan.id); }}
            style={[styles.card, { backgroundColor: isSelected ? colors.accent : colors.surface, borderColor: isSelected ? colors.accent : colors.border }]}
          >
            {plan.badge && (
              <View style={[styles.badge, { backgroundColor: '#fff' }]}>
                <Text style={[typography.small, { color: colors.accent, fontWeight: '800', fontSize: 10 }]}>{plan.badge}</Text>
              </View>
            )}
            <Text style={[typography.captionMedium, { color: isSelected ? '#fff' : colors.textSecondary }]}>{plan.label.toUpperCase()}</Text>
            <Text style={[typography.h2, { color: isSelected ? '#fff' : colors.text, marginTop: spacing.xs }]} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>{plan.price}₽</Text>
            <Text style={[typography.small, { color: isSelected ? 'rgba(255,255,255,0.7)' : colors.textTertiary }]}>/ {plan.period}</Text>
            {plan.id === 'annual' && (
              <Text style={[typography.caption, { color: isSelected ? 'rgba(255,255,255,0.85)' : colors.textSecondary, marginTop: spacing.xs }]}>~{plan.pricePerMonth}₽/мес</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  card: { flex: 1, borderRadius: borderRadius.xl, borderWidth: 2, padding: spacing.lg, alignItems: 'center', position: 'relative', paddingTop: spacing.xl },
  badge: { position: 'absolute', top: -12, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm },
});
