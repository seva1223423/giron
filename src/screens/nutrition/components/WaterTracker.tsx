import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore, useNutritionStore } from '../../../store';
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
  const dayLog = getDayLog(selectedDate);
  const waterTarget = dayLog.waterTargetMl ?? 2500;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={[typography.h4, { color: colors.text }]}>Вода</Text>
          <Text style={[typography.body, { color: colors.textSecondary }]}>
            {dayLog.waterMl} мл / {waterTarget} мл
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[250, 500].map((ml) => (
            <TouchableOpacity
              key={ml}
              style={[styles.waterBtn, { backgroundColor: colors.info + '15', borderColor: colors.info }]}
              onPress={() => { haptic.light(); addWater(selectedDate, ml); }}
            >
              <Text style={[typography.buttonSmall, { color: colors.info }]}>+{ml}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.waterBar, { backgroundColor: colors.progressBarBackground }]}>
        <View style={{ height: '100%', width: `${Math.min((dayLog.waterMl / waterTarget) * 100, 100)}%`, backgroundColor: colors.info, borderRadius: borderRadius.full }} />
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  waterBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1 },
  waterBar: { height: 8, borderRadius: borderRadius.full, marginTop: spacing.md, overflow: 'hidden' },
});
