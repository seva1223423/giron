import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { useHaptic } from '../../../hooks/useHaptic';
import type { NutritionItem } from '../../../types';

interface Props {
  item: NutritionItem;
  base: { cal: number; prot: number; fats: number; carbs: number } | undefined;
  onWeightChange: (id: string, weight: string) => void;
  onRemove: (id: string) => void;
  /** Called with (id, newName) when the user commits a rename. */
  onRename?: (id: string, newName: string) => void;
}

const PORTION_PRESETS = [30, 50, 100, 150, 200, 300];

/** Confidence color + label. AI returns 0..1 for some items, undefined for others.
 *  We use 3 buckets: high (≥0.8), medium (0.5–0.8), low (<0.5 or missing). */
function confidenceBucket(conf: number | undefined): 'high' | 'medium' | 'low' {
  if (conf == null) return 'low';
  if (conf >= 0.8) return 'high';
  if (conf >= 0.5) return 'medium';
  return 'low';
}

export const RecognizedItemCard: React.FC<Props> = ({ item, base, onWeightChange, onRemove, onRename }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();
  const { saveFoodItem, savedFoods } = useNutritionStore();
  const savedId = `saved-${item.name.replace(/\s/g, '-').toLowerCase()}`;
  const isAlreadySaved = savedFoods.some((f) => f.id === savedId);
  const [justSaved, setJustSaved] = React.useState(false);
  const saved = isAlreadySaved || justSaved;
  // Local draft avoids spamming macro recalc on every keystroke
  const [weightDraft, setWeightDraft] = React.useState(item.weightGrams?.toString() ?? '100');
  // Name editing — tap the name to inline-correct AI misidentifications.
  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(item.name);

  // Sync draft when item.weightGrams changes externally (e.g. preset tap)
  React.useEffect(() => {
    setWeightDraft(item.weightGrams?.toString() ?? '100');
  }, [item.weightGrams]);

  React.useEffect(() => {
    if (!editingName) setNameDraft(item.name);
  }, [item.name, editingName]);

  const commitWeight = () => {
    if (weightDraft !== item.weightGrams?.toString()) {
      onWeightChange(item.id, weightDraft);
    }
  };

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== item.name && onRename) {
      onRename(item.id, trimmed);
      haptic.light();
    } else if (!trimmed) {
      // Restore to original if user cleared it
      setNameDraft(item.name);
    }
    setEditingName(false);
  };

  /** Portion preset tap — buzz + apply new weight immediately. */
  const selectPortion = (g: number) => {
    haptic.selection();
    onWeightChange(item.id, String(g));
  };

  const handleSave = () => {
    if (isAlreadySaved) return;
    haptic.success();
    saveFoodItem({
      ...item,
      id: savedId,
      calories: base ? Math.round(base.cal) : item.calories,
      protein: base ? Math.round(base.prot * 10) / 10 : item.protein,
      fats: base ? Math.round(base.fats * 10) / 10 : item.fats,
      carbs: base ? Math.round(base.carbs * 10) / 10 : item.carbs,
      weightGrams: 100,
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const currentWeight = item.weightGrams || 100;
  const bucket = confidenceBucket(item.confidence);
  const confColor = bucket === 'high' ? colors.success : bucket === 'medium' ? colors.warning : colors.error;

  return (
    <Card style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        {/* Confidence dot — tap-target covers the icon so VO users still read name */}
        <View style={[styles.confDot, { backgroundColor: confColor }]} />
        {editingName ? (
          <TextInput
            style={[styles.nameInput, { color: colors.text, borderColor: colors.primary }]}
            value={nameDraft}
            onChangeText={setNameDraft}
            onBlur={commitName}
            onSubmitEditing={commitName}
            autoFocus
            maxLength={100}
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => { if (onRename) { haptic.selection(); setEditingName(true); } }}
            disabled={!onRename}
            accessibilityLabel={onRename ? `Нажмите чтобы изменить название: ${item.name}` : item.name}
            accessibilityRole={onRename ? 'button' : 'text'}
          >
            <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
              {item.name}
              {onRename && <Text style={{ color: colors.textTertiary, fontSize: 11 }}>  ✎</Text>}
            </Text>
          </TouchableOpacity>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TouchableOpacity onPress={() => onRemove(item.id)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={`Удалить ${item.name}`} accessibilityRole="button">
            <View style={[styles.deleteBtn, { backgroundColor: colors.error + '15', borderColor: colors.error + '40' }]}>
              <Text style={{ fontSize: 12, color: colors.error, fontWeight: '700' }}>✕</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} disabled={saved} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel={saved ? 'Сохранено' : `Сохранить ${item.name}`} accessibilityRole="button">
            <Text style={{ fontSize: 14, fontWeight: '700', color: saved ? colors.success : colors.primary }}>
              {saved ? '✓' : '+'}
            </Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TextInput
              style={[styles.weightInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
              value={weightDraft}
              onChangeText={setWeightDraft}
              onBlur={commitWeight}
              onSubmitEditing={commitWeight}
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
          {(item.confidence == null || item.confidence < 0.75) && (
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
              onPress={() => selectPortion(g)}
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
  confDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  nameInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 2,
  },
  weightInput: { width: 56, height: 32, borderRadius: borderRadius.sm, borderWidth: 1, paddingHorizontal: spacing.sm, textAlign: 'center', fontSize: 14, fontWeight: '600' },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  nutritionCell: { alignItems: 'center' },
  portionBtn: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.sm, borderWidth: 1 },
});
