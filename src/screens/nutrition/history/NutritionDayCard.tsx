import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { DailyNutrition } from '../../../types';
import { localDateStr } from '../../../utils/date';

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  const today = localDateStr(new Date());
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const yesterday = localDateStr(yest);
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterday) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
}

interface Props {
  date: string;
  log: DailyNutrition;
  isExpanded: boolean;
  onPress: () => void;
  animDelay?: number;
}

export const NutritionDayCard: React.FC<Props> = ({ date, log, isExpanded, onPress, animDelay = 0 }) => {
  const { colors } = useThemeStore();

  const totalCalories = log.meals.reduce((s, m) => s + m.totalCalories, 0);
  const totalProtein = log.meals.reduce((s, m) => s + m.totalProtein, 0);
  const totalFats = log.meals.reduce((s, m) => s + m.totalFats, 0);
  const totalCarbs = log.meals.reduce((s, m) => s + m.totalCarbs, 0);
  const calorieRatio = log.targetCalories > 0 ? totalCalories / log.targetCalories : 0;

  return (
    <FadeIn delay={animDelay}>
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        <Card style={{ marginBottom: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodySemibold, { color: colors.text }]}>{formatDate(date)}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {log.meals.length} приёмов пищи{log.waterMl > 0 ? ` • ${log.waterMl} мл воды` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[typography.numberSmall, { color: calorieRatio > 1.1 ? colors.error : calorieRatio > 0.9 ? colors.success : colors.primary, fontSize: 20 }]}>
                {totalCalories}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>ккал {isExpanded ? '▲' : '▼'}</Text>
            </View>
          </View>

          {/* Macro bar */}
          <View style={{ marginTop: spacing.sm }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surface, flexDirection: 'row', overflow: 'hidden', gap: 1 }}>
              {totalCalories > 0 && [
                { calories: totalProtein * 4, color: colors.protein },
                { calories: totalFats * 9, color: colors.fats },
                { calories: totalCarbs * 4, color: colors.carbs },
              ].map(({ calories, color }, idx) => (
                <View key={idx} style={{ height: '100%', width: `${(calories / totalCalories) * 100}%`, backgroundColor: color }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap' }}>
              <Text style={[typography.caption, { color: colors.protein, fontSize: 10 }]}>Б: {Math.round(totalProtein)}г</Text>
              <Text style={[typography.caption, { color: colors.fats, fontSize: 10 }]}>Ж: {Math.round(totalFats)}г</Text>
              <Text style={[typography.caption, { color: colors.carbs, fontSize: 10 }]}>У: {Math.round(totalCarbs)}г</Text>
            </View>
          </View>

          {/* Expanded: meal list */}
          {isExpanded && log.meals.length > 0 && (
            <View style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider }}>
              {log.meals.map((meal, mi) => (
                <View key={meal.id} style={[{ paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center' }, mi < log.meals.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
                  <Text style={[typography.small, { color: colors.textSecondary, width: 60 }]}>
                    {meal.type === 'breakfast' ? 'Завтрак' : meal.type === 'lunch' ? 'Обед' : meal.type === 'dinner' ? 'Ужин' : 'Перекус'}
                  </Text>
                  <Text style={[typography.small, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {meal.items.map((i) => i.name.replace(/\s*\(\d+(?:[.,]\d+)?г\)$/, '').trim()).join(', ')}
                  </Text>
                  <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>{meal.totalCalories} ккал</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </TouchableOpacity>
    </FadeIn>
  );
};
