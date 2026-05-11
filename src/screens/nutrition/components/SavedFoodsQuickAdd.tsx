import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { NutritionItem } from '../../../types';

const SEARCH_THRESHOLD = 8;

interface Props {
  onQuickAdd: (food: NutritionItem) => void;
}

export const SavedFoodsQuickAdd: React.FC<Props> = ({ onQuickAdd }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { savedFoods, removeSavedFood } = useNutritionStore();
  const [query, setQuery] = useState('');

  const visibleFoods = useMemo(() => {
    if (!query.trim()) return savedFoods;
    const q = query.toLowerCase();
    return savedFoods.filter((f) => f.name.toLowerCase().includes(q));
  }, [savedFoods, query]);

  if (savedFoods.length === 0) return null;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <Text style={[typography.h4, { color: colors.text }]}>Быстрые продукты</Text>
        <Text style={[typography.caption, { color: colors.textTertiary }]}>{savedFoods.length}/30</Text>
      </View>

      {savedFoods.length >= SEARCH_THRESHOLD && (
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Найти..."
          placeholderTextColor={colors.inputPlaceholder}
          clearButtonMode="while-editing"
        />
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xs }}>
        {visibleFoods.map((food) => (
          <TouchableOpacity
            key={food.id}
            onPress={() => onQuickAdd(food)}
            onLongPress={() => {
              haptic.medium();
              Alert.alert('Удалить продукт?', food.name, [
                { text: 'Отмена', style: 'cancel' },
                { text: 'Удалить', style: 'destructive', onPress: () => removeSavedFood(food.id) },
              ]);
            }}
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[typography.captionMedium, { color: colors.text }]} numberOfLines={1}>{food.name}</Text>
            <Text style={[typography.small, { color: colors.primary }]} numberOfLines={1}>{food.calories} ккал/100г</Text>
          </TouchableOpacity>
        ))}
        {visibleFoods.length === 0 && (
          <Text style={[typography.small, { color: colors.textTertiary, paddingHorizontal: spacing.xs, paddingVertical: spacing.sm }]}>
            Ничего не найдено
          </Text>
        )}
      </ScrollView>
      <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
        Нажми для добавления · Удержи для удаления
      </Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginHorizontal: spacing.xs, minWidth: 90, alignItems: 'center' },
  searchInput: { height: 36, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: 14, marginBottom: spacing.sm },
});
