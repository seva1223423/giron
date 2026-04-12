import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, useWindowDimensions } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { Button } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import type { WeekPlanEntry } from '../../../store/useWorkoutStore';
import { exercises as localExercises } from '../../../data/exercises';

const DAY_LABELS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

const WORKOUT_TEMPLATES: WeekPlanEntry[] = [
  { name: 'Грудь + Трицепс', emoji: '◎', exercises: ['bench-press', 'incline-bench-press', 'dumbbell-fly', 'tricep-pushdown'] },
  { name: 'Спина + Бицепс', emoji: '◉', exercises: ['barbell-row', 'lat-pulldown', 'pull-ups', 'barbell-curl'] },
  { name: 'Ноги', emoji: '◎', exercises: ['squat', 'leg-press', 'romanian-deadlift', 'leg-curl', 'calf-raise'] },
  { name: 'Плечи + Пресс', emoji: '◧', exercises: ['overhead-press', 'lateral-raise', 'plank', 'cable-crunch'] },
  { name: 'Фулбоди', emoji: '◈', exercises: ['squat', 'bench-press', 'barbell-row', 'overhead-press', 'barbell-curl'] },
  { name: 'Тяжёлая спина', emoji: '◎', exercises: ['deadlift', 'barbell-row', 'lat-pulldown', 'pull-ups'] },
  { name: 'Руки', emoji: '◎', exercises: ['barbell-curl', 'hammer-curl', 'tricep-pushdown', 'french-press'] },
];

const CARDIO_TEMPLATES: WeekPlanEntry[] = [
  { name: 'Бег', emoji: '◑', exercises: [], type: 'cardio' },
  { name: 'Велосипед', emoji: '◑', exercises: [], type: 'cardio' },
  { name: 'HIIT', emoji: '◈', exercises: [], type: 'cardio' },
  { name: 'Ходьба', emoji: '◑', exercises: [], type: 'cardio' },
  { name: 'Плавание', emoji: '◑', exercises: [], type: 'cardio' },
  { name: 'Кардио день', emoji: '◑', exercises: [], type: 'cardio' },
];

// Keep for export compatibility
const TEMPLATES: WeekPlanEntry[] = [...WORKOUT_TEMPLATES, ...CARDIO_TEMPLATES];

export { TEMPLATES };

interface Props {
  pickerDay: number | null;
  weekPlan: Record<number, WeekPlanEntry | null>;
  allExercises: { id: string; name: string }[];
  userTemplateEntries: WeekPlanEntry[];
  onSelect: (template: WeekPlanEntry | null) => void;
  onClose: () => void;
}

export const DayPickerModal: React.FC<Props> = ({ pickerDay, weekPlan, allExercises, userTemplateEntries, onSelect, onClose }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { height: screenHeight } = useWindowDimensions();

  const TemplateRow: React.FC<{ template: WeekPlanEntry; exercises: { id: string; name: string }[] }> = ({ template, exercises }) => {
    const isActive = pickerDay !== null && weekPlan[pickerDay]?.name === template.name;
    return (
      <TouchableOpacity onPress={() => { haptic.selection(); onSelect(template); }} style={[styles.row, { borderBottomColor: colors.divider }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 18 }}>{template.emoji}</Text>
            <Text style={[typography.body, { color: isActive ? colors.primary : colors.text }]} numberOfLines={1}>{template.name}</Text>
          </View>
          {template.exercises.length > 0 && (
            <Text style={[typography.caption, { color: colors.textTertiary, marginTop: 2 }]} numberOfLines={1}>
              {template.exercises.slice(0, 3).map((id) => exercises.find((e) => e.id === id)?.name).filter(Boolean).join(', ')}
            </Text>
          )}
        </View>
        {isActive && <Text style={{ color: colors.primary }}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={pickerDay !== null} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.lg }]}>
            {pickerDay !== null ? DAY_LABELS_FULL[pickerDay] : ''}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Math.min(400, screenHeight * 0.55) }}>
            <TouchableOpacity onPress={() => { haptic.selection(); onSelect(null); }} style={[styles.row, { borderBottomColor: colors.divider }]}>
              <Text style={[typography.body, { color: colors.textSecondary }]}>Отдых</Text>
              {pickerDay !== null && !weekPlan[pickerDay] && <Text style={{ color: colors.primary }}>✓</Text>}
            </TouchableOpacity>

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>СИЛОВЫЕ</Text>
            {WORKOUT_TEMPLATES.map((t) => <TemplateRow key={t.name} template={t} exercises={localExercises} />)}

            <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>КАРДИО</Text>
            {CARDIO_TEMPLATES.map((t) => <TemplateRow key={t.name} template={t} exercises={localExercises} />)}

            {userTemplateEntries.length > 0 && (
              <>
                <Text style={[typography.captionMedium, { color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm }]}>МОИ ШАБЛОНЫ</Text>
                {userTemplateEntries.map((t) => <TemplateRow key={t.name} template={t} exercises={allExercises} />)}
              </>
            )}
          </ScrollView>
          <Button title="Отмена" variant="ghost" onPress={onClose} fullWidth style={{ marginTop: spacing.md }} />
        </View>
      </View>
    </Modal>
  );
};

const styles = {
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' as const },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.xl, paddingBottom: 48 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: spacing.md, borderBottomWidth: 1 },
};
