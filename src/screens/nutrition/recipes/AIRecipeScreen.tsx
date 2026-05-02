import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useThemeStore, useRecipesStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { Icon, Card, Button, Input } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { recipeService, type AIRecipeDraft, type Allergen, type Goal } from '../../../services/recipeService';

const ALLERGENS: { key: Allergen; label: string }[] = [
  { key: 'lactose', label: 'Лактоза' },
  { key: 'gluten', label: 'Глютен' },
  { key: 'eggs', label: 'Яйца' },
  { key: 'nuts', label: 'Орехи' },
  { key: 'fish', label: 'Рыба' },
  { key: 'soy', label: 'Соя' },
];

const GOALS: { key: Goal; label: string }[] = [
  { key: 'weight-loss', label: 'Похудение' },
  { key: 'maintain', label: 'Поддержание' },
  { key: 'gain', label: 'Набор' },
];

const TIME_OPTIONS = [15, 30, 60];

export const AIRecipeScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { createMine } = useRecipesStore();

  const [query, setQuery] = useState('');
  const [maxPrepMin, setMaxPrepMin] = useState<number | undefined>(undefined);
  const [goal, setGoal] = useState<Goal | undefined>(undefined);
  const [excludedAllergens, setExcludedAllergens] = useState<Allergen[]>([]);

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AIRecipeDraft | null>(null);

  const handleGenerate = async () => {
    if (query.trim().length < 3) {
      Alert.alert('Слишком коротко', 'Опишите рецепт хотя бы тремя символами');
      return;
    }
    setGenerating(true);
    try {
      const result = await recipeService.generateWithAI(query.trim(), {
        maxPrepMin,
        goal,
        allergensExcluded: excludedAllergens.length ? excludedAllergens : undefined,
      });
      setDraft(result);
      haptic.success();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось сгенерировать рецепт');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const created = await createMine({
        name: draft.name,
        descriptionRu: draft.descriptionRu,
        prepTimeMin: draft.prepTimeMin,
        servings: draft.servings,
        ingredients: draft.ingredients,
        steps: draft.steps,
        tags: draft.tags ?? [],
        allergens: draft.allergens ?? [],
      });
      haptic.success();
      navigation.replace('RecipeDetail', { id: created.id });
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить рецепт');
    } finally {
      setSaving(false);
    }
  };

  const toggleAllergen = (a: Allergen) => {
    haptic.selection();
    setExcludedAllergens((arr) => (arr.includes(a) ? arr.filter((x) => x !== a) : [...arr, a]));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="arrow" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[typography.h3, { color: colors.text }]}>AI рецепт</Text>
          <View style={{ width: 20 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 }} keyboardShouldPersistTaps="handled">
          {!draft ? (
            <>
              <Text style={[typography.body, { color: colors.text, marginTop: spacing.md }]}>
                Опишите рецепт
              </Text>
              <Input
                placeholder="Например: куриная грудка 400 ккал, без молочки, 30 мин"
                value={query}
                onChangeText={setQuery}
                multiline
                numberOfLines={3}
                containerStyle={{ marginTop: spacing.sm }}
              />

              <Text style={[typography.smallMedium, { color: colors.textSecondary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
                Цель
              </Text>
              <View style={styles.chipRow}>
                <Chip label="Любая" active={!goal} onPress={() => { haptic.selection(); setGoal(undefined); }} colors={colors} />
                {GOALS.map((g) => (
                  <Chip key={g.key} label={g.label} active={goal === g.key} onPress={() => { haptic.selection(); setGoal(g.key); }} colors={colors} />
                ))}
              </View>

              <Text style={[typography.smallMedium, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                Максимум времени
              </Text>
              <View style={styles.chipRow}>
                <Chip label="Любое" active={!maxPrepMin} onPress={() => { haptic.selection(); setMaxPrepMin(undefined); }} colors={colors} />
                {TIME_OPTIONS.map((t) => (
                  <Chip key={t} label={`до ${t} мин`} active={maxPrepMin === t} onPress={() => { haptic.selection(); setMaxPrepMin(t); }} colors={colors} />
                ))}
              </View>

              <Text style={[typography.smallMedium, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                Исключить аллергены
              </Text>
              <View style={styles.chipRow}>
                {ALLERGENS.map((a) => (
                  <Chip
                    key={a.key}
                    label={a.label}
                    active={excludedAllergens.includes(a.key)}
                    onPress={() => toggleAllergen(a.key)}
                    colors={colors}
                  />
                ))}
              </View>

              <Button
                title="Сгенерировать"
                onPress={handleGenerate}
                loading={generating}
                disabled={query.trim().length < 3}
                fullWidth size="lg"
                style={{ marginTop: spacing.xxl }}
              />
            </>
          ) : (
            <>
              <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
                <View
                  style={{
                    width: 80, height: 80, borderRadius: 20,
                    backgroundColor: colors.primary + '15',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon name="spark" size={36} color={colors.primary} />
                </View>
                <Text style={[typography.h2, { color: colors.text, textAlign: 'center', marginTop: spacing.md }]}>
                  {draft.name}
                </Text>
                {draft.descriptionRu ? (
                  <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
                    {draft.descriptionRu}
                  </Text>
                ) : null}
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                  {draft.prepTimeMin} мин · {draft.servings} {draft.servings === 1 ? 'порция' : 'порц.'}
                </Text>
              </View>

              <Card style={{ padding: spacing.lg, marginTop: spacing.lg }}>
                <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>На рецепт</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Macro label="Ккал" value={Math.round(draft.totalCalories)} color="#FF3B30" />
                  <Macro label="Б" value={Math.round(draft.totalProtein)} unit="г" color="#D4B07A" />
                  <Macro label="Ж" value={Math.round(draft.totalFats)} unit="г" color="#FF9F0A" />
                  <Macro label="У" value={Math.round(draft.totalCarbs)} unit="г" color="#34C759" />
                </View>
              </Card>

              <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
                Ингредиенты
              </Text>
              <Card style={{ padding: spacing.md }}>
                {draft.ingredients.map((ing, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row', justifyContent: 'space-between',
                      paddingVertical: spacing.sm,
                      borderBottomWidth: i === draft.ingredients.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{ing.name}</Text>
                    <Text style={[typography.body, { color: colors.textSecondary }]}>
                      {ing.weightGrams} г · {Math.round(ing.calories)} ккал
                    </Text>
                  </View>
                ))}
              </Card>

              <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
                Приготовление
              </Text>
              {draft.steps.map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', marginBottom: spacing.md }}>
                  <View
                    style={{
                      width: 24, height: 24, borderRadius: 12,
                      backgroundColor: colors.primary,
                      alignItems: 'center', justifyContent: 'center',
                      marginRight: spacing.md, marginTop: 2,
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
                  </View>
                  <Text style={[typography.body, { color: colors.text, flex: 1, lineHeight: 22 }]}>{s}</Text>
                </View>
              ))}

              <Button
                title="Сохранить в Мои"
                onPress={handleSave}
                loading={saving}
                fullWidth size="lg"
                style={{ marginTop: spacing.xl }}
              />
              <TouchableOpacity onPress={() => setDraft(null)} style={{ alignItems: 'center', marginTop: spacing.md }}>
                <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>Сгенерировать другой</Text>
              </TouchableOpacity>
            </>
          )}

          {generating && (
            <View style={{ alignItems: 'center', marginTop: spacing.xl }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.md }]}>
                Mistral подбирает рецепт...
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; colors: any }> = ({ label, active, onPress, colors }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      paddingHorizontal: spacing.md, paddingVertical: 6,
      borderRadius: borderRadius.sm, borderWidth: 1,
      backgroundColor: active ? colors.primary + '22' : 'transparent',
      borderColor: active ? colors.primary : colors.border,
    }}
  >
    <Text style={[typography.small, { color: active ? colors.primary : colors.textSecondary, fontWeight: active ? '600' : '400' }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const Macro: React.FC<{ label: string; value: number; unit?: string; color: string }> = ({ label, value, unit, color }) => (
  <View style={{ alignItems: 'center' }}>
    <Text style={[typography.h3, { color }]}>{value}{unit ? ` ${unit}` : ''}</Text>
    <Text style={[typography.caption, { color: '#888' }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
