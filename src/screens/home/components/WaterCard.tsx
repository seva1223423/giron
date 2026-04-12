import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { useHaptic } from '../../../hooks/useHaptic';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  dayLog: { waterMl: number; waterTargetMl?: number };
  today: string;
}

export const WaterCard: React.FC<Props> = ({ dayLog, today }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const target = dayLog.waterTargetMl ?? 2500;
  const pct = target > 0 ? Math.min((dayLog.waterMl / target) * 100, 100) : 0;

  const handleWater = (ml: number) => {
    haptic.light();
    useNutritionStore.getState().addWater(today, ml);
  };

  return (
    <Card style={{ marginBottom: spacing.xxxl }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <View>
          <Text style={[typography.h4, { color: colors.text }]}>Вода</Text>
          <Text style={[typography.small, { color: colors.textSecondary }]}>
            {dayLog.waterMl} / {target} мл
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[250, 500].map((ml) => (
            <TouchableOpacity
              key={ml}
              style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.md, borderWidth: 1, backgroundColor: colors.info + '15', borderColor: colors.info }}
              onPress={() => handleWater(ml)}
            >
              <Text style={[typography.buttonSmall, { color: colors.info }]}>+{ml}мл</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.info, width: `${pct}%` }} />
      </View>
    </Card>
  );
};
