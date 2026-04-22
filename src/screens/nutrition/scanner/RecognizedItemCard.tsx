import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useThemeStore, useNutritionStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { useHaptic } from '../../../hooks/useHaptic';
import type { NutritionItem } from '../../../types';
import { confidenceBucket, type MacroBase } from '../../../utils/foodScanner';

interface Props {
  item: NutritionItem;
  base: MacroBase | undefined;
  onWeightChange: (id: string, weight: string) => void;
  onRemove: (id: string) => void;
  /** Called with (id, newName) when the user commits a rename. */
  onRename?: (id: string, newName: string) => void;
  /** Median weight (grams) this user has logged for this food across recent
   *  meals. When supplied AND sufficiently different from the AI's guess,
   *  a one-tap "Обычно: N г" hint appears. */
  typicalWeight?: number;
  /** True when another item in the list shares this (normalized) name —
   *  the parent computes the duplicate set with `findDuplicateNames`. We
   *  add a subtle warning border + chip so the user can spot which two
   *  cards are the duplicates without scanning every name. */
  isDuplicate?: boolean;
}

const PORTION_PRESETS = [30, 50, 100, 150, 200, 300];

const RecognizedItemCardImpl: React.FC<Props> = ({ item, base, onWeightChange, onRemove, onRename, typicalWeight, isDuplicate }) => {
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

  /** Suggestions from the user's saved foods. Shown below the rename input;
   *  tapping one commits the suggested name immediately. Max 5 suggestions
   *  to keep the UI compact. Case-insensitive.
   *
   *  Ranking: prefix matches first (starts-with), then substring matches.
   *  "курица" typed should surface "куриная грудка" before "шашлык куриный".
   *  Within each tier, alphabetical order for stability. */
  const nameSuggestions = React.useMemo(() => {
    if (!editingName) return [];
    const q = nameDraft.trim().toLowerCase();
    if (q.length < 1) return [];
    const matches = savedFoods
      .map((f) => {
        const n = f.name.toLowerCase();
        if (n === q) return null; // already matches current
        if (n.startsWith(q)) return { food: f, score: 0 };
        if (n.includes(q)) return { food: f, score: 1 };
        return null;
      })
      .filter((x): x is { food: (typeof savedFoods)[number]; score: number } => x != null);
    matches.sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name, 'ru'));
    return matches.slice(0, 5).map((m) => m.food);
  }, [editingName, nameDraft, savedFoods]);

  // Sync draft when item.weightGrams changes externally (e.g. preset tap)
  React.useEffect(() => {
    setWeightDraft(item.weightGrams?.toString() ?? '100');
  }, [item.weightGrams]);

  React.useEffect(() => {
    if (!editingName) setNameDraft(item.name);
  }, [item.name, editingName]);

  const commitWeight = () => {
    const trimmed = weightDraft.trim();
    // Empty / whitespace / non-numeric — restore the previous weight so
    // the input never sits on an invalid value that looks committed.
    const parsed = parseFloat(trimmed.replace(',', '.'));
    if (!trimmed || !isFinite(parsed) || parsed <= 0 || parsed > 5000) {
      setWeightDraft(item.weightGrams?.toString() ?? '100');
      if (trimmed) haptic.warning();
      return;
    }
    if (trimmed !== item.weightGrams?.toString()) {
      onWeightChange(item.id, trimmed);
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
    <Card style={[{ marginBottom: spacing.md }, isDuplicate && { borderWidth: 1, borderColor: colors.warning + '60' }]}>
      {isDuplicate && (
        <View
          style={{ alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full, backgroundColor: colors.warning + '20', borderWidth: 1, borderColor: colors.warning + '50', marginBottom: spacing.sm }}
          accessible
          accessibilityLabel="Дубликат — в списке есть ещё позиция с таким же названием"
          accessibilityRole="alert"
        >
          <Text style={{ color: colors.warning, fontSize: 10, fontWeight: '700' }}>ДУБЛИКАТ</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        {/* Confidence dot — colored pill gated by the 3-bucket rule in
            confidenceBucket(). VO announces "Высокая / средняя / низкая
            уверенность AI" so the color isn't the sole signal. */}
        <View
          style={[styles.confDot, { backgroundColor: confColor }]}
          accessible
          accessibilityLabel={`AI уверенность: ${bucket === 'high' ? 'высокая' : bucket === 'medium' ? 'средняя' : 'низкая'}`}
          accessibilityRole="image"
        />
        {editingName ? (
          <View style={{ flex: 1 }}>
            <TextInput
              style={[styles.nameInput, { color: colors.text, borderColor: colors.primary }]}
              value={nameDraft}
              onChangeText={setNameDraft}
              onBlur={commitName}
              onSubmitEditing={commitName}
              autoFocus
              selectTextOnFocus
              maxLength={100}
              returnKeyType="done"
              accessibilityLabel="Редактирование названия продукта"
              accessibilityHint="Введите правильное название если AI распознал неверно"
            />
          </View>
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
              accessibilityLabel={`Вес порции в граммах, текущий ${currentWeight}`}
              accessibilityHint="Введите вес, КБЖУ пересчитается автоматически"
              maxLength={5}
            />
            <Text style={[typography.small, { color: colors.textSecondary }]}>г</Text>
          </View>
        </View>
      </View>

      {/* Autocomplete suggestions from saved foods — shown only while the
          user is editing the name AND has typed at least one character.
          Tapping a suggestion commits it through the rename path so
          downstream savedFoods-match logic can run (user's saved macros
          override AI's estimates). */}
      {editingName && nameSuggestions.length > 0 && (
        <View style={[styles.suggestionList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {nameSuggestions.map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => {
                haptic.selection();
                setNameDraft(s.name);
                if (onRename) onRename(item.id, s.name);
                setEditingName(false);
              }}
              style={[styles.suggestionRow, { borderBottomColor: colors.divider }]}
              accessibilityLabel={`Выбрать ${s.name}`}
            >
              <Text style={[typography.smallMedium, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                {s.name}
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>
                {s.calories} ккал/100г
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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

      {/* "Usually you eat" hint — surfaces the user's own historical median
          when it meaningfully differs from the AI's guess. Threshold of 10%
          avoids flapping for near-matches; "≥2 samples" filter is enforced
          upstream in computeTypicalPortions so we don't show a chip based
          on a single outlier meal. */}
      {typicalWeight != null && Math.abs(typicalWeight - currentWeight) / Math.max(1, currentWeight) > 0.1 && (
        <TouchableOpacity
          onPress={() => selectPortion(typicalWeight)}
          style={[styles.typicalHint, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '40' }]}
          accessibilityLabel={`Применить твой обычный вес: ${typicalWeight} грамм`}
        >
          <Text style={[typography.caption, { color: colors.primary, fontWeight: '600' }]}>
            Обычно ты ешь: {typicalWeight}г — применить
          </Text>
        </TouchableOpacity>
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

/** Memoized wrapper — with 5–10 items in the list, typing in any weight /
 *  name input on ONE card used to rerender all siblings (parent passes a
 *  freshly-built `recognizedItems` array on each edit). A shallow compare
 *  on the props that actually affect this card's visible output means
 *  only the edited card re-renders. Callbacks are stable (parent wraps
 *  them in useCallback) so reference equality works for them.
 *
 *  We DO need to look at item fields individually because parent often
 *  rebuilds the item object (e.g. when commitWeight runs, it maps over
 *  items and returns a fresh `{ ...item, weightGrams: newW, ... }`) even
 *  when nothing visible changed for sibling items. */
export const RecognizedItemCard = React.memo(RecognizedItemCardImpl, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.name === next.item.name &&
    prev.item.weightGrams === next.item.weightGrams &&
    prev.item.calories === next.item.calories &&
    prev.item.protein === next.item.protein &&
    prev.item.fats === next.item.fats &&
    prev.item.carbs === next.item.carbs &&
    prev.item.confidence === next.item.confidence &&
    prev.base?.cal === next.base?.cal &&
    prev.base?.prot === next.base?.prot &&
    prev.base?.fats === next.base?.fats &&
    prev.base?.carbs === next.base?.carbs &&
    prev.typicalWeight === next.typicalWeight &&
    prev.isDuplicate === next.isDuplicate &&
    prev.onWeightChange === next.onWeightChange &&
    prev.onRemove === next.onRemove &&
    prev.onRename === next.onRename
  );
});

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
  typicalHint: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  suggestionList: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
});
