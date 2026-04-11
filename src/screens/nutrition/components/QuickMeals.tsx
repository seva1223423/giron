import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
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

export const QuickMeals: React.FC = () => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { addMeal } = useNutritionStore();

  const handleQuickAdd = (meal: typeof QUICK_MEALS[0]) => {
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

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Быстрое добавление</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {QUICK_MEALS.map((meal, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => handleQuickAdd(meal)}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: borderRadius.lg,
              padding: spacing.md,
              width: 120,
              alignItems: 'center',
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs }}><Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{meal.abbr}</Text></View>
            <Text style={[typography.captionMedium, { color: colors.text, textAlign: 'center' }]} numberOfLines={2}>{meal.name}</Text>
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>{meal.cal} ккал</Text>
            <Text style={[typography.caption, { color: colors.primary, marginTop: 1 }]}>Б{meal.protein} Ж{meal.fats} У{meal.carbs}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};
