import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore, useNutritionStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { localDateStr } from '../../../utils/date';

// ───── Base presets (shipped with the app) ─────────────────────────────
const BASE_QUICK_MEALS = [
  { name: 'Овсянка с бананом',     abbr: 'ОВ', type: 'breakfast', cal: 350, protein: 12, fats: 8,  carbs: 55, weight: 300 },
  { name: 'Яичница 3 яйца',         abbr: 'ЯИ', type: 'breakfast', cal: 280, protein: 21, fats: 20, carbs: 2,  weight: 180 },
  { name: 'Гречка с курицей',       abbr: 'ГК', type: 'lunch',     cal: 450, protein: 40, fats: 10, carbs: 50, weight: 350 },
  { name: 'Рис с рыбой',            abbr: 'РР', type: 'lunch',     cal: 420, protein: 35, fats: 8,  carbs: 55, weight: 350 },
  { name: 'Творог 5%',              abbr: 'ТВ', type: 'snack',     cal: 230, protein: 34, fats: 10, carbs: 6,  weight: 200 },
  { name: 'Протеиновый коктейль',   abbr: 'ПК', type: 'snack',     cal: 150, protein: 30, fats: 2,  carbs: 5,  weight: 300 },
  { name: 'Куриная грудка + овощи', abbr: 'КО', type: 'dinner',    cal: 350, protein: 45, fats: 8,  carbs: 15, weight: 350 },
  { name: 'Бутерброд с сыром',      abbr: 'БС', type: 'snack',     cal: 280, protein: 12, fats: 15, carbs: 25, weight: 120 },
] as const;

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
type QuickMealItem = {
  name: string; abbr: string; type: MealType;
  cal: number; protein: number; fats: number; carbs: number; weight: number;
};

// AsyncStorage keys (namespaced under giron/nutrition)
const OVERRIDES_KEY = 'giron/nutrition/quickMeals/overrides/v1';
const HIDDEN_KEY    = 'giron/nutrition/quickMeals/hidden/v1';

interface Props {
  selectedDate?: string;
}

export const QuickMeals: React.FC<Props> = ({ selectedDate }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { addMeal, dailyLog } = useNutritionStore();

  // ── Persistent user edits ────────────────────────────────────────────
  const [overrides, setOverrides] = useState<Record<string, Partial<QuickMealItem>>>({});
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(OVERRIDES_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) ?? {};
        // Round 90: prune overrides for abbrs that no longer exist in
        // BASE_QUICK_MEALS — happens after a future preset rename. Keeps
        // AsyncStorage tidy without surprising the user (a vanished abbr
        // never showed up to be edited in the first place).
        const validAbbrs = new Set(BASE_QUICK_MEALS.map((m) => m.abbr));
        const pruned: Record<string, Partial<QuickMealItem>> = {};
        let changed = false;
        for (const [k, v] of Object.entries(parsed)) {
          if (validAbbrs.has(k as typeof BASE_QUICK_MEALS[number]['abbr'])) {
            pruned[k] = v as Partial<QuickMealItem>;
          } else {
            changed = true;
          }
        }
        setOverrides(pruned);
        if (changed) AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(pruned)).catch(() => {});
      } catch {}
    });
    AsyncStorage.getItem(HIDDEN_KEY).then((raw) => {
      if (!raw) return;
      try {
        const parsed: string[] = JSON.parse(raw) ?? [];
        // Round 90: same garbage-collection on the hidden list. A future
        // preset rename would otherwise leave dangling abbrs in storage
        // forever — the "Вернуть скрытые (N)" badge would still show a
        // count even though the user can't see what's hidden.
        const validAbbrs = new Set(BASE_QUICK_MEALS.map((m) => m.abbr));
        const pruned = parsed.filter((a) => validAbbrs.has(a as typeof BASE_QUICK_MEALS[number]['abbr']));
        setHidden(pruned);
        if (pruned.length !== parsed.length) {
          AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(pruned)).catch(() => {});
        }
      } catch {}
    });
  }, []);

  const persistOverrides = (next: Record<string, Partial<QuickMealItem>>) => {
    setOverrides(next);
    AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(next)).catch(() => {});
  };
  const persistHidden = (next: string[]) => {
    setHidden(next);
    AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(next)).catch(() => {});
  };

  // ── Resolved presets list (base + user overrides, minus hidden) ──────
  const presets: QuickMealItem[] = useMemo(() => {
    return BASE_QUICK_MEALS
      .filter((m) => !hidden.includes(m.abbr))
      .map((m) => ({ ...m, ...(overrides[m.abbr] ?? {}) } as QuickMealItem));
  }, [overrides, hidden]);

  // ── Recent foods (unchanged behaviour) ───────────────────────────────
  const recentFoods = useMemo(() => {
    const all: { name: string; type: MealType; cal: number; protein: number; fats: number; carbs: number; weight: number }[] = [];
    const seen = new Set<string>();
    const dates = Object.keys(dailyLog).sort((a, b) => b.localeCompare(a));
    for (const date of dates) {
      const log = dailyLog[date];
      if (!log?.meals) continue;
      const sorted = [...log.meals].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      for (const meal of sorted) {
        for (const item of meal.items) {
          const cleanName = item.name.replace(/\s*\(\d+(?:[.,]\d+)?г\)$/, '').trim();
          const key = cleanName.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          all.push({
            name: cleanName, type: meal.type as MealType,
            cal: item.calories, protein: item.protein, fats: item.fats, carbs: item.carbs,
            weight: item.weightGrams || 100,
          });
          if (all.length >= 5) break;
        }
        if (all.length >= 5) break;
      }
      if (all.length >= 5) break;
    }
    return all;
  }, [dailyLog]);

  // ── Add to today's diary ─────────────────────────────────────────────
  const handleQuickAdd = (meal: QuickMealItem | (typeof recentFoods)[0]) => {
    haptic.success();
    const today = selectedDate ?? localDateStr(new Date());
    const ts = Date.now();
    const rid = Math.random().toString(36).slice(2, 7);
    addMeal(today, {
      id: `meal-${ts}-${rid}`,
      type: meal.type,
      photoUrl: undefined,
      totalCalories: meal.cal,
      totalProtein: meal.protein,
      totalFats: meal.fats,
      totalCarbs: meal.carbs,
      items: [{
        id: `item-${ts}-${rid}-0`,
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

  // ── Edit modal state ─────────────────────────────────────────────────
  const [editing, setEditing] = useState<QuickMealItem | null>(null);
  const openEditor = (m: QuickMealItem) => { haptic.selection(); setEditing(m); };
  const closeEditor = () => setEditing(null);

  const saveEdit = (next: QuickMealItem) => {
    if (!editing) return;
    persistOverrides({ ...overrides, [editing.abbr]: {
      name: next.name, type: next.type,
      cal: next.cal, protein: next.protein, fats: next.fats, carbs: next.carbs, weight: next.weight,
    }});
    haptic.success();
    closeEditor();
  };

  const resetEdit = () => {
    if (!editing) return;
    const { [editing.abbr]: _, ...rest } = overrides;
    persistOverrides(rest);
    haptic.selection();
    closeEditor();
  };

  const deleteEdit = () => {
    if (!editing) return;
    Alert.alert(
      'Скрыть пресет?',
      `«${editing.name}» больше не будет показываться в быстром добавлении. Вернуть можно через сброс в настройках.`,
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Скрыть', style: 'destructive', onPress: () => {
          if (!hidden.includes(editing.abbr)) persistHidden([...hidden, editing.abbr]);
          haptic.warning?.() ?? haptic.success();
          closeEditor();
        }},
      ],
    );
  };

  // ── Card renderer ────────────────────────────────────────────────────
  const renderCard = (
    meal: QuickMealItem | (typeof recentFoods)[0],
    index: number,
    isRecent?: boolean,
    isPreset?: boolean,
  ) => {
    const swatch = isRecent ? colors.accent : colors.primary;
    return (
      <View key={`${isRecent ? 'recent' : 'quick'}-${index}`} style={styles.cardWrapper}>
        {/* Main tap area: opens editor for presets, quick-adds for recents */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            if (isPreset) openEditor(meal as QuickMealItem);
            else handleQuickAdd(meal);
          }}
          onLongPress={isPreset ? () => openEditor(meal as QuickMealItem) : undefined}
          delayLongPress={250}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: isRecent ? colors.primary + '40' : colors.border }]}
          accessibilityLabel={`${meal.name}, ${meal.cal} ккал. ${isPreset ? 'Тап — посмотреть и редактировать. Кнопка плюс — добавить.' : 'Тап — добавить.'}`}
          accessibilityRole="button"
        >
          <View style={[styles.abbr, { backgroundColor: swatch + '15', borderWidth: 1, borderColor: swatch + '35' }]}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: swatch }}>
              {'abbr' in meal && (meal as QuickMealItem).abbr ? (meal as QuickMealItem).abbr : meal.name.substring(0, 2).toUpperCase()}
            </Text>
          </View>
          <Text style={[typography.captionMedium, { color: colors.text, textAlign: 'center' }]} numberOfLines={2}>{meal.name}</Text>
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 1 }]}>{meal.cal} ккал</Text>
        </TouchableOpacity>

        {/* +1 button — instant add (kept in top-right) */}
        <TouchableOpacity
          onPress={() => handleQuickAdd(meal)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={[styles.plusBtn, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
          accessibilityLabel={`Добавить ${meal.name} в дневник`}
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary }}>+1</Text>
        </TouchableOpacity>

        {/* Pencil button — opens editor (only for presets) */}
        {isPreset && (
          <TouchableOpacity
            onPress={() => openEditor(meal as QuickMealItem)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[styles.editBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityLabel={`Редактировать ${meal.name}`}
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 11, color: colors.textSecondary }}>✎</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {/* Recent foods section */}
      {recentFoods.length > 0 && (
        <View style={{ marginBottom: spacing.md }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.sm }]}>Недавние</Text>
          <View style={styles.grid}>
            {recentFoods.map((food, i) => renderCard(food, i, true, false))}
          </View>
        </View>
      )}

      {/* Quick meals section */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <Text style={[typography.h4, { color: colors.text }]}>Быстрое добавление</Text>
        {hidden.length > 0 && (
          <TouchableOpacity
            onPress={() => { haptic.selection(); persistHidden([]); }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel="Вернуть скрытые пресеты"
            accessibilityRole="button"
          >
            <Text style={[typography.caption, { color: colors.primary }]}>Вернуть скрытые ({hidden.length})</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.grid}>
        {presets.map((meal, i) => renderCard(meal, i, false, true))}
      </View>

      {/* ── Edit modal ───────────────────────────────────────────────── */}
      <PresetEditor
        visible={!!editing}
        initial={editing}
        colors={colors}
        onClose={closeEditor}
        onSave={saveEdit}
        onResetDefault={resetEdit}
        onDelete={deleteEdit}
        onAddNow={(m) => { handleQuickAdd(m); closeEditor(); }}
        hasOverride={!!editing && !!overrides[editing.abbr]}
      />
    </View>
  );
};

// ─── Editor modal ────────────────────────────────────────────────────────
const MEAL_TYPE_OPTIONS: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch',     label: 'Обед' },
  { key: 'dinner',    label: 'Ужин' },
  { key: 'snack',     label: 'Перекус' },
];

const PresetEditor: React.FC<{
  visible: boolean;
  initial: QuickMealItem | null;
  colors: any;
  hasOverride: boolean;
  onClose: () => void;
  onSave: (m: QuickMealItem) => void;
  onResetDefault: () => void;
  onDelete: () => void;
  onAddNow: (m: QuickMealItem) => void;
}> = ({ visible, initial, colors, hasOverride, onClose, onSave, onResetDefault, onDelete, onAddNow }) => {
  const [draft, setDraft] = useState<QuickMealItem | null>(initial);
  useEffect(() => { setDraft(initial); }, [initial]);

  if (!draft) return null;

  const num = (raw: string, fallback: number) => {
    const n = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  };

  const Row = ({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix: string }) => (
    <View style={[mStyles.row, { borderColor: colors.border }]}>
      <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <TextInput
          value={String(value)}
          onChangeText={(t) => onChange(num(t, 0))}
          keyboardType="numeric"
          selectTextOnFocus
          style={[mStyles.numInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
        />
        <Text style={[typography.caption, { color: colors.textTertiary }]}>{suffix}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={mStyles.backdrop}
      >
        <TouchableOpacity activeOpacity={1} style={mStyles.backdropTap} onPress={onClose} />
        <View style={[mStyles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[mStyles.handle, { backgroundColor: colors.border }]} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.xs }]}>Пресет</Text>
            <Text style={[typography.caption, { color: colors.textTertiary, marginBottom: spacing.md }]}>
              Изменения сохранятся для этой кнопки на устройстве.
            </Text>

            {/* Name */}
            <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: 6 }]}>Название</Text>
            <TextInput
              value={draft.name}
              onChangeText={(t) => setDraft({ ...draft, name: t })}
              style={[mStyles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Например, Овсянка с бананом"
              placeholderTextColor={colors.textTertiary}
            />

            {/* Meal type */}
            <Text style={[typography.smallMedium, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: 6 }]}>Тип приёма пищи</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {MEAL_TYPE_OPTIONS.map((opt) => {
                const active = draft.type === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setDraft({ ...draft, type: opt.key })}
                    style={[
                      mStyles.typePill,
                      {
                        backgroundColor: active ? colors.primary + '20' : colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={[typography.smallMedium, { color: active ? colors.primary : colors.textSecondary }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Numbers */}
            <View style={{ marginTop: spacing.md, gap: 8 }}>
              <Row label="Калории"   value={draft.cal}     onChange={(n) => setDraft({ ...draft, cal: n })}     suffix="ккал" />
              <Row label="Белки"     value={draft.protein} onChange={(n) => setDraft({ ...draft, protein: n })} suffix="г" />
              <Row label="Жиры"      value={draft.fats}    onChange={(n) => setDraft({ ...draft, fats: n })}    suffix="г" />
              <Row label="Углеводы"  value={draft.carbs}   onChange={(n) => setDraft({ ...draft, carbs: n })}   suffix="г" />
              <Row label="Порция"    value={draft.weight}  onChange={(n) => setDraft({ ...draft, weight: n })}  suffix="г" />
            </View>

            {/* Actions */}
            <View style={{ marginTop: spacing.lg, gap: 8 }}>
              <TouchableOpacity
                onPress={() => onSave(draft)}
                style={[mStyles.btn, { backgroundColor: colors.primary }]}
              >
                <Text style={[typography.button, { color: colors.textInverse }]}>Сохранить</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onAddNow(draft)}
                style={[mStyles.btn, { backgroundColor: colors.primary + '15', borderWidth: 1, borderColor: colors.primary + '40' }]}
              >
                <Text style={[typography.button, { color: colors.primary }]}>Добавить в дневник сейчас</Text>
              </TouchableOpacity>

              {hasOverride && (
                <TouchableOpacity
                  onPress={onResetDefault}
                  style={[mStyles.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
                >
                  <Text style={[typography.button, { color: colors.textSecondary }]}>Сбросить к стандартному</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={onDelete}
                style={[mStyles.btn, { backgroundColor: 'transparent' }]}
              >
                <Text style={[typography.button, { color: colors.error }]}>Скрыть из быстрого добавления</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cardWrapper: { width: '23%', minWidth: 80, flexGrow: 1, maxWidth: '25%' },
  card: {
    borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.sm,
    alignItems: 'center', minHeight: 90,
  },
  abbr: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  plusBtn: {
    position: 'absolute', top: -4, right: -4,
    width: 24, height: 24, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  editBtn: {
    position: 'absolute', top: -4, left: -4,
    width: 22, height: 22, borderRadius: 11, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});

const mStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  backdropTap: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xl,
    borderTopWidth: 1, maxHeight: '90%',
  },
  handle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    marginBottom: spacing.md, opacity: 0.6,
  },
  textInput: {
    borderWidth: 1, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15,
  },
  typePill: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: 999, borderWidth: 1,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  numInput: {
    minWidth: 64, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: borderRadius.sm, borderWidth: 1, fontSize: 15, textAlign: 'right',
  },
  btn: {
    paddingVertical: 14, borderRadius: borderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
});
