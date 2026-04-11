import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { NutritionItem } from '../../../types';

interface Props {
  onQuickAdd: (food: NutritionItem) => void;
}

export const SavedFoodsQuickAdd: React.FC<Props> = ({ onQuickAdd }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { savedFoods, removeSavedFood } = useNutritionStore();

  if (savedFoods.length === 0) return null;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <Text style={[typography.h4, { color: colors.text }]}>Быстрые продукты</Text>
        <Text style={[typography.caption, { color: colors.textTertiary }]}>{savedFoods.length}/30</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xs }}>
        {savedFoods.map((food) => (
          <TouchableOpacity
            key={food.id}
            onPress={() => onQuickAdd(food)}
            onLongPress={() => { haptic.medium(); removeSavedFood(food.id); }}
            style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Text style={[typography.captionMedium, { color: colors.text }]} numberOfLines={1}>{food.name}</Text>
            <Text style={[typography.small, { color: colors.primary }]}>{food.calories} ккал</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.sm }]}>
        Нажми для добавления · Удержи для удаления
      </Text>
    </Card>
  );
};

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginHorizontal: spacing.xs, minWidth: 90, alignItems: 'center' },
});
