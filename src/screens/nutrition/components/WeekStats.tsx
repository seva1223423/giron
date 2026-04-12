import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const todayDate = () => new Date().toISOString().split('T')[0];

export const WeekStats: React.FC = () => {
  const { colors } = useThemeStore();
  const { dailyLog } = useNutritionStore();

  const weekStats = useMemo(() => {
    const days: { date: string; calories: number; protein: number; fats: number; carbs: number; target: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const log = dailyLog[dateStr];
      if (!log || log.meals.length === 0) continue;
      days.push({
        date: dateStr,
        calories: log.meals.reduce((s, m) => s + m.totalCalories, 0),
        protein: log.meals.reduce((s, m) => s + m.totalProtein, 0),
        fats: log.meals.reduce((s, m) => s + m.totalFats, 0),
        carbs: log.meals.reduce((s, m) => s + m.totalCarbs, 0),
        target: log.targetCalories,
      });
    }
    if (days.length === 0) return null;
    const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    return {
      daysLogged: days.length,
      avgCalories: avg(days.map((d) => d.calories)),
      avgProtein: avg(days.map((d) => d.protein)),
      avgFats: avg(days.map((d) => d.fats)),
      avgCarbs: avg(days.map((d) => d.carbs)),
      goalMet: days.filter((d) => d.calories <= d.target * 1.05 && d.calories >= d.target * 0.85).length,
      days,
    };
  }, [dailyLog]);

  if (!weekStats) return null;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <Text style={[typography.h4, { color: colors.text }]}>За 7 дней</Text>
        <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full }}>
          <Text style={[typography.caption, { color: colors.primary }]}>
            Цель выполнена {weekStats.goalMet}/{weekStats.daysLogged}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 56, marginBottom: spacing.md }}>
        {weekStats.days.map((d) => {
          const maxCal = Math.max(...weekStats.days.map((dd) => dd.calories), weekStats.days[0]?.target || 2000);
          const barH = Math.max(4, (d.calories / maxCal) * 44);
          const isGoalMet = d.calories <= d.target * 1.05 && d.calories >= d.target * 0.85;
          const dayLabel = new Date(d.date).toLocaleDateString('ru-RU', { weekday: 'short' }).slice(0, 2);
          return (
            <View key={d.date} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ width: '80%', height: barH, backgroundColor: isGoalMet ? colors.success : colors.primary, borderRadius: 3 }} />
              <Text style={[typography.small, { color: colors.textTertiary, fontSize: 9, marginTop: 3 }]}>{dayLabel}</Text>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {[
          { label: 'Ккал', value: weekStats.avgCalories, color: colors.primary },
          { label: 'Белки', value: `${weekStats.avgProtein}г`, color: colors.success },
          { label: 'Жиры', value: `${weekStats.avgFats}г`, color: colors.warning },
          { label: 'Углев.', value: `${weekStats.avgCarbs}г`, color: colors.accent },
        ].map(({ label, value, color }) => (
          <View key={label} style={{ alignItems: 'center', flex: 1 }}>
            <Text style={[typography.bodySemibold, { color }]} numberOfLines={1}>{value}</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>{label}/день</Text>
          </View>
        ))}
      </View>
    </Card>
  );
};
