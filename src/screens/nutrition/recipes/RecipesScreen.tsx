import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useThemeStore, useRecipesStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { Icon, Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { borderRadius } from '../../../theme/spacing';
import type { Recipe, Allergen, Goal } from '../../../services/recipeService';

type Tab = 'curated' | 'mine' | 'ai';

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
  { key: 'gain', label: 'Набор массы' },
];

const TIME_OPTIONS = [15, 30, 60];

export const RecipesScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const safeTop = useSafeTop();
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const {
    curated, mine, loadingCurated, loadingMine, filter,
    fetchCurated, fetchMine, setFilter,
  } = useRecipesStore();
  const [tab, setTab] = useState<Tab>('curated');

  useEffect(() => {
    if (tab === 'curated') fetchCurated();
    if (tab === 'mine') fetchMine();
  }, [tab, filter.goal, filter.allergens.join(','), filter.maxPrepMin]);

  const toggleAllergen = (a: Allergen) => {
    haptic.selection();
    const current = filter.allergens;
    setFilter({
      allergens: current.includes(a) ? current.filter((x) => x !== a) : [...current, a],
    });
  };

  const setGoal = (g?: Goal) => {
    haptic.selection();
    setFilter({ goal: g });
  };

  const setMaxTime = (t?: number) => {
    haptic.selection();
    setFilter({ maxPrepMin: t });
  };

  const list = tab === 'curated' ? curated : tab === 'mine' ? mine : [];
  const loading = tab === 'curated' ? loadingCurated : tab === 'mine' ? loadingMine : false;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Icon name="arrow" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[typography.h2, { color: colors.text }]}>Рецепты</Text>
        <TouchableOpacity
          onPress={() => { haptic.selection(); navigation.navigate('RecipeForm', {}); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="plus" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Top tabs */}
      <View style={styles.tabRow}>
        {([
          { key: 'curated', label: 'Курируемые' },
          { key: 'mine', label: 'Мои' },
          { key: 'ai', label: 'AI' },
        ] as { key: Tab; label: string }[]).map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => { haptic.selection(); setTab(t.key); }}
            style={[
              styles.tab,
              {
                backgroundColor: tab === t.key ? colors.primary : 'transparent',
                borderColor: tab === t.key ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                typography.smallMedium,
                { color: tab === t.key ? '#FFFFFF' : colors.textSecondary },
              ]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'ai' ? (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <Card style={{ padding: spacing.xl, alignItems: 'center' }}>
            <Icon name="spark" size={32} color={colors.primary} />
            <Text style={[typography.bodySemibold, { color: colors.text, marginTop: spacing.md, textAlign: 'center' }]}>
              Сгенерировать рецепт через AI
            </Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center' }]}>
              Опиши что хочешь приготовить и какие ограничения — Mistral подберёт рецепт с КБЖУ
            </Text>
            <TouchableOpacity
              onPress={() => { haptic.selection(); navigation.navigate('AIRecipe'); }}
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.primary, marginTop: spacing.xl },
              ]}
            >
              <Text style={[typography.bodySemibold, { color: '#FFFFFF' }]}>Открыть генератор</Text>
            </TouchableOpacity>
          </Card>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={tab === 'curated' ? fetchCurated : fetchMine} />}
        >
          {/* Filters — only on curated */}
          {tab === 'curated' && (
            <View style={{ marginBottom: spacing.lg }}>
              <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.sm }]}>Цель</Text>
              <View style={styles.chipRow}>
                <Chip label="Все" active={!filter.goal} onPress={() => setGoal(undefined)} colors={colors} />
                {GOALS.map((g) => (
                  <Chip
                    key={g.key}
                    label={g.label}
                    active={filter.goal === g.key}
                    onPress={() => setGoal(g.key)}
                    colors={colors}
                  />
                ))}
              </View>

              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                Максимум времени
              </Text>
              <View style={styles.chipRow}>
                <Chip label="Любое" active={!filter.maxPrepMin} onPress={() => setMaxTime(undefined)} colors={colors} />
                {TIME_OPTIONS.map((t) => (
                  <Chip
                    key={t}
                    label={`до ${t} мин`}
                    active={filter.maxPrepMin === t}
                    onPress={() => setMaxTime(t)}
                    colors={colors}
                  />
                ))}
              </View>

              <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
                Исключить аллергены
              </Text>
              <View style={styles.chipRow}>
                {ALLERGENS.map((a) => (
                  <Chip
                    key={a.key}
                    label={a.label}
                    active={filter.allergens.includes(a.key)}
                    onPress={() => toggleAllergen(a.key)}
                    colors={colors}
                  />
                ))}
              </View>
            </View>
          )}

          {list.length === 0 && !loading ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xxl * 2 }}>
              <Icon name="apple" size={32} color={colors.textTertiary} />
              <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md, textAlign: 'center' }]}>
                {tab === 'curated' ? 'Под выбранные фильтры рецептов нет' : 'Вы ещё не создали ни одного рецепта'}
              </Text>
              {tab === 'mine' && (
                <TouchableOpacity
                  onPress={() => { haptic.selection(); navigation.navigate('RecipeForm', {}); }}
                  style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: spacing.xl }]}
                >
                  <Text style={[typography.bodySemibold, { color: '#FFFFFF' }]}>Создать рецепт</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            list.map((r) => (
              <RecipeCard
                key={r.id}
                recipe={r}
                onPress={() => { haptic.selection(); navigation.navigate('RecipeDetail', { id: r.id }); }}
                colors={colors}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
};

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; colors: any }> = ({
  label, active, onPress, colors,
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[
      styles.chip,
      {
        backgroundColor: active ? colors.primary + '22' : 'transparent',
        borderColor: active ? colors.primary : colors.border,
      },
    ]}
  >
    <Text style={[typography.small, { color: active ? colors.primary : colors.textSecondary, fontWeight: active ? '600' : '400' }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

const RecipeCard: React.FC<{ recipe: Recipe; onPress: () => void; colors: any }> = ({ recipe, onPress, colors }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
    <Card style={{ padding: spacing.lg, marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View
          style={{
            width: 56, height: 56, borderRadius: 14,
            backgroundColor: colors.primary + '15',
            alignItems: 'center', justifyContent: 'center',
            marginRight: spacing.md,
          }}
        >
          <Icon name="apple" size={26} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={2}>
            {recipe.name}
          </Text>
          <View style={{ flexDirection: 'row', marginTop: 4, gap: spacing.md }}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              {Math.round(recipe.totalCalories)} ккал
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Б {Math.round(recipe.totalProtein)} · Ж {Math.round(recipe.totalFats)} · У {Math.round(recipe.totalCarbs)}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              {recipe.prepTimeMin} мин
            </Text>
          </View>
        </View>
      </View>
    </Card>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  tabRow: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: borderRadius.md,
  },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: borderRadius.sm, borderWidth: 1,
  },
  primaryBtn: {
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center',
  },
});
