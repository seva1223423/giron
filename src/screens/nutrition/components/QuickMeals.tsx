import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { todayDateStr } from '../../../utils/date';

const QUICK_MEALS = [
  { name: 'Овсянка с бананом', abbr: 'ОВ', type: 'breakfast', cal: 350, protein: 12, fats: 8, carbs: 55, weight: 300 },
  { name: 'Яичница 3 яйца', abbr: 'ЯИ', type: 'breakfast', cal: 280, protein: 21, fats: 20, carbs: 2, weight: 180 },
  { name: 'Гречка с курицей', abbr: 'ГК', type: 'lunch', cal: 450, protein: 40, fats: 10, carbs: 50, weight: 350 },
  { name: 'Рис с рыбой', abbr: 'РР', type: 'lunch', cal: 420, protein: 35, fats: 8, carbs: 55, weight: 350 },
  { name: 'Творог 5%', abbr: 'ТВ', type: 'snack', cal: 230, protein: 34, fats: 10, carbs: 6, weight: 200 },
  { name: 'Протеиновый коктейль', abbr: 'ПК', type: 'snack', cal: 150, protein: 30, fats: 2, carbs: 5, weight: 300 },
  { name: 'Куриная грудка + овощи', abbr: 'КО', type: 'dinner', cal: 350, protein: 45, fats: 8, carbs: 15, weight: 350 },
  { name: 'Бутерброд с сыром', abbr: 'БС', type: 'snack', cal: 280, protein: 12, fats: 15, carbs: 25, weight: 120 },
];

type QuickMealItem = typeof QUICK_MEALS[0];

export const QuickMeals: React.FC = () => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { addMeal, dailyLog } = useNutritionStore();

  // Get last 5 unique foods from recent meals (across all days)
  const recentFoods = useMemo(() => {
    const allMeals: { name: string; type: string; cal: number; protein: number; fats: number; carbs: number; weight: number }[] = [];
    const seen = new Set<string>();
    // Sort dates descending
    const dates = Object.keys(dailyLog).sort((a, b) => b.localeCompare(a));
    for (const date of dates) {
      const log = dailyLog[date];
      if (!log?.meals) continue;
      // Sort meals by createdAt descending
      const sorted = [...log.meals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      for (const meal of sorted) {
        for (const item of meal.items) {
          const cleanName = item.name.replace(/\s*\(\d+г\)$/, '').trim();
          const key = cleanName.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          allMeals.push({
            name: cleanName,
            type: meal.type,
            cal: item.calories,
            protein: item.protein,
            fats: item.fats,
            carbs: item.carbs,
            weight: item.weightGrams || 100,
          });
          if (allMeals.length >= 5) break;
        }
        if (allMeals.length >= 5) break;
      }
      if (allMeals.length >= 5) break;
    }
    return allMeals;
  }, [dailyLog]);

  const handleQuickAdd = (meal: QuickMealItem | { name: string; type: string; cal: number; protein: number; fats: number; carbs: number; weight: number }) => {
    haptic.success();
    const today = todayDateStr();
    addMeal(today, {
      id: `meal-${Date.now()}`,
      type: meal.type as 'breakfast' | 'lunch' | 'dinner' | 'snack',
      photoUrl: undefined,
      totalCalories: meal.cal,
      totalProtein: meal.protein,
      totalFats: meal.fats,
      totalCarbs: meal.carbs,
      items: [{
        id: `item-${Date.now()}`,
        name: meal.name,
        calories: meal.cal,
        protein: meal.protein,
        fats: meal.fats,
        carbs: meal.carbs,
        weightGrams: meal.weight,
      }],
      createdAt: new Date().toISOString(),
    });
  };

  const renderMealCard = (meal: QuickMealItem | typeof recentFoods[0], index: number, isRecent?: boolean) => (
    <View
      key={`${isRecent ? 'recent' : 'quick'}-${index}`}
      style={[styles.cardWrapper]}
    >
      <TouchableOpacity
        onPress={() => handleQuickAdd(meal)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: isRecent ? colors.primary + '40' : colors.border }]}
      >
        <View style={[styles.abbr, { backgroundColor: (isRecent ? colors.accent : colors.primary) + '15', borderWidth: 1, borderColor: (isRecent ? colors.accent : colors.primary) + '35' }]}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: isRecent ? colors.accent : colors.primary }}>
            {'abbr' in meal ? meal.abbr : meal.name.substring(0, 2).toUpperCase()}
          </Text>
        </View>
        <Text style={[typography.captionMedium, { color: colors.text, textAlign: 'center' }]} numberOfLines={2}>{meal.name}</Text>
        <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 1 }]}>{meal.cal} ккал</Text>
      </TouchableOpacity>
      {/* Quick + button */}
      <TouchableOpacity
        onPress={() => handleQuickAdd(meal)}
        style={[styles.plusBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>+1</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {/* Recent foods section */}
      {recentFoods.length > 0 && (
        <View style={{ marginBottom: spacing.md }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Недавние</Text>
          <View style={styles.grid}>
            {recentFoods.map((food, i) => renderMealCard(food, i, true))}
          </View>
        </View>
      )}

      {/* Quick meals section */}
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Быстрое добавление</Text>
      <View style={styles.grid}>
        {QUICK_MEALS.map((meal, i) => renderMealCard(meal, i))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardWrapper: {
    width: '23%',
    minWidth: 80,
    flexGrow: 1,
    maxWidth: '25%',
  },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    alignItems: 'center',
    minHeight: 90,
  },
  abbr: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  plusBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
