import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, TextInput, StyleSheet, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeColors } from '../../../store';
import { Card, Spinner } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { exercises as localExercises } from '../../../data/exercises';
import { Exercise } from '../../../types';
import { workoutService } from '../../../services';
import { exerciseThumbSource } from '../../../config/store';

const FAVORITES_KEY = 'giron_exercise_favorites';

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

export const ExercisesTab: React.FC<Props> = ({ navigation }) => {
  const haptic = useHaptic();
  const colors = useThemeColors();
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

  // Posters are now bundled with the app (see assets/exercise-videos/), so there's
  // nothing to prefetch at runtime — they're already unpacked alongside the APK.

  // Round 274: include `haptic` in deps. Previously empty deps closed
  // over the initial haptic ref — currently fine because useHaptic
  // returns a stable object, but if it ever loosens to a fresh-object
  // each render the callback would silently reference a stale haptic.
  // Pinning the dep makes the safety contract explicit.
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
          >
            {thumb !== undefined ? (
              <Image source={thumb} style={styles.cardThumb} />
            ) : (
              <View style={[styles.cardThumb, styles.cardThumbPlaceholder]}>
                <Text style={styles.cardThumbPlaceholderIcon}>{ex.type === 'cardio' ? '🏃' : '💪'}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{ex.name}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
                {ex.primaryMuscles.join(', ')} {ex.type ? `\u2022 ${ex.type}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleFavorite(ex.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ paddingLeft: spacing.md }}
            accessibilityLabel={isFav ? 'Убрать из избранного' : 'Добавить в избранное'}
          >
            <Text style={[typography.h4, { color: isFav ? colors.error : colors.textTertiary }]}>
              {isFav ? '●' : '○'}
            </Text>
          </TouchableOpacity>
        </View>
      </Card>
    );
  }, [favoriteIds, colors, navigation, toggleFavorite, haptic]);

  const keyExtractor = useCallback((ex: Exercise) => ex.id, []);

  const listHeader = useMemo(() => (
    <View style={{ padding: spacing.xl, paddingBottom: 0 }}>
      <TextInput
        style={[styles.searchInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Поиск упражнений..."
        placeholderTextColor={colors.inputPlaceholder}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.sm }}>
        {MUSCLE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { haptic.selection(); setMuscleFilter(f.key); }}
            style={[styles.filterChip, { backgroundColor: muscleFilter === f.key ? colors.primary : colors.surface, borderColor: muscleFilter === f.key ? colors.primary : colors.border }]}
          >
            <Text style={[typography.captionMedium, { color: muscleFilter === f.key ? '#FFF' : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.lg }}>
        {EQUIPMENT_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => { haptic.selection(); setEquipmentFilter(f.key); }}
            style={[styles.filterChip, { backgroundColor: equipmentFilter === f.key ? colors.accent : colors.surface, borderColor: equipmentFilter === f.key ? colors.accent : colors.border }]}
          >
            <Text style={[typography.captionMedium, { color: equipmentFilter === f.key ? '#FFF' : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={[typography.small, { color: colors.textSecondary, marginBottom: spacing.md }]}>
        {filteredExercises.length} упражнений
      </Text>
    </View>
  ), [searchQuery, muscleFilter, equipmentFilter, colors, filteredExercises.length]);

  const listEmpty = useMemo(() => {
    if (loadingExercises) {
      return <View style={{ marginTop: spacing.xl, alignItems: 'center' }}><Spinner color={colors.primary} size={32} /></View>;
    }
    if (muscleFilter === 'favorites') {
      return (
        <View style={styles.emptyState}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.primary + '35' }}><Text style={[typography.h3, { color: colors.primary }]}>●</Text></View>
          <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
            Нажмите {'●'} на упражнении, чтобы добавить в избранное
          </Text>
        </View>
      );
    }
    return null;
  }, [loadingExercises, muscleFilter, colors]);

  return (
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
    />
  );
};

const styles = StyleSheet.create({
  searchInput: { height: 44, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 16, marginBottom: spacing.md },
  filterChip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
  emptyState: { alignItems: 'center', paddingVertical: spacing.huge },
  cardThumb: { width: 56, height: 56, borderRadius: borderRadius.sm, backgroundColor: '#0F0F1A' },
  cardThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  cardThumbPlaceholderIcon: { fontSize: 22, opacity: 0.6 },
});
