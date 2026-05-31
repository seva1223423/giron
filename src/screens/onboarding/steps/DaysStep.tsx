import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const DAYS = [
  { index: 0, label: 'Понедельник', short: 'Пн' },
  { index: 1, label: 'Вторник', short: 'Вт' },
  { index: 2, label: 'Среда', short: 'Ср' },
  { index: 3, label: 'Четверг', short: 'Чт' },
  { index: 4, label: 'Пятница', short: 'Пт' },
  { index: 5, label: 'Суббота', short: 'Сб' },
  { index: 6, label: 'Воскресенье', short: 'Вс' },
];

interface Props {
  selectedDays: number[];
  onToggle: (dayIndex: number) => void;
}

export const DaysStep: React.FC<Props> = ({ selectedDays, onToggle }) => {
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      <Text style={[typography.h2, { color: colors.text, marginBottom: spacing.sm }]}>Дни тренировок</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginBottom: spacing.xl }]}>
        Выбери дни, в которые планируешь тренироваться. Это поможет составить недельный план.
      </Text>

      <View style={styles.daysGrid}>
        {DAYS.map((day) => {
          const selected = selectedDays.includes(day.index);
          return (
            <TouchableOpacity
              key={day.index}
              activeOpacity={0.7}
              onPress={() => onToggle(day.index)}
              style={[
                styles.dayChip,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <Text style={[typography.h4, { color: selected ? '#FFF' : colors.text }]}>{day.short}</Text>
              <Text style={[typography.caption, { color: selected ? '#FFF' + 'CC' : colors.textSecondary, marginTop: 2 }]} numberOfLines={1}>{day.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.hint}>
        <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center' }]}>
          {selectedDays.length === 0
            ? 'Выбери хотя бы 1 день'
            : selectedDays.length <= 2
              ? `${selectedDays.length} дн. — подходит для новичков`
              : selectedDays.length <= 4
                ? `${selectedDays.length} дн. — оптимально для большинства`
                : `${selectedDays.length} дн. — для продвинутых, следи за восстановлением`}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl },
  daysGrid: { gap: spacing.sm },
  dayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  hint: { marginTop: spacing.xl },
});
