import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../store';
import { Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import type { Meal, NutritionItem } from '../../types';
import { scheduleNutritionSummaryReminder } from '../../services/notificationService';
import { FoodSearchTab, CustomFoodTab } from './manual';
import type { CustomFoodState } from './manual';
import type { FoodItem } from './manual/foodData';

const MEAL_NAMES: Record<string, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };

export const ManualFoodAddScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const haptic = useHaptic();
  const mealType = route.params?.mealType || 'snack';
  const routeDate = route.params?.date as string | undefined;
  const { colors } = useThemeStore();
  const { addMeal, dailyLog, saveFoodItem } = useNutritionStore();

  const today = routeDate ?? new Date().toISOString().split('T')[0];
  const [tab, setTab] = useState<'search' | 'custom'>('search');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [weightGrams, setWeightGrams] = useState('100');
  const [custom, setCustom] = useState<CustomFoodState>({ name: '', calories: '', protein: '', fats: '', carbs: '' });

  const computedNutrition = useMemo(() => {
    if (!selectedFood) return null;
    const factor = (parseFloat(weightGrams) || 100) / 100;
    return {
      calories: Math.round(selectedFood.calories * factor),
      protein: Math.round(selectedFood.protein * factor * 10) / 10,
      fats: Math.round(selectedFood.fats * factor * 10) / 10,
      carbs: Math.round(selectedFood.carbs * factor * 10) / 10,
    };
  }, [selectedFood, weightGrams]);

  const handleAdd = () => {
    haptic.medium();
    let item: NutritionItem;
    if (tab === 'search' && selectedFood && computedNutrition) {
      item = { id: `item-${Date.now()}`, name: `${selectedFood.name} (${weightGrams}г)`, ...computedNutrition, weightGrams: parseFloat(weightGrams) || 100 };
    } else if (tab === 'custom') {
      if (!custom.name.trim()) { Alert.alert('Укажи название продукта'); return; }
      item = { id: `item-${Date.now()}`, name: custom.name.trim(), calories: parseInt(custom.calories) || 0, protein: parseFloat(custom.protein) || 0, fats: parseFloat(custom.fats) || 0, carbs: parseFloat(custom.carbs) || 0, weightGrams: 100 };
    } else {
      Alert.alert('Выбери продукт из списка или введи данные вручную');
      return;
    }
    const meal: Meal = { id: `meal-${Date.now()}`, type: mealType, items: [item], totalCalories: item.calories, totalProtein: item.protein, totalFats: item.fats, totalCarbs: item.carbs, createdAt: new Date().toISOString() };
    addMeal(today, meal);
    haptic.success();
    const todayStr = new Date().toISOString().split('T')[0];
    if (today === todayStr) {
      const dayLog = dailyLog[today];
      const alreadyEaten = dayLog?.meals.reduce((s, m) => s + m.totalCalories, 0) ?? 0;
      const alreadyProtein = dayLog?.meals.reduce((s, m) => s + m.totalProtein, 0) ?? 0;
      scheduleNutritionSummaryReminder(
        (dayLog?.targetCalories || 2000) > 0 ? (alreadyEaten + item.calories) / (dayLog?.targetCalories || 2000) : 0,
        (dayLog?.targetProtein || 150) > 0 ? (alreadyProtein + item.protein) / (dayLog?.targetProtein || 150) : 0,
      ).catch(() => {});
    }
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>Добавить в {MEAL_NAMES[mealType] || mealType}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(['search', 'custom'] as const).map((t) => (
          <TouchableOpacity key={t} onPress={() => { haptic.selection(); setTab(t); }} style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}>
            <Text style={[typography.smallMedium, { color: tab === t ? colors.primary : colors.textSecondary }]}>
              {t === 'search' ? '🔍 База продуктов' : '✏️ Вручную'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'search' && (
          <FoodSearchTab
            selectedFood={selectedFood}
            onSelectFood={setSelectedFood}
            weightGrams={weightGrams}
            onWeightChange={setWeightGrams}
            computedNutrition={computedNutrition}
          />
        )}
        {tab === 'custom' && (
          <CustomFoodTab state={custom} onChange={(field, value) => setCustom((prev) => ({ ...prev, [field]: value }))} />
        )}

        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl, marginBottom: spacing.huge }}>
          {tab === 'custom' && custom.name.trim() !== '' && (
            <TouchableOpacity
              onPress={() => {
                haptic.success();
                saveFoodItem({ id: `saved-${custom.name.trim().replace(/\s/g, '-').toLowerCase()}-${Date.now()}`, name: custom.name.trim(), calories: parseInt(custom.calories) || 0, protein: parseFloat(custom.protein) || 0, fats: parseFloat(custom.fats) || 0, carbs: parseFloat(custom.carbs) || 0, weightGrams: 100 });
                Alert.alert('Сохранено ⭐', `${custom.name.trim()} добавлен в быстрые продукты`);
              }}
              style={[styles.saveBtnLg, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}
            >
              <Text style={[typography.smallMedium, { color: colors.warning }]}>⭐</Text>
            </TouchableOpacity>
          )}
          <Button title="Добавить" onPress={handleAdd} fullWidth size="lg" style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  saveBtnLg: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
});
