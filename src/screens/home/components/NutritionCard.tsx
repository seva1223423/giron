import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, ProgressRing, MacroBar } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface DayLog {
  meals: Array<{ totalCalories: number; totalProtein: number; totalFats: number; totalCarbs: number }>;
  targetCalories: number;
  targetProtein: number;
  targetFats: number;
  targetCarbs: number;
}

interface Props {
  dayLog: DayLog;
  navigation: any;
}

export const NutritionCard: React.FC<Props> = ({ dayLog, navigation }) => {
  const { colors } = useThemeStore();

  const { todayCalories, todayProtein, todayFats, todayCarbs } = useMemo(() => ({
    todayCalories: dayLog.meals.reduce((s, m) => s + m.totalCalories, 0),
    todayProtein: dayLog.meals.reduce((s, m) => s + m.totalProtein, 0),
    todayFats: dayLog.meals.reduce((s, m) => s + m.totalFats, 0),
    todayCarbs: dayLog.meals.reduce((s, m) => s + m.totalCarbs, 0),
  }), [dayLog.meals]);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <Text style={[typography.h4, { color: colors.text }]}>Питание сегодня</Text>
        <TouchableOpacity onPress={() => navigation.navigate('NutritionTab')}>
          <Text style={[typography.smallMedium, { color: colors.primary }]}>Подробнее</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ProgressRing
          progress={dayLog.targetCalories > 0 ? todayCalories / dayLog.targetCalories : 0}
          size={90}
          strokeWidth={8}
          value={`${todayCalories}`}
          label="ккал"
        />
        <View style={{ flex: 1, marginLeft: spacing.xl }}>
          <MacroBar label="Белки" current={todayProtein} target={dayLog.targetProtein} color={colors.protein} />
          <MacroBar label="Жиры" current={todayFats} target={dayLog.targetFats} color={colors.fats} />
          <MacroBar label="Углеводы" current={todayCarbs} target={dayLog.targetCarbs} color={colors.carbs} />
        </View>
      </View>
    </Card>
  );
};
