import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { FOOD_DB, FoodItem } from './foodData';

interface Props {
  selectedFood: FoodItem | null;
  onSelectFood: (food: FoodItem) => void;
  weightGrams: string;
  onWeightChange: (w: string) => void;
  computedNutrition: { calories: number; protein: number; fats: number; carbs: number } | null;
}

export const FoodSearchTab: React.FC<Props> = ({ selectedFood, onSelectFood, weightGrams, onWeightChange, computedNutrition }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { dailyLog, saveFoodItem } = useNutritionStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFoods = useMemo(() => {
    if (!searchQuery.trim()) return FOOD_DB.slice(0, 12);
    return FOOD_DB.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery]);

  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const result: FoodItem[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const log = dailyLog[d.toISOString().split('T')[0]];
      if (!log) continue;
      for (const meal of log.meals) {
        for (const item of meal.items) {
          const grams = item.weightGrams || 100;
          const baseName = item.name.replace(/\s*\(\d+г\)$/, '').trim();
          if (seen.has(baseName)) continue;
          seen.add(baseName);
          const factor = 100 / grams;
          result.push({ name: baseName, calories: Math.round(item.calories * factor), protein: Math.round(item.protein * factor * 10) / 10, fats: Math.round(item.fats * factor * 10) / 10, carbs: Math.round(item.carbs * factor * 10) / 10 });
          if (result.length >= 10) break;
        }
        if (result.length >= 10) break;
      }
      if (result.length >= 10) break;
    }
    return result;
  }, [dailyLog]);

  return (
    <>
      {recentFoods.length > 0 && (
        <View style={{ marginBottom: spacing.md }}>
          <Text style={[typography.captionMedium, { color: colors.textSecondary, marginBottom: spacing.sm }]}>🕒 Недавно добавлено</Text>
          <FlatList
            data={recentFoods}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.name}
            contentContainerStyle={{ gap: spacing.sm }}
            renderItem={({ item }) => {
              const isSelected = selectedFood?.name === item.name;
              return (
                <TouchableOpacity onPress={() => { haptic.selection(); onSelectFood(item); onWeightChange('100'); }} style={[styles.recentChip, { backgroundColor: isSelected ? colors.primary : colors.surface, borderColor: isSelected ? colors.primary : colors.border }]}>
                  <Text style={[typography.small, { color: isSelected ? '#fff' : colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[typography.caption, { color: isSelected ? 'rgba(255,255,255,0.75)' : colors.textTertiary }]}>{item.calories} ккал/100г</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      <TextInput
        style={[styles.searchInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Найти продукт..."
        placeholderTextColor={colors.inputPlaceholder}
      />

      {filteredFoods.map((food) => {
        const isSelected = selectedFood?.name === food.name;
        return (
          <TouchableOpacity key={food.name} onPress={() => { haptic.selection(); onSelectFood(food); }}>
            <Card style={{ marginBottom: spacing.sm, borderWidth: isSelected ? 1.5 : 0, borderColor: isSelected ? colors.primary : 'transparent' }} padding={spacing.md}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[typography.bodySemibold, { color: isSelected ? colors.primary : colors.text }]}>{food.name}</Text>
                <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>{food.calories} ккал/100г</Text>
              </View>
              <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>Б: {food.protein}г  Ж: {food.fats}г  У: {food.carbs}г</Text>
            </Card>
          </TouchableOpacity>
        );
      })}

      {selectedFood && (
        <Card style={{ marginTop: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[typography.captionMedium, { color: colors.primary }]}>{selectedFood.name}</Text>
            <TouchableOpacity
              onPress={() => {
                haptic.success();
                saveFoodItem({ id: `saved-${selectedFood.name.replace(/\s/g, '-').toLowerCase()}`, ...selectedFood, weightGrams: 100 });
                Alert.alert('Сохранено ⭐', `${selectedFood.name} добавлен в быстрые продукты`);
              }}
              style={[styles.saveBtn, { backgroundColor: colors.warning + '20', borderColor: colors.warning }]}
            >
              <Text style={[typography.caption, { color: colors.warning }]}>⭐ Сохранить</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
            <Text style={[typography.body, { color: colors.text }]}>Порция:</Text>
            <TextInput
              style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={weightGrams}
              onChangeText={onWeightChange}
              keyboardType="numeric"
            />
            <Text style={[typography.body, { color: colors.textSecondary }]}>г</Text>
          </View>
          {computedNutrition && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {[
                { label: 'ккал', value: computedNutrition.calories, color: colors.calories },
                { label: 'белки', value: computedNutrition.protein, color: colors.protein },
                { label: 'жиры', value: computedNutrition.fats, color: colors.fats },
                { label: 'углеводы', value: computedNutrition.carbs, color: colors.carbs },
              ].map(({ label, value, color }) => (
                <View key={label} style={{ alignItems: 'center' }}>
                  <Text style={[typography.numberSmall, { color, fontSize: 20 }]}>{value}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  searchInput: { height: 44, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 16, marginBottom: spacing.md },
  weightInput: { width: 80, height: 40, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  recentChip: { borderRadius: borderRadius.lg, borderWidth: 1.5, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center', minWidth: 110, maxWidth: 150 },
  saveBtn: { borderWidth: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
});
