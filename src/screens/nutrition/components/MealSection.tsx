import React, { useState, useMemo } from 'react';
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

const formatTime = (isoStr: string): string => {
  try {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return ''; }
};

export const MealSection: React.FC<Props> = ({ mealType, selectedDate, navigation, onPhotoScan }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { getDayLog, removeMeal, removeMealItem, updateMealItem } = useNutritionStore();
  const dayLog = getDayLog(selectedDate);
  const meals = dayLog.meals.filter((m) => m.type === mealType);
  const typeCalories = meals.reduce((s, m) => s + m.totalCalories, 0);
  const meta = MEAL_TYPES.find((t) => t.key === mealType)!;

  // Total day calories for percentage calculation
  const totalDayCalories = useMemo(() =>
    dayLog.meals.reduce((s, m) => s + m.totalCalories, 0),
  [dayLog.meals]);

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

  const handleDeleteItem = (mealId: string, itemId: string, itemName: string) => {
    haptic.light();
    removeMealItem(selectedDate, mealId, itemId);
  };

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={styles.header}>
        <Text style={[typography.h4, { color: colors.text }]} numberOfLines={1}>{meta.label}</Text>
        <Text style={[typography.smallMedium, { color: colors.textSecondary }]} numberOfLines={1}>{typeCalories} ккал</Text>
      </View>

      {meals.length > 0 ? (
        meals.map((meal) => {
          const mealTime = formatTime(meal.createdAt);
          return (
            <View key={meal.id} style={[styles.mealItem, { borderTopColor: colors.divider }]}>
              {/* Meal time header */}
              {mealTime ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                  <Text style={[typography.caption, { color: colors.textTertiary, flex: 1, marginRight: 8 }]} numberOfLines={1}>
                    {meta.label} · {mealTime}
                  </Text>
                  <TouchableOpacity onPress={() => { haptic.warning(); removeMeal(selectedDate, meal.id); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[typography.caption, { color: colors.error }]}>Удалить всё</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: spacing.xs }}>
                  <TouchableOpacity onPress={() => { haptic.warning(); removeMeal(selectedDate, meal.id); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[typography.caption, { color: colors.error }]}>Удалить всё</Text>
                  </TouchableOpacity>
                </View>
              )}
              {meal.items.map((item) => {
                const itemPct = totalDayCalories > 0 ? Math.round((item.calories / totalDayCalories) * 100) : 0;
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <Text style={[typography.body, { color: colors.text }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
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
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[typography.small, { color: colors.textSecondary }]} numberOfLines={1}>
                          {item.calories} ккал
                        </Text>
                        {itemPct > 0 && (
                          <View style={{ backgroundColor: colors.calories + '15', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1, borderColor: colors.calories + '35' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.calories }}>{itemPct}%</Text>
                          </View>
                        )}
                      </View>
                      {/* Delete individual item button */}
                      <TouchableOpacity
                        onPress={() => handleDeleteItem(meal.id, item.id, item.name)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ fontSize: 14, color: colors.error, fontWeight: '600' }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })
      ) : (
        <Text style={[typography.small, { color: colors.textTertiary, marginTop: spacing.sm }]}>Пока ничего не добавлено</Text>
      )}

      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
        <TouchableOpacity
          onPress={() => { haptic.selection(); navigation.navigate('ManualFoodAdd', { mealType, date: selectedDate }); }}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
        >
          <Text style={[typography.smallMedium, { color: colors.primary }]}>+ Добавить</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { haptic.selection(); onPhotoScan(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        >
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
