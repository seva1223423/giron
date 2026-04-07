import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак', emoji: '🌅' },
  { key: 'lunch', label: 'Обед', emoji: '☀️' },
  { key: 'dinner', label: 'Ужин', emoji: '🌙' },
  { key: 'snack', label: 'Перекус', emoji: '🍎' },
] as const;

type MealTypeKey = typeof MEAL_TYPES[number]['key'];

interface Props {
  mealType: MealTypeKey;
  selectedDate: string;
  navigation: any;
  onPhotoScan: () => void;
}

export const MealSection: React.FC<Props> = ({ mealType, selectedDate, navigation, onPhotoScan }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { getDayLog, removeMeal } = useNutritionStore();
  const dayLog = getDayLog(selectedDate);
  const meals = dayLog.meals.filter((m) => m.type === mealType);
  const typeCalories = meals.reduce((s, m) => s + m.totalCalories, 0);
  const meta = MEAL_TYPES.find((t) => t.key === mealType)!;

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.header}>
        <Text style={[typography.h4, { color: colors.text }]}>{meta.emoji} {meta.label}</Text>
        <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>{typeCalories} ккал</Text>
      </View>

      {meals.length > 0 ? (
        meals.map((meal) => (
          <View key={meal.id} style={[styles.mealItem, { borderTopColor: colors.divider }]}>
            {meal.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{item.name}</Text>
                <Text style={[typography.small, { color: colors.textSecondary }]}>{item.calories} ккал</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => { haptic.light(); removeMeal(selectedDate, meal.id); }} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
              <Text style={[typography.caption, { color: colors.error }]}>Удалить</Text>
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.sm }]}>Пока ничего не добавлено</Text>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <TouchableOpacity onPress={() => navigation.navigate('ManualFoodAdd', { mealType, date: selectedDate })}>
          <Text style={[typography.smallMedium, { color: colors.primary }]}>+ Добавить</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onPhotoScan}>
          <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>📸 Фото</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealItem: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
});

export { MEAL_TYPES };
