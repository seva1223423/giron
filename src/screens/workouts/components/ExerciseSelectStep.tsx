import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeStore, useWorkoutStore } from '../../../store';
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
  const { colors } = useThemeStore();
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

  const handleDeleteCustom = (id: string, name: string) => {
    Alert.alert('Удалить упражнение', `Удалить «${name}»?`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => { deleteCustomExercise(id); haptic.medium(); } },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: safeTop }]}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={[typography.bodySemibold, { color: colors.error }]}>Отмена</Text>
        </TouchableOpacity>
        <Text style={[typography.h4, { color: colors.text }]}>Выбери упражнения</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <TouchableOpacity onPress={() => setShowCreateModal(true)}>
            <Text style={[typography.bodySemibold, { color: colors.accent }]}>+ Своё</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => selectedIds.size > 0 && onNext()}>
            <Text style={[typography.bodySemibold, { color: selectedIds.size > 0 ? colors.primary : colors.textTertiary }]}>
              Далее ({selectedIds.size})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.md }}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText }]}
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
            <Text style={[typography.captionMedium, { color: muscleFilter === f.key ? '#FFF' : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.md }}>
        {EQUIPMENT_FILTERS.map((f) => (
          <TouchableOpacity key={f.key} onPress={() => { haptic.selection(); setEquipmentFilter(f.key); }}
            style={[styles.chip, { backgroundColor: equipmentFilter === f.key ? colors.accent : colors.surface, borderColor: equipmentFilter === f.key ? colors.accent : colors.border }]}>
            <Text style={[typography.captionMedium, { color: equipmentFilter === f.key ? '#FFF' : colors.text }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.huge }}>
        {filteredExercises.map((ex) => {
          const selected = selectedIds.has(ex.id);
          const isCustom = ex.id.startsWith('custom-');
          return (
            <TouchableOpacity
              key={ex.id}
              onPress={() => onToggle(ex)}
              onLongPress={() => isCustom && handleDeleteCustom(ex.id, ex.name)}
              style={[styles.exerciseItem, { backgroundColor: selected ? colors.primary + '10' : colors.card, borderColor: selected ? colors.primary : colors.card }]}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Text style={[typography.bodySemibold, { color: colors.text, flex: 1 }]} numberOfLines={1}>{ex.name}</Text>
                  {isCustom && (
                    <View style={{ backgroundColor: colors.accent + '25', borderRadius: borderRadius.full, paddingHorizontal: 6, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 10, color: colors.accent, fontWeight: '600' }}>МОЁ</Text>
                    </View>
                  )}
                </View>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  {ex.primaryMuscles.map((m) => MUSCLE_LABEL_MAP[m] || m).join(', ')}
                </Text>
              </View>
              <View style={[styles.checkCircle, { backgroundColor: selected ? colors.primary : 'transparent', borderColor: selected ? colors.primary : colors.border }]}>
                {selected && <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <CreateExerciseModal visible={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  searchInput: { height: 44, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg, fontSize: 16 },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
  exerciseItem: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: borderRadius.lg, borderWidth: 1.5, marginBottom: spacing.sm },
  checkCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
