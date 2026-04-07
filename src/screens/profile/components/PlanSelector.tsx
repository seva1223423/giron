import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const PLANS = [
  { id: 'monthly' as const, label: 'Месяц', price: '299', period: 'мес', pricePerMonth: '299', badge: null },
  { id: 'annual' as const, label: 'Год', price: '1 990', period: 'год', pricePerMonth: '166', badge: 'СКИДКА 44%' },
];

interface Props {
  selectedPlan: 'monthly' | 'annual';
  onSelect: (plan: 'monthly' | 'annual') => void;
}

export const PlanSelector: React.FC<Props> = ({ selectedPlan, onSelect }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();

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
            <Text style={[typography.h2, { color: isSelected ? '#fff' : colors.text, marginTop: spacing.xs }]}>{plan.price}₽</Text>
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
