import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore, useNutritionStore, useAuthStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  selectedDate: string;
}

export const WaterTracker: React.FC<Props> = ({ selectedDate }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const { getDayLog, addWater } = useNutritionStore();
  const user = useAuthStore((s) => s.user);
  const dayLog = getDayLog(selectedDate);
  const waterTarget = dayLog.waterTargetMl ?? 2500;

  const [excessWarning, setExcessWarning] = useState(false);

  const waterPercent = waterTarget > 0 ? dayLog.waterMl / waterTarget : 0;
  const remaining = Math.max(0, waterTarget - dayLog.waterMl);

  // Estimated water from food (~60% average water content of food by weight)
  const estimatedFoodWater = useMemo(() => {
    const totalFoodGrams = dayLog.meals.reduce((sum, m) =>
      sum + m.items.reduce((s, item) => s + (item.weightGrams || 0), 0), 0);
    return Math.round(totalFoodGrams * 0.6);
  }, [dayLog.meals]);

  // Recommended daily water based on body weight
  const recommendedMl = Math.round((user?.weightKg || 70) * 35);

  const handleAddWater = (amount: number) => {
    const currentTotal = dayLog.waterMl + amount;
    if (currentTotal > 5000 && !excessWarning) {
      setExcessWarning(true);
    }
    haptic.light();
    addWater(selectedDate, amount);
  };

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={[typography.h4, { color: colors.text }]}>{'\u0412\u043E\u0434\u0430'}</Text>
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            {dayLog.waterMl} {'\u043C\u043B'} / {waterTarget} {'\u043C\u043B'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[250, 500].map((ml) => (
            <TouchableOpacity
              key={ml}
              style={[styles.waterBtn, { backgroundColor: colors.info + '15', borderColor: colors.info }]}
              onPress={() => handleAddWater(ml)}
            >
              <Text style={[typography.buttonSmall, { color: colors.info }]}>+{ml}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.waterBar, { backgroundColor: colors.progressBarBackground }]}>
        <View style={{ height: '100%', width: `${Math.min(waterPercent * 100, 100)}%`, backgroundColor: colors.info, borderRadius: borderRadius.full }} />
      </View>

      {/* Water from food estimate */}
      {estimatedFoodWater > 0 && (
        <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
          + ~{estimatedFoodWater} {'\u043C\u043B \u0438\u0437 \u0435\u0434\u044B'}
        </Text>
      )}

      {/* Recommended daily intake */}
      <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
        {'\u0420\u0435\u043A\u043E\u043C\u0435\u043D\u0434\u0430\u0446\u0438\u044F: '}{recommendedMl} {'\u043C\u043B/\u0434\u0435\u043D\u044C'}
      </Text>

      {/* Contextual tips */}
      {waterPercent < 0.3 && (
        <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>
          {'\u041F\u0435\u0439 \u0432\u043E\u0434\u0443 \u0440\u0435\u0433\u0443\u043B\u044F\u0440\u043D\u043E \u2014 \u0434\u0430\u0436\u0435 2% \u043E\u0431\u0435\u0437\u0432\u043E\u0436\u0438\u0432\u0430\u043D\u0438\u044F \u0441\u043D\u0438\u0436\u0430\u0435\u0442 \u043F\u0440\u043E\u0438\u0437\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0441\u0442\u044C'}
        </Text>
      )}
      {waterPercent >= 0.8 && waterPercent < 1.0 && (
        <Text style={[typography.caption, { color: colors.success, marginTop: spacing.xs }]}>
          {'\u041F\u043E\u0447\u0442\u0438 \u0443 \u0446\u0435\u043B\u0438! \u041E\u0441\u0442\u0430\u043B\u043E\u0441\u044C '}{remaining} {'\u043C\u043B'}
        </Text>
      )}
      {waterPercent >= 1.0 && (
        <Text style={[typography.caption, { color: colors.success, marginTop: spacing.xs }]}>
          {'\u041D\u043E\u0440\u043C\u0430 \u0432\u043E\u0434\u044B \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u0430! \u041E\u0442\u043B\u0438\u0447\u043D\u0430\u044F \u0440\u0430\u0431\u043E\u0442\u0430'}
        </Text>
      )}

      {/* Excess water warning */}
      {excessWarning && dayLog.waterMl > 5000 && (
        <Text style={[typography.caption, { color: colors.warning, marginTop: spacing.xs }]}>
          {'\u0411\u043E\u043B\u0435\u0435 5 \u043B\u0438\u0442\u0440\u043E\u0432 \u0432\u043E\u0434\u044B \u0432 \u0434\u0435\u043D\u044C \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0438\u0437\u0431\u044B\u0442\u043E\u0447\u043D\u044B\u043C'}
        </Text>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  waterBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
  waterBar: { height: 8, borderRadius: borderRadius.full, marginTop: spacing.md, overflow: 'hidden' },
});
