import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal } from 'react-native';
import { useThemeColors, useRecipesStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { Icon, Card, Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { recipeService, type Recipe } from '../../../services/recipeService';
import { localDateStr } from '../../../utils/date';

const MEAL_TYPES: { key: 'breakfast' | 'lunch' | 'dinner' | 'snack'; label: string }[] = [
  { key: 'breakfast', label: 'Завтрак' },
  { key: 'lunch', label: 'Обед' },
  { key: 'dinner', label: 'Ужин' },
  { key: 'snack', label: 'Перекус' },
];

export const RecipeDetailScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { id, draft } = route.params as { id?: string; draft?: Recipe };
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const colors = useThemeColors();
  const { mine, removeMine } = useRecipesStore();

  const [recipe, setRecipe] = useState<Recipe | null>(draft ?? null);
  const [loading, setLoading] = useState(!draft);
  const [adding, setAdding] = useState(false);
  const [showDiaryModal, setShowDiaryModal] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('lunch');

  useEffect(() => {
    if (draft || !id) return;
    setLoading(true);
    recipeService.getOne(id)
      .then((r) => setRecipe(r))
      .catch(() => Alert.alert('Ошибка', 'Не удалось загрузить рецепт'))
      .finally(() => setLoading(false));
  }, [id, draft]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="arrow" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
        <Text style={[typography.body, { color: colors.text, textAlign: 'center', marginTop: spacing.xxl }]}>
          Рецепт не найден
        </Text>
      </View>
    );
  }

  const isOwn = recipe.source === 'USER' && mine.some((r) => r.id === recipe.id);

  const handleAddToDiary = async () => {
    if (!recipe.id) {
      Alert.alert('Сначала сохраните', 'AI-рецепт нужно сохранить, прежде чем добавлять в дневник');
      return;
    }
    setAdding(true);
    try {
      await recipeService.addToDiary(recipe.id, {
        date: localDateStr(new Date()),
        mealType: selectedMealType,
        servings: 1,
      });
      haptic.success();
      setShowDiaryModal(false);
      Alert.alert('Готово', 'Рецепт добавлен в дневник питания');
    } catch (e: any) {
      Alert.alert('Ошибка', e?.response?.data?.error || 'Не удалось добавить в дневник');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Удалить рецепт?',
      'Это действие нельзя отменить',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            if (!recipe.id) return;
            try {
              await removeMine(recipe.id);
              haptic.success();
              navigation.goBack();
            } catch {
              Alert.alert('Ошибка', 'Не удалось удалить рецепт');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="arrow" size={20} color={colors.text} />
        </TouchableOpacity>
        {isOwn && (
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <TouchableOpacity onPress={() => navigation.navigate('RecipeForm', { recipe })} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[typography.smallMedium, { color: colors.primary }]}>Изменить</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[typography.smallMedium, { color: colors.error }]}>Удалить</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl * 2 }}>
        {/* Hero */}
        <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
          <View
            style={{
              width: 96, height: 96, borderRadius: 24,
              backgroundColor: colors.primary + '15',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: spacing.md,
            }}
          >
            <Icon name="apple" size={44} color={colors.primary} />
          </View>
          <Text style={[typography.h2, { color: colors.text, textAlign: 'center' }]}>
            {recipe.name}
          </Text>
          {recipe.descriptionRu ? (
            <Text style={[typography.small, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }]}>
              {recipe.descriptionRu}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md }}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>{recipe.prepTimeMin} мин</Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              {recipe.servings} {recipe.servings === 1 ? 'порция' : 'порц.'}
            </Text>
            {recipe.source === 'AI' && (
              <Text style={[typography.caption, { color: colors.primary, fontWeight: '600' }]}>AI</Text>
            )}
          </View>
        </View>

        {/* KBJU */}
        <Card style={{ padding: spacing.lg, marginTop: spacing.md }}>
          <Text style={[typography.smallMedium, { color: colors.textSecondary, marginBottom: spacing.md }]}>
            На рецепт ({recipe.servings} {recipe.servings === 1 ? 'порция' : 'порц.'})
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Macro label="Ккал" value={Math.round(recipe.totalCalories)} color="#FF3B30" />
            <Macro label="Белки" value={Math.round(recipe.totalProtein)} unit="г" color="#D4B07A" />
            <Macro label="Жиры" value={Math.round(recipe.totalFats)} unit="г" color="#FF9F0A" />
            <Macro label="Углеводы" value={Math.round(recipe.totalCarbs)} unit="г" color="#34C759" />
          </View>
        </Card>

        {/* Tags + allergens */}
        {(recipe.tags.length > 0 || recipe.allergens.length > 0) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.lg }}>
            {recipe.tags.map((t) => (
              <View
                key={t}
                style={{
                  backgroundColor: colors.primary + '15',
                  paddingHorizontal: spacing.sm, paddingVertical: 4,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Text style={[typography.caption, { color: colors.primary }]}>{t}</Text>
              </View>
            ))}
            {recipe.allergens.map((a) => (
              <View
                key={a}
                style={{
                  backgroundColor: colors.error + '15',
                  paddingHorizontal: spacing.sm, paddingVertical: 4,
                  borderRadius: borderRadius.sm,
                }}
              >
                <Text style={[typography.caption, { color: colors.error }]}>содержит {a}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Ingredients */}
        <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
          Ингредиенты
        </Text>
        <Card style={{ padding: spacing.md }}>
          {recipe.ingredients.map((ing, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row', justifyContent: 'space-between',
                paddingVertical: spacing.sm,
                borderBottomWidth: i === recipe.ingredients.length - 1 ? 0 : 1,
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

        {/* Steps */}
        <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.md }]}>
          Приготовление
        </Text>
        {recipe.steps.map((s, i) => (
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

        {/* CTA */}
        <Button
          title="Добавить в дневник"
          onPress={() => { haptic.selection(); setShowDiaryModal(true); }}
          fullWidth size="lg"
          disabled={!recipe.id}
          style={{ marginTop: spacing.xl }}
        />
        {recipe.source === 'AI' && !recipe.id && (
          <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>
            Сохраните рецепт в «Мои», чтобы добавить в дневник
          </Text>
        )}
      </ScrollView>

      {/* Add-to-diary modal */}
      <Modal visible={showDiaryModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, padding: spacing.xl, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <Text style={[typography.h3, { color: colors.text, marginBottom: spacing.lg }]}>
              В какой приём пищи?
            </Text>
            {MEAL_TYPES.map((m) => (
              <TouchableOpacity
                key={m.key}
                onPress={() => { haptic.selection(); setSelectedMealType(m.key); }}
                style={{
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  marginBottom: spacing.sm,
                  backgroundColor: selectedMealType === m.key ? colors.primary + '15' : colors.surface,
                  borderRadius: borderRadius.md,
                  borderWidth: 1,
                  borderColor: selectedMealType === m.key ? colors.primary : colors.border,
                }}
              >
                <Text style={[typography.body, { color: selectedMealType === m.key ? colors.primary : colors.text, fontWeight: selectedMealType === m.key ? '600' : '400' }]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
            <Button title="Подтвердить" onPress={handleAddToDiary} loading={adding} fullWidth size="lg" style={{ marginTop: spacing.md }} />
            <TouchableOpacity onPress={() => setShowDiaryModal(false)} style={{ alignItems: 'center', marginTop: spacing.md }}>
              <Text style={[typography.smallMedium, { color: colors.textSecondary }]}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

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
});
