import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useThemeStore, useNutritionStore, useAuthStore } from '../../../store';
import { Card, ProgressRing, MacroBar } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Props {
  selectedDate: string;
}

export const DailyOverview: React.FC<Props> = ({ selectedDate }) => {
  const { colors } = useThemeStore();
  const { getDayLog } = useNutritionStore();
  const { user } = useAuthStore();
  const dayLog = getDayLog(selectedDate);

  const { totalCalories, totalProtein, totalFats, totalCarbs } = useMemo(() => ({
    totalCalories: dayLog.meals.reduce((s, m) => s + m.totalCalories, 0),
    totalProtein: dayLog.meals.reduce((s, m) => s + m.totalProtein, 0),
    totalFats: dayLog.meals.reduce((s, m) => s + m.totalFats, 0),
    totalCarbs: dayLog.meals.reduce((s, m) => s + m.totalCarbs, 0),
  }), [dayLog.meals]);

  const remaining = dayLog.targetCalories - totalCalories;
  const isGain = user?.goal === 'muscle_gain' || user?.goal === 'MUSCLE_GAIN' || user?.goal === 'strength' || user?.goal === 'STRENGTH';

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ProgressRing
          progress={dayLog.targetCalories > 0 ? totalCalories / dayLog.targetCalories : 0}
          size={110}
          strokeWidth={10}
          value={`${totalCalories}`}
          label="ккал"
        />
        <View style={{ flex: 1, marginLeft: spacing.xl }}>
          <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
            {remaining > 0 ? (
              <>Осталось: <Text style={[typography.bodySemibold, { color: colors.success }]}>{remaining} ккал</Text></>
            ) : (
              <>{isGain ? 'Профицит: ' : 'Превышение: '}<Text style={[typography.bodySemibold, { color: isGain ? colors.success : colors.error }]}>+{Math.abs(remaining)} ккал</Text></>
            )}
          </Text>
          <MacroBar label="Белки" current={totalProtein} target={dayLog.targetProtein} color={colors.protein} />
          <MacroBar label="Жиры" current={totalFats} target={dayLog.targetFats} color={colors.fats} />
          <MacroBar label="Углеводы" current={totalCarbs} target={dayLog.targetCarbs} color={colors.carbs} />
        </View>
      </View>
    </Card>
  );
};
