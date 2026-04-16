import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { useThemeStore } from '../../../store';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { localDateStr } from '../../../utils/date';

const todayDate = () => localDateStr(new Date());

function formatDisplayDate(dateStr: string): string {
  const today = todayDate();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = localDateStr(d);
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterday) return 'Вчера';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00'); // noon to avoid DST edge cases
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

interface Props {
  selectedDate: string;
  onChange: (date: string) => void;
}

export const DateNavigator: React.FC<Props> = ({ selectedDate, onChange }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const isToday = selectedDate === todayDate();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        onPress={() => { haptic.selection(); onChange(shiftDate(selectedDate, -1)); }}
        style={styles.btn}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
      >
        <Text style={[typography.h3, { color: colors.primary }]}>‹</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { if (!isToday) { haptic.selection(); onChange(todayDate()); } }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ alignItems: 'center' }}
      >
        <Text style={[typography.bodySemibold, { color: colors.text }]}>{formatDisplayDate(selectedDate)}</Text>
        {!isToday && (
          <Text style={[typography.caption, { color: colors.primary, textAlign: 'center', marginTop: 1 }]}>Вернуться к сегодня</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => { if (!isToday) { haptic.selection(); onChange(shiftDate(selectedDate, 1)); } }}
        style={styles.btn}
        disabled={isToday}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 12 }}
      >
        <Text style={[typography.h3, { color: isToday ? colors.textTertiary : colors.primary }]}>›</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: borderRadius.lg, borderWidth: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  btn: { padding: spacing.xs, minWidth: 32, alignItems: 'center' },
});
