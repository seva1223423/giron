import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Modal, StyleSheet, Alert } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useSafeTop } from '../../../hooks/useSafeTop';
import { useThemeColors, useWorkoutStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { Exercise } from '../../../types';

const MUSCLE_OPTIONS = [
  { key: 'chest', label: 'Грудь' }, { key: 'back', label: 'Спина' },
  { key: 'shoulders', label: 'Плечи' }, { key: 'biceps', label: 'Бицепс' },
  { key: 'triceps', label: 'Трицепс' }, { key: 'quadriceps', label: 'Квадрицепс' },
  { key: 'hamstrings', label: 'Задняя поверхность' }, { key: 'glutes', label: 'Ягодицы' },
  { key: 'abs', label: 'Пресс' }, { key: 'calves', label: 'Икры' },
  { key: 'lats', label: 'Широчайшие' }, { key: 'traps', label: 'Трапеции' },
  { key: 'full_body', label: 'Всё тело' },
];

const EQUIPMENT_OPTIONS = [
  { key: 'barbell', label: 'Штанга' }, { key: 'dumbbell', label: 'Гантели' },
  { key: 'bodyweight', label: 'Без снаряжения' }, { key: 'cable', label: 'Блок' },
  { key: 'machine', label: 'Тренажёр' }, { key: 'cardio', label: 'Кардио' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const CreateExerciseModal: React.FC<Props> = ({ visible, onClose }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  const { addCustomExercise } = useWorkoutStore();
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('chest');
  const [equipment, setEquipment] = useState('barbell');

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Введи название', 'Название упражнения не может быть пустым');
      return;
    }
    const exercise: Exercise = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: '',
      category: 'strength' as any,
      primaryMuscles: [muscle as any],
      secondaryMuscles: [],
      type: equipment as any,
      difficulty: 'beginner',
      instructions: [],
    };
    addCustomExercise(exercise);
    haptic.success();
    setName('');
    setMuscle('chest');
    setEquipment('barbell');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: safeTop }]}>
          <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Отмена">
            <Text style={[typography.bodySemibold, { color: colors.textSecondary }]}>Отмена</Text>
          </TouchableOpacity>
          <Text style={[typography.h4, { color: colors.text }]}>Новое упражнение</Text>
          <TouchableOpacity onPress={handleSave} hitSlop={8} accessibilityRole="button" accessibilityLabel="Сохранить">
            <Text style={[typography.bodySemibold, { color: colors.primary }]}>Сохранить</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.xl }}>
          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginBottom: spacing.sm }]}>НАЗВАНИЕ</Text>
          <TextInput
            style={[styles.input, typography.body, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.inputText, marginBottom: spacing.xl }]}
            value={name}
            onChangeText={setName}
            placeholder="Название упражнения"
            placeholderTextColor={colors.inputPlaceholder}
            autoFocus
          />

          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginBottom: spacing.sm }]}>ГРУППА МЫШЦ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.xl }}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {MUSCLE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setMuscle(opt.key)}
                  style={[styles.chip, { backgroundColor: muscle === opt.key ? colors.primary : colors.surface, borderColor: muscle === opt.key ? colors.primary : colors.border }]}
                >
                  <Text style={[typography.captionMedium, { color: muscle === opt.key ? colors.textInverse : colors.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[typography.metaLabel, { color: colors.textSecondary, marginBottom: spacing.sm }]}>СНАРЯЖЕНИЕ</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {EQUIPMENT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setEquipment(opt.key)}
                  style={[styles.chip, { backgroundColor: equipment === opt.key ? colors.accent : colors.surface, borderColor: equipment === opt.key ? colors.accent : colors.border }]}
                >
                  <Text style={[typography.captionMedium, { color: equipment === opt.key ? colors.textInverse : colors.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: spacing.md, paddingHorizontal: spacing.xl, borderBottomWidth: 1 },
  input: { height: 48, borderRadius: borderRadius.md, borderWidth: 1, paddingHorizontal: spacing.lg },
  chip: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
});
