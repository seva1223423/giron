import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useThemeStore, useRecipesStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { Icon, Card, Button, Input } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { Recipe, RecipeBody, Allergen } from '../../../services/recipeService';

const ALLERGENS: { key: Allergen; label: string }[] = [
  { key: 'lactose', label: 'Лактоза' },
  { key: 'gluten', label: 'Глютен' },
  { key: 'eggs', label: 'Яйца' },
  { key: 'nuts', label: 'Орехи' },
  { key: 'fish', label: 'Рыба' },
  { key: 'soy', label: 'Соя' },
];

interface IngredientDraft {
  name: string;
  weightGrams: string; // strings while editing — parsed on save
  calories: string;
  protein: string;
  fats: string;
  carbs: string;
}

const emptyIngredient: IngredientDraft = {
  name: '', weightGrams: '', calories: '', protein: '', fats: '', carbs: '',
};

function recipeToDraft(r: Recipe): { name: string; descriptionRu: string; prepTimeMin: string; servings: string; ingredients: IngredientDraft[]; steps: string[]; allergens: Allergen[] } {
  return {
    name: r.name,
    descriptionRu: r.descriptionRu ?? '',
    prepTimeMin: String(r.prepTimeMin),
    servings: String(r.servings),
    ingredients: r.ingredients.map((i) => ({
      name: i.name,
      weightGrams: String(i.weightGrams),
      calories: String(i.calories),
      protein: String(i.protein),
      fats: String(i.fats),
      carbs: String(i.carbs),
    })),
    steps: r.steps.length ? [...r.steps] : [''],
    allergens: r.allergens,
  };
}

export const RecipeFormScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const editing = route.params?.recipe as Recipe | undefined;
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { createMine, updateMine } = useRecipesStore();

  const initial = editing ? recipeToDraft(editing) : {
    name: '', descriptionRu: '', prepTimeMin: '', servings: '1',
    ingredients: [emptyIngredient], steps: [''], allergens: [] as Allergen[],
  };

  const [name, setName] = useState(initial.name);
  const [descriptionRu, setDescriptionRu] = useState(initial.descriptionRu);
  const [prepTimeMin, setPrepTimeMin] = useState(initial.prepTimeMin);
  const [servings, setServings] = useState(initial.servings);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(initial.ingredients);
  const [steps, setSteps] = useState<string[]>(initial.steps);
  const [allergens, setAllergens] = useState<Allergen[]>(initial.allergens);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    let cals = 0, prot = 0, fats = 0, carbs = 0;
    for (const i of ingredients) {
      cals += Number(i.calories) || 0;
      prot += Number(i.protein) || 0;
      fats += Number(i.fats) || 0;
      carbs += Number(i.carbs) || 0;
    }
    return { cals: Math.round(cals), prot: Math.round(prot), fats: Math.round(fats), carbs: Math.round(carbs) };
  }, [ingredients]);

  const updateIng = (idx: number, key: keyof IngredientDraft, value: string) => {
    setIngredients((arr) => arr.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  };
  const addIng = () => { haptic.selection(); setIngredients((a) => [...a, { ...emptyIngredient }]); };
  const removeIng = (idx: number) => {
    haptic.selection();
    setIngredients((a) => (a.length === 1 ? a : a.filter((_, i) => i !== idx)));
  };

  const updateStep = (idx: number, value: string) => {
    setSteps((arr) => arr.map((s, i) => (i === idx ? value : s)));
  };
  const addStep = () => { haptic.selection(); setSteps((a) => [...a, '']); };
  const removeStep = (idx: number) => {
    haptic.selection();
    setSteps((a) => (a.length === 1 ? a : a.filter((_, i) => i !== idx)));
  };

  const toggleAllergen = (a: Allergen) => {
    haptic.selection();
    setAllergens((arr) => (arr.includes(a) ? arr.filter((x) => x !== a) : [...arr, a]));
  };

  const validate = (): RecipeBody | null => {
    if (!name.trim()) { Alert.alert('Не заполнено', 'Введите название рецепта'); return null; }
    const t = Number(prepTimeMin);
    if (!t || t < 1 || t > 600) { Alert.alert('Не заполнено', 'Время готовки от 1 до 600 минут'); return null; }
    const s = Number(servings);
    if (!s || s < 1 || s > 50) { Alert.alert('Не заполнено', 'Порций от 1 до 50'); return null; }

    const cleanIngs = [];
    for (const i of ingredients) {
      if (!i.name.trim()) continue;
      const wg = Number(i.weightGrams);
      const cal = Number(i.calories);
      if (!wg || !cal) {
        Alert.alert('Не заполнено', `У ингредиента "${i.name}" не указан вес или калории`);
        return null;
      }
      cleanIngs.push({
        name: i.name.trim(),
        weightGrams: wg,
        calories: cal,
        protein: Number(i.protein) || 0,
        fats: Number(i.fats) || 0,
        carbs: Number(i.carbs) || 0,
      });
    }
    if (cleanIngs.length === 0) { Alert.alert('Не заполнено', 'Добавьте хотя бы один ингредиент'); return null; }

    const cleanSteps = steps.map((x) => x.trim()).filter(Boolean);
    if (cleanSteps.length === 0) { Alert.alert('Не заполнено', 'Опишите хотя бы один шаг приготовления'); return null; }

    return {
      name: name.trim(),
      descriptionRu: descriptionRu.trim() || undefined,
      prepTimeMin: t,
      servings: s,
      ingredients: cleanIngs,
      steps: cleanSteps,
      tags: [],
      allergens,
    };
  };

  const handleSave = async () => {
    const body = validate();
    if (!body) return;
    setSaving(true);
    try {
      if (editing) await updateMine(editing.id, body);
      else await createMine(body);
      haptic.success();
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось сохранить рецепт');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="arrow" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[typography.h3, { color: colors.text }]}>
            {editing ? 'Изменить рецепт' : 'Новый рецепт'}
          </Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 }} keyboardShouldPersistTaps="handled">
          <Input label="Название *" placeholder="Например, Овсянка с бананом" value={name} onChangeText={setName} containerStyle={{ marginTop: spacing.md }} />
          <Input label="Описание" placeholder="Короткое описание (необязательно)" value={descriptionRu} onChangeText={setDescriptionRu} multiline numberOfLines={2} containerStyle={{ marginTop: spacing.lg }} />

          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg }}>
            <Input label="Время, мин *" placeholder="30" keyboardType="number-pad" value={prepTimeMin} onChangeText={setPrepTimeMin} containerStyle={{ flex: 1 }} />
            <Input label="Порций *" placeholder="1" keyboardType="number-pad" value={servings} onChangeText={setServings} containerStyle={{ flex: 1 }} />
          </View>

          {/* Ingredients */}
          <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
            Ингредиенты
          </Text>
          {ingredients.map((ing, i) => (
            <Card key={i} style={{ padding: spacing.md, marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>Ингредиент {i + 1}</Text>
                {ingredients.length > 1 && (
                  <TouchableOpacity onPress={() => removeIng(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[typography.caption, { color: colors.error }]}>Удалить</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Input placeholder="Название" value={ing.name} onChangeText={(v) => updateIng(i, 'name', v)} containerStyle={{ marginTop: 4 }} />
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <Input placeholder="Вес, г" keyboardType="number-pad" value={ing.weightGrams} onChangeText={(v) => updateIng(i, 'weightGrams', v)} containerStyle={{ flex: 1 }} />
                <Input placeholder="Ккал" keyboardType="number-pad" value={ing.calories} onChangeText={(v) => updateIng(i, 'calories', v)} containerStyle={{ flex: 1 }} />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <Input placeholder="Б, г" keyboardType="decimal-pad" value={ing.protein} onChangeText={(v) => updateIng(i, 'protein', v)} containerStyle={{ flex: 1 }} />
                <Input placeholder="Ж, г" keyboardType="decimal-pad" value={ing.fats} onChangeText={(v) => updateIng(i, 'fats', v)} containerStyle={{ flex: 1 }} />
                <Input placeholder="У, г" keyboardType="decimal-pad" value={ing.carbs} onChangeText={(v) => updateIng(i, 'carbs', v)} containerStyle={{ flex: 1 }} />
              </View>
            </Card>
          ))}
          <TouchableOpacity onPress={addIng} style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
            <Text style={[typography.smallMedium, { color: colors.primary }]}>+ Добавить ингредиент</Text>
          </TouchableOpacity>

          {/* Totals preview */}
          <Card style={{ padding: spacing.md, marginTop: spacing.md }}>
            <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.xs }]}>Всего на рецепт</Text>
            <Text style={[typography.body, { color: colors.text }]}>
              {totals.cals} ккал · Б {totals.prot} · Ж {totals.fats} · У {totals.carbs}
            </Text>
          </Card>

          {/* Steps */}
          <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
            Приготовление
          </Text>
          {steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.sm }}>
              <View
                style={{
                  width: 24, height: 24, borderRadius: 12, marginTop: 14,
                  backgroundColor: colors.primary,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Input placeholder={`Шаг ${i + 1}`} value={s} onChangeText={(v) => updateStep(i, v)} multiline />
              </View>
              {steps.length > 1 && (
                <TouchableOpacity onPress={() => removeStep(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 14 }}>
                  <Icon name="more" size={16} color={colors.error} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity onPress={addStep} style={{ paddingVertical: spacing.md, alignItems: 'center' }}>
            <Text style={[typography.smallMedium, { color: colors.primary }]}>+ Добавить шаг</Text>
          </TouchableOpacity>

          {/* Allergens */}
          <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
            Аллергены в составе
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {ALLERGENS.map((a) => {
              const active = allergens.includes(a.key);
              return (
                <TouchableOpacity
                  key={a.key}
                  onPress={() => toggleAllergen(a.key)}
                  style={{
                    paddingHorizontal: spacing.md, paddingVertical: 6,
                    borderRadius: borderRadius.sm, borderWidth: 1,
                    backgroundColor: active ? colors.error + '15' : 'transparent',
                    borderColor: active ? colors.error : colors.border,
                  }}
                >
                  <Text style={[typography.small, { color: active ? colors.error : colors.textSecondary, fontWeight: active ? '600' : '400' }]}>
                    {a.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button
            title={editing ? 'Сохранить изменения' : 'Создать рецепт'}
            onPress={handleSave}
            loading={saving}
            fullWidth size="lg"
            style={{ marginTop: spacing.xxl }}
          />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
});
