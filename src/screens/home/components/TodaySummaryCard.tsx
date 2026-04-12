import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore, useNutritionStore, useWorkoutStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { todayDateStr, localDateStr } from '../../../utils/date';

interface Props {
  navigation: any;
}

export const TodaySummaryCard: React.FC<Props> = ({ navigation }) => {
  const { colors } = useThemeStore();
  const { getDayLog } = useNutritionStore();
  const { workoutHistory } = useWorkoutStore();

  const today = todayDateStr();
  const dayLog = getDayLog(today);

  const totalCal = dayLog.meals.reduce((s, m) => s + m.totalCalories, 0);
  const calTarget = dayLog.targetCalories || 2000;
  const calPct = calTarget > 0 ? Math.min(totalCal / calTarget, 1) : 0;

  const waterPct = dayLog.waterTargetMl ? Math.min(dayLog.waterMl / dayLog.waterTargetMl, 1) : 0;

  const todayWorkout = workoutHistory.find((w) => {
    if (!w.completedAt) return false;
    return localDateStr(new Date(w.completedAt)) === today;
  });

  const items = [
    {
      key: 'cal',
      label: 'Питание',
      value: totalCal > 0 ? `${totalCal} ккал` : 'не записано',
      pct: calPct,
      color: colors.calories,
      onPress: () => navigation.navigate('NutritionTab'),
    },
    {
      key: 'water',
      label: 'Вода',
      value: dayLog.waterMl >= 1000 ? `${(dayLog.waterMl / 1000).toFixed(1)}л` : `${dayLog.waterMl}мл`,
      pct: waterPct,
      color: colors.info,
      onPress: () => navigation.navigate('NutritionTab'),
    },
    {
      key: 'workout',
      label: 'Тренировка',
      value: todayWorkout ? todayWorkout.name : 'не было',
      pct: todayWorkout ? 1 : 0,
      color: colors.success,
      onPress: () => navigation.navigate('WorkoutsTab'),
    },
  ];

  return (
    <View style={{
      flexDirection: 'row', gap: spacing.sm,
      marginBottom: spacing.lg, paddingHorizontal: 0,
    }}>
      {items.map((item) => (
        <TouchableOpacity
          key={item.key}
          onPress={item.onPress}
          activeOpacity={0.75}
          style={{
            flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
            borderRadius: borderRadius.md, backgroundColor: colors.surface,
            borderWidth: 1, borderColor: colors.border, alignItems: 'center',
          }}
        >
          <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: 2 }]}>{item.label}</Text>
          {/* Mini bar */}
          <View style={{ width: '100%', height: 3, borderRadius: 2, backgroundColor: colors.border, marginBottom: 4, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${item.pct * 100}%`, backgroundColor: item.color, borderRadius: 2 }} />
          </View>
          <Text style={{ fontSize: 11, fontWeight: '700', color: item.pct === 1 ? item.color : colors.textSecondary, textAlign: 'center' }} numberOfLines={1}>
            {item.value}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};
