import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeColors, useWorkoutStore } from '../../../store';
import { Icon, HitTarget } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { exercises as localExercises } from '../../../data/exercises';
import { Exercise } from '../../../types';
import { CreateExerciseModal } from './CreateExerciseModal';

const MUSCLE_LABEL_MAP: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', lats: 'Широчайшие', lower_back: 'Нижняя спина',
  shoulders: 'Плечи', traps: 'Трапеции', biceps: 'Бицепс', triceps: 'Трицепс',
  forearms: 'Предплечья', quadriceps: 'Квадрицепс', hamstrings: 'Задняя поверхность',
  glutes: 'Ягодицы', calves: 'Икры', abs: 'Пресс', obliques: 'Косые мышцы',
  hip_flexors: 'Сгибатели бедра', full_body: 'Всё тело',
};

const MUSCLE_FILTERS = [
  { key: 'all', label: 'Все' }, { key: 'chest', label: 'Грудь' }, { key: 'back', label: 'Спина' },
  { key: 'shoulders', label: 'Плечи' }, { key: 'biceps', label: 'Бицепс' },
  { key: 'triceps', label: 'Трицепс' }, { key: 'quadriceps', label: 'Ноги' }, { key: 'abs', label: 'Пресс' },
];

const EQUIPMENT_FILTERS = [
  { key: 'all', label: 'Всё' }, { key: 'barbell', label: 'Штанга' },
  { key: 'dumbbell', label: 'Гантели' }, { key: 'bodyweight', label: 'Своё тело' },
  { key: 'cable', label: 'Блок' }, { key: 'machine', label: 'Тренажёр' }, { key: 'cardio', label: 'Кардио' },
];

interface Props {
  selectedIds: Set<string>;
  onToggle: (exercise: Exercise) => void;
  onNext: () => void;
  onCancel: () => void;
}

export const ExerciseSelectStep: React.FC<Props> = ({ selectedIds, onToggle, onNext, onCancel }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  const { customExercises, deleteCustomExercise } = useWorkoutStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [equipmentFilter, setEquipmentFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const allExercises = useMemo(() => [...customExercises, ...localExercises], [customExercises]);

  const filteredExercises = useMemo(() =>
    allExercises.filter((ex) => {
      const matchesSearch = searchQuery ? ex.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
      const matchesMuscle = muscleFilter === 'all' ? true : ex.primaryMuscles.includes(muscleFilter as any);
      const matchesEquipment = equipmentFilter === 'all' ? true : ex.type === equipmentFilter;
      return matchesSearch && matchesMuscle && matchesEquipment;
    }),
    [allExercises, searchQuery, muscleFilter, equipmentFilter]
  );

  // Derive the selected exercises (in original add order) for the bottom chip strip.
  const selectedExerciseList = useMemo(
    () => allExercises.filter((ex) => selectedIds.has(ex.id)),
    [allExercises, selectedIds]
  );

  const canProceed = selectedIds.size > 0;

  const handleDeleteCustom = (id: string, name: string) => {
    Alert.alert('Удалить упражнение', `Удалить «${name}»?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => { deleteCustomExercise(id); haptic.medium(); } },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity onPress={onCancel} hitSlop={8} accessibilityRole="button" accessibilityLabel="Отмена">
          <Text style={[typography.bodySemibold, { color: colors.textSecondary }]}>Отмена</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary }]}>01 · УПРАЖНЕНИЯ</Text>
          <Text style={[typography.h4, { color: colors.text, marginTop: 2 }]} numberOfLines={1}>Выбери упражнения</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowCreateModal(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Создать своё упражнение"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}
        >
          <Icon name="plus" size={16} color={colors.primary} />
          <Text style={[typography.bodySemibold, { color: colors.primary }]}>Своё</Text>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
        <TextInput
          style={[styles.searchInput, typography.body, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Поиск упражнений..."
          placeholderTextColor={colors.inputPlaceholder}
        />
        {(searchQuery || muscleFilter !== 'all' || equipmentFilter !== 'all') && (
          <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs, textAlign: 'right' }]}>
            {filteredExercises.length} упражнений
          </Text>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.xs }}>
        {MUSCLE_FILTERS.map((f) => (
          <TouchableOpacity key={f.key} onPress={() => { haptic.selection(); setMuscleFilter(f.key); }}
            style={[styles.chip, { backgroundColor: muscleFilter === f.key ? colors.primary : colors.surface, borderColor: muscleFilter === f.key ? colors.primary : colors.border }]}>
            <Text style={[typography.captionMedium, { color: muscleFilter === f.key ? colors.textInverse : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.md }}>
        {EQUIPMENT_FILTERS.map((f) => (
          <TouchableOpacity key={f.key} onPress={() => { haptic.selection(); setEquipmentFilter(f.key); }}
            style={[styles.chip, { backgroundColor: equipmentFilter === f.key ? colors.accent : colors.surface, borderColor: equipmentFilter === f.key ? colors.accent : colors.border }]}>
            <Text style={[typography.captionMedium, { color: equipmentFilter === f.key ? colors.textInverse : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.lg }}>
        {filteredExercises.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: spacing.huge, paddingHorizontal: spacing.xl }}>
            <Icon name="search" size={48} color={colors.textSecondary} />
            <Text style={[typography.h4, { color: colors.text, marginTop: spacing.lg, textAlign: 'center' }]}>Ничего не найдено</Text>
            <Text style={[typography.small, { color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' }]}>
              Попробуй другой фильтр или поиск
            </Text>
          </View>
        ) : filteredExercises.map((ex) => {
          const selected = selectedIds.has(ex.id);
          const isCustom = ex.id.startsWith('custom-');
          return (
            <TouchableOpacity
              key={ex.id}
              onPress={() => onToggle(ex)}
              onLongPress={() => isCustom && handleDeleteCustom(ex.id, ex.name)}
              style={[
                styles.exerciseItem,
                {
                  backgroundColor: selected ? colors.primary + '15' : colors.card,
                  borderColor: selected ? colors.primary : colors.card,
                  borderWidth: selected ? 2 : 1.5,
                  shadowColor: selected ? colors.primary : 'transparent',
                  shadowOpacity: selected ? 0.15 : 0,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 0 },
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]} numberOfLines={1}>{ex.name}</Text>
                  {isCustom && (
                    <View style={{ backgroundColor: colors.accent + '25', borderRadius: borderRadius.full, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={[typography.metaLabel, { color: colors.accent }]}>МОЁ</Text>
                    </View>
                  )}
                </View>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {ex.primaryMuscles.map((m) => MUSCLE_LABEL_MAP[m] || m).join(', ')}
                </Text>
              </View>
              <View style={[styles.checkCircle, { backgroundColor: selected ? colors.primary : 'transparent', borderColor: selected ? colors.primary : colors.border }]}>
                {selected && <Icon name="check" size={14} color={colors.textInverse} strokeWidth={3} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Sticky-bottom action bar — primary CTA in thumb zone (§19) */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -2 },
            elevation: 8,
          },
        ]}
      >
        {selectedExerciseList.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingVertical: spacing.sm }}
          >
            {selectedExerciseList.map((ex) => (
              <TouchableOpacity
                key={`chip-${ex.id}`}
                onPress={() => { haptic.selection(); onToggle(ex); }}
                style={[styles.selectedChip, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '60' }]}
                accessibilityRole="button"
                accessibilityLabel={`Убрать ${ex.name}`}
              >
                <Text style={[typography.captionMedium, { color: colors.primary }]} numberOfLines={1}>{ex.name}</Text>
                <View style={{ transform: [{ rotate: '45deg' }] }}>
                  <Icon name="plus" size={12} color={colors.primary} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, paddingTop: selectedExerciseList.length > 0 ? spacing.xs : spacing.md }}>
          <TouchableOpacity
            onPress={() => { if (canProceed) { haptic.medium(); onNext(); } }}
            disabled={!canProceed}
            accessibilityRole="button"
            accessibilityLabel={canProceed ? `Далее. Выбрано ${selectedIds.size}` : 'Выбери хотя бы одно упражнение'}
            accessibilityState={{ disabled: !canProceed }}
            style={[
              styles.nextButton,
              {
                backgroundColor: canProceed ? colors.primary : colors.textTertiary,
                opacity: canProceed ? 1 : 0.4,
                shadowColor: canProceed ? colors.primary : 'transparent',
                shadowOpacity: 0.35,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 0 },
                elevation: canProceed ? 6 : 0,
              },
            ]}
          >
            <Text style={[typography.button, { color: colors.textInverse }]}>
              Далее{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <CreateExerciseModal visible={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1, gap: spacing.md },
  searchInput: { height: 44, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
  exerciseItem: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: borderRadius.lg, marginBottom: spacing.sm },
  checkCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  bottomBar: { borderTopWidth: 1 },
  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1, maxWidth: 200 },
  nextButton: { height: 56, borderRadius: borderRadius.xl, alignItems: 'center', justifyContent: 'center' },
});
