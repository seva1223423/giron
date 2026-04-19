import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { NutritionItem } from '../../../types';

interface Props {
  item: NutritionItem & { confidence?: number };
  base: { cal: number; prot: number; fats: number; carbs: number } | undefined;
  onWeightChange: (id: string, weight: string) => void;
  onRemove: (id: string) => void;
}

const PORTION_PRESETS = [30, 50, 100, 150, 200, 300];

export const RecognizedItemCard: React.FC<Props> = ({ item, base, onWeightChange, onRemove }) => {
  const { colors } = useThemeStore();
  const { saveFoodItem } = useNutritionStore();
  const [saved, setSaved] = React.useState(false);

  const handleSave = () => {
    saveFoodItem({
      ...item,
      id: `saved-${item.name.replace(/\s/g, '-').toLowerCase()}`,
      calories: base ? Math.round(base.cal) : item.calories,
      protein: base ? Math.round(base.prot * 10) / 10 : item.protein,
      fats: base ? Math.round(base.fats * 10) / 10 : item.fats,
      carbs: base ? Math.round(base.carbs * 10) / 10 : item.carbs,
      weightGrams: 100,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const currentWeight = item.weightGrams || 100;

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]}>{item.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TouchableOpacity onPress={() => onRemove(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <View style={[styles.deleteBtn, { backgroundColor: colors.error + '15', borderColor: colors.error + '40' }]}>
              <Text style={{ fontSize: 12, color: colors.error, fontWeight: '700' }}>✕</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} disabled={saved} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: saved ? colors.success : colors.primary }}>
              {saved ? '✓' : '+'}
            </Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TextInput
              style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={item.weightGrams?.toString() ?? ''}
              onChangeText={(v) => onWeightChange(item.id, v)}
              keyboardType="numeric"
              selectTextOnFocus
            />
            <Text style={[typography.small, { color: colors.textSecondary }]}>г</Text>
          </View>
        </View>
      </View>

      {base && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs, gap: spacing.sm }}>
          <Text style={[typography.caption, { color: colors.textSecondary, flex: 1 }]}>
            На 100г: {Math.round(base.cal)} ккал · Б {Math.round(base.prot * 10) / 10}г · Ж {Math.round(base.fats * 10) / 10}г · У {Math.round(base.carbs * 10) / 10}г
          </Text>
          {item.confidence != null && item.confidence < 0.75 && (
            <View style={[styles.lowConfidenceBadge, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '50' }]}>
              <Text style={{ fontSize: 10, color: colors.warning, fontWeight: '700' }}>~</Text>
            </View>
          )}
        </View>
      )}

      {/* Portion presets — shown when base macros per 100g are available */}
      {base && (
        <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm, flexWrap: 'wrap' }}>
          {PORTION_PRESETS.map((g) => (
            <TouchableOpacity
              key={g}
              onPress={() => onWeightChange(item.id, String(g))}
              style={[styles.portionBtn, {
                backgroundColor: currentWeight === g ? colors.primary : colors.inputBackground,
                borderColor: currentWeight === g ? colors.primary : colors.border,
              }]}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: currentWeight === g ? '#FFF' : colors.textSecondary }}>
                {g}г
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.nutritionRow}>
        {[
          { label: 'Ккал', value: String(item.calories), color: colors.calories },
          { label: 'Белки', value: `${item.protein}г`, color: colors.protein },
          { label: 'Жиры', value: `${item.fats}г`, color: colors.fats },
          { label: 'Углев.', value: `${item.carbs}г`, color: colors.carbs },
        ].map(({ label, value, color }) => (
          <View key={label} style={styles.nutritionCell}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
            <Text style={[typography.bodyMedium, { color }]}>{value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  deleteBtn: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lowConfidenceBadge: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weightInput: { width: 56, height: 32, borderRadius: borderRadius.sm, borderWidth: 1, paddingHorizontal: spacing.sm, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  nutritionCell: { alignItems: 'center' },
  portionBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm, borderWidth: 1 },
});
