import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { FOOD_DB, FoodItem } from './foodData';
import { localDateStr } from '../../../utils/date';

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
  const { dailyLog, saveFoodItem, savedFoods } = useNutritionStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [savedConfirm, setSavedConfirm] = useState(false);
  const savedFoodId = selectedFood ? `saved-${selectedFood.name.replace(/\s/g, '-').toLowerCase()}` : '';
  const isFoodAlreadySaved = !!selectedFood && savedFoods.some((f) => f.id === savedFoodId);
  const showSaved = isFoodAlreadySaved || savedConfirm;

  // Merge saved foods (from scanner) with FOOD_DB — saved foods appear first when matched
  const savedAsFoodItems = useMemo((): FoodItem[] =>
    savedFoods.map((f) => ({ name: f.name, calories: f.calories, protein: f.protein, fats: f.fats, carbs: f.carbs })),
  [savedFoods]);

  const filteredFoods = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const savedSlice = savedAsFoodItems.slice(0, 4);
    const savedNames = new Set(savedSlice.map((f) => f.name.toLowerCase()));
    if (!q) return [...savedSlice, ...FOOD_DB.filter((f) => !savedNames.has(f.name.toLowerCase())).slice(0, 8)];
    // Multi-word search: single phrase OR all words must appear (order-independent)
    const words = q.split(/\s+/).filter(Boolean);
    const matchName = (name: string) => {
      const n = name.toLowerCase();
      return n.includes(q) || (words.length > 1 && words.every((w) => n.includes(w)));
    };
    const fromSaved = savedAsFoodItems.filter((f) => matchName(f.name));
    const fromSavedNames = new Set(fromSaved.map((f) => f.name.toLowerCase()));
    const fromDB = FOOD_DB.filter((f) => matchName(f.name) && !fromSavedNames.has(f.name.toLowerCase()));
    return [...fromSaved, ...fromDB];
  }, [searchQuery, savedAsFoodItems]);

  const recentFoods = useMemo(() => {
    const seen = new Set<string>();
    const result: FoodItem[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const log = dailyLog[localDateStr(d)];
      if (!log) continue;
      for (const meal of log.meals) {
        for (const item of meal.items) {
          const grams = item.weightGrams || 100;
          const baseName = item.name.replace(/\s*\(\d+(?:[.,]\d+)?г\)$/, '').trim();
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
        accessibilityLabel="Поиск продукта в базе"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      {filteredFoods.length === 0 && searchQuery.trim().length > 0 ? (
        <Card style={{ marginBottom: spacing.sm, alignItems: 'center', paddingVertical: spacing.xl }}>
          <Text style={[typography.body, { color: colors.textSecondary }]}>Ничего не найдено</Text>
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
            Попробуй другой запрос или введи КБЖУ вручную
          </Text>
        </Card>
      ) : (
        filteredFoods.map((food, idx) => {
          const isSelected = selectedFood?.name === food.name;
          return (
            <TouchableOpacity key={`${food.name}-${idx}`} onPress={() => { haptic.selection(); onSelectFood(food); }}>
              <Card style={{ marginBottom: spacing.sm, borderWidth: isSelected ? 1.5 : 0, borderColor: isSelected ? colors.primary : 'transparent' }} padding={spacing.md}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[typography.bodySemibold, { color: isSelected ? colors.primary : colors.text, flex: 1, marginRight: 8 }]} numberOfLines={1}>{food.name}</Text>
                  <Text style={[typography.captionMedium, { color: colors.textSecondary }]}>{food.calories} ккал/100г</Text>
                </View>
                <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]}>Б: {food.protein}г  Ж: {food.fats}г  У: {food.carbs}г</Text>
              </Card>
            </TouchableOpacity>
          );
        })
      )}

      {selectedFood && (
        <Card style={{ marginTop: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.primary }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={[typography.captionMedium, { color: colors.primary }]}>{selectedFood.name}</Text>
            <TouchableOpacity
              disabled={showSaved}
              onPress={() => {
                if (isFoodAlreadySaved) return;
                haptic.success();
                saveFoodItem({ id: savedFoodId, ...selectedFood, weightGrams: 100 });
                setSavedConfirm(true);
                setTimeout(() => setSavedConfirm(false), 2000);
              }}
              style={[styles.saveBtn, { backgroundColor: showSaved ? colors.success + '20' : colors.warning + '20', borderColor: showSaved ? colors.success : colors.warning }]}
            >
              <Text style={[typography.caption, { color: showSaved ? colors.success : colors.primary }]}>
                {showSaved ? '✓ Сохранено' : 'Сохранить'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }}>
            <Text style={[typography.body, { color: colors.text }]}>Порция:</Text>
            <TextInput
              style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={weightGrams}
              onChangeText={onWeightChange}
              keyboardType="numeric"
              selectTextOnFocus
              maxLength={5}
              accessibilityLabel={`Вес порции в граммах, текущий ${weightGrams}`}
            />
            <Text style={[typography.body, { color: colors.textSecondary }]}>г</Text>
          </View>
          {/* One-tap portion presets — same pattern as in scanner's
              RecognizedItemCard so users get the same shortcuts everywhere
              they pick weight. */}
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', marginBottom: spacing.md }}>
            {[30, 50, 100, 150, 200, 300].map((g) => {
              const isActive = parseInt(weightGrams, 10) === g;
              return (
                <TouchableOpacity
                  key={g}
                  onPress={() => { haptic.selection(); onWeightChange(String(g)); }}
                  style={[styles.portionPreset, {
                    backgroundColor: isActive ? colors.primary : colors.inputBackground,
                    borderColor: isActive ? colors.primary : colors.border,
                  }]}
                  accessibilityLabel={`${g} грамм`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: isActive ? '#FFF' : colors.textSecondary }}>{g}г</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {computedNutrition && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap' }}>
              {[
                { label: 'ккал', value: computedNutrition.calories, color: colors.calories },
                { label: 'белки', value: computedNutrition.protein, color: colors.protein },
                { label: 'жиры', value: computedNutrition.fats, color: colors.fats },
                { label: 'углеводы', value: computedNutrition.carbs, color: colors.carbs },
              ].map(({ label, value, color }) => (
                <View key={label} style={{ alignItems: 'center' }}>
                  <Text style={[typography.numberSmall, { color, fontSize: 20 }]} numberOfLines={1}>{value}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
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
  portionPreset: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm, borderWidth: 1 },
});
