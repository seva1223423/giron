import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, TextInput, StyleSheet, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors } from '../../store';
import { Card, Spinner, Icon } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { exercises as localExercises } from '../../data/exercises';
import { Exercise } from '../../types';
import { workoutService } from '../../services';
import { exerciseThumbSource } from '../../config/store';

const FAVORITES_KEY = 'iron_gym_exercise_favorites';

const MUSCLE_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'favorites', label: 'Избранное' },
  { key: 'chest', label: 'Грудь' },
  { key: 'back', label: 'Спина' },
  { key: 'shoulders', label: 'Плечи' },
  { key: 'biceps', label: 'Бицепс' },
  { key: 'triceps', label: 'Трицепс' },
  { key: 'quadriceps', label: 'Квадрицепс' },
  { key: 'hamstrings', label: 'Бицепс бедра' },
  { key: 'glutes', label: 'Ягодицы' },
  { key: 'abs', label: 'Пресс' },
  { key: 'calves', label: 'Икры' },
  { key: 'traps', label: 'Трапеции' },
  { key: 'forearms', label: 'Предплечья' },
];

const EQUIPMENT_FILTERS = [
  { key: 'all', label: 'Любое' },
  { key: 'barbell', label: 'Штанга' },
  { key: 'dumbbell', label: 'Гантели' },
  { key: 'cable', label: 'Блок' },
  { key: 'machine', label: 'Тренажёр' },
  { key: 'bodyweight', label: 'Вес тела' },
  { key: 'cardio', label: 'Кардио' },
  { key: 'stretching', label: 'Растяжка' },
];

interface Props {
  navigation: any;
}

/**
 * Dedicated exercise search screen — round 287.
 *
 * Replaces the previous third tab "Упражнения" inside WorkoutsScreen.
 * Reachable from the 🔍 button in WorkoutsHeader. Logic mirrors the
 * old ExercisesTab (favorites + muscle/equipment filters + server
 * fetch fallback to local list).
 */
export const ExerciseSearchScreen: React.FC<Props> = ({ navigation }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
  const safeTop = useSafeTop();
  const [exerciseList, setExerciseList] = useState<Exercise[]>(localExercises);
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [loadingExercises, setLoadingExercises] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(FAVORITES_KEY).then((raw) => {
      if (raw && mounted) {
        try { setFavoriteIds(new Set(JSON.parse(raw))); } catch {}
      }
    }).catch(() => {});
    const loadServerExercises = async () => {
      if (!mounted) return;
      setLoadingExercises(true);
      try {
        const serverExercises = await workoutService.getExercises();
        if (mounted && serverExercises.length > 0) setExerciseList(serverExercises);
      } catch {
        // Keep local exercises
      } finally {
        if (mounted) setLoadingExercises(false);
      }
    };
    loadServerExercises();
    return () => { mounted = false; };
  }, []);

  const toggleFavorite = useCallback((exerciseId: string) => {
    haptic.light();
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, [haptic]);

  const filteredExercises = useMemo(() =>
    exerciseList.filter((ex) => {
      const matchesSearch = searchQuery ? ex.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
      const matchesMuscle = muscleFilter === 'all' ? true
        : muscleFilter === 'favorites' ? favoriteIds.has(ex.id)
        : ex.primaryMuscles.includes(muscleFilter as any);
      const matchesEquipment = equipmentFilter === 'all' ? true
        : equipmentFilter === 'stretching' ? (ex as any).category === 'stretching'
        : ex.type === equipmentFilter;
      return matchesSearch && matchesMuscle && matchesEquipment;
    }),
    [exerciseList, searchQuery, muscleFilter, equipmentFilter, favoriteIds]
  );

  const renderExerciseCard = useCallback(({ item: ex }: { item: Exercise }) => {
    const isFav = favoriteIds.has(ex.id);
    const thumb = exerciseThumbSource(ex.id);
    return (
      <Card
        style={{ marginBottom: spacing.sm }}
        padding={spacing.md}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            activeOpacity={0.7}
            onPress={() => { haptic.light(); navigation.navigate('ExerciseDetail', { exerciseId: ex.id }); }}
            accessibilityRole="button"
            accessibilityLabel={ex.name}
          >
            {thumb !== undefined ? (
              <Image source={thumb} style={[styles.cardThumb, { backgroundColor: colors.surface }]} />
            ) : (
              <View style={[styles.cardThumb, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                <Icon name={ex.type === 'cardio' ? 'heart' : 'dumbbell'} size={22} color={colors.textSecondary} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {ex.primaryMuscles.join(', ')}{ex.type ? ` · ${ex.type}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleFavorite(ex.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ paddingLeft: spacing.md }}
            accessibilityRole="button"
            accessibilityLabel={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
          >
            <Icon name="trophy" size={20} color={isFav ? colors.primary : colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </Card>
    );
  }, [favoriteIds, colors, navigation, toggleFavorite, haptic]);

  const keyExtractor = useCallback((ex: Exercise) => ex.id, []);

  const listHeader = useMemo(() => (
    <View style={{ padding: spacing.xl, paddingBottom: 0 }}>
      <TextInput
        style={[styles.searchInput, typography.body, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Поиск упражнений..."
        placeholderTextColor={colors.inputPlaceholder}
        autoFocus
        returnKeyType="search"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.sm }}>
        {MUSCLE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { haptic.selection(); setMuscleFilter(f.key); }}
            style={[styles.filterChip, { backgroundColor: muscleFilter === f.key ? colors.primary : colors.surface, borderColor: muscleFilter === f.key ? colors.primary : colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={f.label}
          >
            <Text style={[typography.captionMedium, { color: muscleFilter === f.key ? colors.textInverse : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        {EQUIPMENT_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { haptic.selection(); setEquipmentFilter(f.key); }}
            style={[styles.filterChip, { backgroundColor: equipmentFilter === f.key ? colors.accent : colors.surface, borderColor: equipmentFilter === f.key ? colors.accent : colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={f.label}
          >
            <Text style={[typography.captionMedium, { color: equipmentFilter === f.key ? colors.textInverse : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.md }]}>
        {filteredExercises.length} упражнений
      </Text>
    </View>
  ), [searchQuery, muscleFilter, equipmentFilter, colors, filteredExercises.length, haptic]);

  const listEmpty = useMemo(() => {
    if (loadingExercises) {
      return <View style={{ marginTop: spacing.xl, alignItems: 'center' }}><Spinner color={colors.primary} size={32} /></View>;
    }
    if (muscleFilter === 'favorites') {
      return (
        <View style={styles.emptyState}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, borderWidth: 1, borderColor: colors.primary + '35' }}>
            <Icon name="trophy" size={22} color={colors.primary} />
          </View>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Тыкни ⭐ на упражнении чтобы добавить в избранное
          </Text>
        </View>
      );
    }
    if (searchQuery.length > 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Ничего не найдено
          </Text>
        </View>
      );
    }
    return null;
  }, [loadingExercises, muscleFilter, searchQuery, colors]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => { haptic.selection(); navigation.goBack(); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          style={styles.backBtn}
        >
          <Icon name="chev" size={22} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={[typography.h3, { color: colors.text }]}>Поиск упражнений</Text>
        <View style={styles.backBtn} />
      </View>
      <FlatList
        data={loadingExercises ? [] : filteredExercises}
        keyExtractor={keyExtractor}
        renderItem={renderExerciseCard}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '180deg' }] },
  searchInput: { height: 48, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  filterChip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
  emptyState: { alignItems: 'center', paddingVertical: spacing.huge },
  cardThumb: { width: 56, height: 56, borderRadius: borderRadius.sm },
});
