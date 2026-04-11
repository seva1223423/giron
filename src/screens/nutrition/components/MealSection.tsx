import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { NutritionItem } from '../../../types';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Завтрак', emoji: 'З' },
  { key: 'lunch', label: 'Обед', emoji: 'О' },
  { key: 'dinner', label: 'Ужин', emoji: 'У' },
  { key: 'snack', label: 'Перекус', emoji: 'П' },
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
  const { getDayLog, removeMeal, updateMealItem } = useNutritionStore();
  const dayLog = getDayLog(selectedDate);
  const meals = dayLog.meals.filter((m) => m.type === mealType);
  const typeCalories = meals.reduce((s, m) => s + m.totalCalories, 0);
  const meta = MEAL_TYPES.find((t) => t.key === mealType)!;

  const [editingItem, setEditingItem] = useState<{ mealId: string; item: NutritionItem } | null>(null);

  const handleWeightEdit = (mealId: string, item: NutritionItem) => {
    if (!item.weightGrams) return;
    setEditingItem({ mealId, item });
  };

  const handleWeightChange = (mealId: string, item: NutritionItem, newWeightStr: string) => {
    const newWeight = parseInt(newWeightStr) || 0;
    if (newWeight <= 0 || !item.weightGrams) return;
    const ratio = newWeight / item.weightGrams;
    haptic.light();
    updateMealItem(selectedDate, mealId, item.id, {
      weightGrams: newWeight,
      calories: Math.round(item.calories * ratio),
      protein: Math.round(item.protein * ratio * 10) / 10,
      fats: Math.round(item.fats * ratio * 10) / 10,
      carbs: Math.round(item.carbs * ratio),
    });
    setEditingItem(null);
  };

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.header}>
        <Text style={[typography.h4, { color: colors.text }]}>{meta.label}</Text>
        <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>{typeCalories} ккал</Text>
      </View>

      {meals.length > 0 ? (
        meals.map((meal) => (
          <View key={meal.id} style={[styles.mealItem, { borderTopColor: colors.divider }]}>
            {meal.items.map((item) => (
              <View key={item.id}>
                <View style={styles.itemRow}>
                  <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{item.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    {item.weightGrams ? (
                      editingItem?.mealId === meal.id && editingItem?.item.id === item.id ? (
                        <TextInput
                          style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.primary, color: colors.text }]}
                          defaultValue={String(item.weightGrams)}
                          keyboardType="numeric"
                          autoFocus
                          selectTextOnFocus
                          onBlur={(e) => handleWeightChange(meal.id, item, (e.nativeEvent as any).text)}
                          onSubmitEditing={(e) => handleWeightChange(meal.id, item, (e.nativeEvent as any).text)}
                        />
                      ) : (
                        <TouchableOpacity onPress={() => handleWeightEdit(meal.id, item)}>
                          <Text style={[typography.caption, { color: colors.textSecondary }]}>{item.weightGrams}г</Text>
                        </TouchableOpacity>
                      )
                    ) : null}
                    <Text style={[typography.small, { color: colors.textSecondary }]}>{item.calories} ккал</Text>
                  </View>
                </View>
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
          <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>Фото</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealItem: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  weightInput: { width: 52, height: 26, borderRadius: borderRadius.sm, borderWidth: 1, paddingHorizontal: spacing.xs, textAlign: 'center', fontSize: 13, fontWeight: '600' },
});

export { MEAL_TYPES };
