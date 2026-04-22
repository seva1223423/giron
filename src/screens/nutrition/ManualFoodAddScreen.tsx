import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeStore, useNutritionStore } from '../../store';
import { Button } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import type { Meal, NutritionItem } from '../../types';
import { scheduleNutritionSummaryReminder, scheduleProteinReminder } from '../../services/notificationService';
import { FoodSearchTab, CustomFoodTab } from './manual';
import type { CustomFoodState } from './manual';
import type { FoodItem } from './manual/foodData';
import { localDateStr } from '../../utils/date';

const MEAL_NAMES: Record<string, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус' };

export const ManualFoodAddScreen: React.FC<{ route: any; navigation: any }> = ({ route, navigation }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const mealType = route.params?.mealType || 'snack';
  const routeDate = route.params?.date as string | undefined;
  const { colors } = useThemeStore();
  const { addMeal, dailyLog, saveFoodItem } = useNutritionStore();

  const today = routeDate ?? localDateStr(new Date());
  const [tab, setTab] = useState<'search' | 'custom'>('search');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [weightGrams, setWeightGrams] = useState('100');
  const [custom, setCustom] = useState<CustomFoodState>({ name: '', calories: '', protein: '', fats: '', carbs: '' });
  const [savedCustomConfirm, setSavedCustomConfirm] = useState(false);

  const computedNutrition = useMemo(() => {
    if (!selectedFood) return null;
    const factor = (parseFloat(weightGrams.replace(',', '.')) || 100) / 100;
    return {
      calories: Math.round(selectedFood.calories * factor),
      protein: Math.round(selectedFood.protein * factor * 10) / 10,
      fats: Math.round(selectedFood.fats * factor * 10) / 10,
      carbs: Math.round(selectedFood.carbs * factor * 10) / 10,
    };
  }, [selectedFood, weightGrams]);

  const handleAdd = () => {
    haptic.medium();
    const ts = Date.now();
    const rid = Math.random().toString(36).slice(2, 7);
    // Sanity caps — anything above these is almost certainly a typo. Without them
    // a single slip on the numpad (e.g. 99999 cal) trashes the daily totals and
    // every dependent visualization for that day.
    const MAX_CALORIES = 10000;
    const MAX_PROTEIN_G = 500;
    const MAX_FATS_G = 500;
    const MAX_CARBS_G = 1000;
    const MAX_WEIGHT_G = 5000;
    let item: NutritionItem;
    if (tab === 'search' && selectedFood && computedNutrition) {
      const parsedW = Math.max(1, Math.round(parseFloat(weightGrams.replace(',', '.')) || 100));
      if (parsedW > MAX_WEIGHT_G) {
        Alert.alert('Слишком большой вес', `Вес порции не может быть больше ${MAX_WEIGHT_G} г.`);
        return;
      }
      item = { id: `item-${ts}-${rid}`, name: `${selectedFood.name} (${parsedW}г)`, ...computedNutrition, weightGrams: parsedW };
    } else if (tab === 'custom') {
      if (!custom.name.trim()) { Alert.alert('Укажи название продукта'); return; }
      const parsedCal = Math.round(parseFloat(custom.calories.replace(',', '.')) || 0);
      if (!custom.calories.trim() || isNaN(parsedCal) || parsedCal <= 0) { Alert.alert('Укажи калорийность (больше 0)'); return; }
      if (parsedCal > MAX_CALORIES) {
        Alert.alert('Слишком много калорий', `Калорийность не может быть больше ${MAX_CALORIES} ккал за одну порцию. Проверь значение.`);
        return;
      }
      const protein = Math.round(Math.max(0, parseFloat(custom.protein.replace(',', '.')) || 0) * 10) / 10;
      const fats = Math.round(Math.max(0, parseFloat(custom.fats.replace(',', '.')) || 0) * 10) / 10;
      const carbs = Math.round(Math.max(0, parseFloat(custom.carbs.replace(',', '.')) || 0) * 10) / 10;
      if (protein > MAX_PROTEIN_G || fats > MAX_FATS_G || carbs > MAX_CARBS_G) {
        Alert.alert(
          'Слишком большие значения',
          `Белки ≤ ${MAX_PROTEIN_G} г, жиры ≤ ${MAX_FATS_G} г, углеводы ≤ ${MAX_CARBS_G} г. Проверь данные.`,
        );
        return;
      }
      item = { id: `item-${ts}-${rid}`, name: custom.name.trim(), calories: parsedCal, protein, fats, carbs, weightGrams: 100 };
    } else {
      Alert.alert('Выбери продукт из списка или введи данные вручную');
      return;
    }
    const meal: Meal = { id: `meal-${ts}-${rid}`, type: mealType, items: [item], totalCalories: item.calories, totalProtein: item.protein, totalFats: item.fats, totalCarbs: item.carbs, createdAt: new Date().toISOString() };
    addMeal(today, meal);
    haptic.success();
    const todayStr = localDateStr(new Date());
    if (today === todayStr) {
      const dayLog = dailyLog[today];
      const alreadyEaten = dayLog?.meals.reduce((s, m) => s + m.totalCalories, 0) ?? 0;
      const alreadyProtein = dayLog?.meals.reduce((s, m) => s + m.totalProtein, 0) ?? 0;
      const protTarget = dayLog?.targetProtein || 150;
      const totalProtein = alreadyProtein + item.protein;
      scheduleNutritionSummaryReminder(
        (dayLog?.targetCalories || 2000) > 0 ? (alreadyEaten + item.calories) / (dayLog?.targetCalories || 2000) : 0,
        protTarget > 0 ? totalProtein / protTarget : 0,
      ).catch(() => {});
      scheduleProteinReminder(totalProtein, protTarget).catch(() => {});
    }
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity
          onPress={() => { haptic.light(); navigation.goBack(); }}
          accessibilityLabel="Назад"
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text, flex: 1, textAlign: 'center' }]} numberOfLines={1}>Добавить в {MEAL_NAMES[mealType] || mealType}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {(['search', 'custom'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => { haptic.selection(); setTab(t); }}
            style={[styles.tab, tab === t && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            accessibilityLabel={t === 'search' ? 'Вкладка: поиск по базе продуктов' : 'Вкладка: ввести данные вручную'}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[typography.smallMedium, { color: tab === t ? colors.primary : colors.textSecondary }]}>
              {t === 'search' ? 'База продуктов' : 'Вручную'}
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
          {tab === 'custom' && custom.name.trim() !== '' && (parseFloat(custom.calories.replace(',', '.')) || 0) > 0 && (
            <TouchableOpacity
              onPress={() => {
                haptic.success();
                saveFoodItem({ id: `saved-${custom.name.trim().replace(/\s/g, '-').toLowerCase()}-${Date.now()}`, name: custom.name.trim(), calories: Math.max(0, Math.round(parseFloat(custom.calories.replace(',', '.')) || 0)), protein: Math.round(Math.max(0, parseFloat(custom.protein.replace(',', '.')) || 0) * 10) / 10, fats: Math.round(Math.max(0, parseFloat(custom.fats.replace(',', '.')) || 0) * 10) / 10, carbs: Math.round(Math.max(0, parseFloat(custom.carbs.replace(',', '.')) || 0) * 10) / 10, weightGrams: 100 });
                setSavedCustomConfirm(true);
                setTimeout(() => setSavedCustomConfirm(false), 2000);
              }}
              disabled={savedCustomConfirm}
              style={[styles.saveBtnLg, { backgroundColor: savedCustomConfirm ? colors.success + '20' : colors.warning + '20', borderColor: savedCustomConfirm ? colors.success : colors.warning }]}
              accessibilityLabel={savedCustomConfirm ? 'Сохранено в свои продукты' : 'Сохранить как пресет в свои продукты'}
              accessibilityHint="Добавит в список сохранённых для быстрого повторного использования"
              accessibilityRole="button"
              accessibilityState={{ disabled: savedCustomConfirm }}
            >
              <Text style={[typography.smallMedium, { color: savedCustomConfirm ? colors.success : colors.primary, fontWeight: '700' }]}>{savedCustomConfirm ? '✓ Сохранён' : '+ В свои'}</Text>
            </TouchableOpacity>
          )}
          <Button
            title="Добавить"
            onPress={handleAdd}
            fullWidth
            size="lg"
            style={{ flex: 1 }}
            accessibilityLabel={`Добавить в ${(MEAL_NAMES[mealType] || mealType).toLowerCase()}`}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  tab: { paddingVertical: spacing.md, marginRight: spacing.xl },
  content: { padding: spacing.xl, paddingBottom: spacing.huge },
  saveBtnLg: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
});
