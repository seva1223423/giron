import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { localDateStr } from '../../../utils/date';

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export function toDateStr(date: Date): string {
  return localDateStr(date);
}

export function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
  return days;
}

export function mondayWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}ч ${m}мин` : `${h}ч`;
}

interface Props {
  viewYear: number;
  viewMonth: number;
  todayStr: string;
  today: Date;
  workoutsByDate: Map<string, any[]>;
  planDays: Set<number>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onDayPress: (dateStr: string) => void;
}

export const CalendarGrid: React.FC<Props> = ({
  viewYear, viewMonth, todayStr, today, workoutsByDate, planDays, onPrevMonth, onNextMonth, onDayPress,
}) => {
  const colors = useThemeColors();
  const days = getDaysInMonth(viewYear, viewMonth);
  const leadingPad = mondayWeekday(days[0]);
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={onPrevMonth} style={styles.navBtn}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={[typography.h4, { color: colors.text }]}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={onNextMonth} style={styles.navBtn} disabled={isCurrentMonth}>
          <Text style={[typography.h3, { color: isCurrentMonth ? colors.textTertiary : colors.primary }]}>{'›'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={[styles.weekdayLabel, typography.captionMedium, { color: i >= 5 ? colors.textTertiary : colors.textSecondary }]}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.daysGrid}>
        {Array.from({ length: leadingPad }).map((_, i) => <View key={`pad-${i}`} style={styles.dayCell} />)}
        {days.map((day) => {
          const dateStr = toDateStr(day);
          const isToday = dateStr === todayStr;
          const hasWorkout = workoutsByDate.has(dateStr);
          const isFuture = day > today;
          const dow = mondayWeekday(day);
          const isPlanned = !hasWorkout && !isFuture && planDays.has(dow);
          const isFuturePlanned = isFuture && planDays.has(dow);
          const workoutCount = (workoutsByDate.get(dateStr) || []).length;

          let bgColor = 'transparent';
          if (hasWorkout) bgColor = colors.primary;
          else if (isPlanned) bgColor = colors.success + '30';
          else if (isFuturePlanned) bgColor = colors.primary + '20';

          return (
            <TouchableOpacity
              key={dateStr}
              style={[styles.dayCell, { backgroundColor: bgColor, borderWidth: isToday ? 2 : 0, borderColor: colors.primary, borderRadius: borderRadius.sm }]}
              onPress={() => onDayPress(dateStr)}
              disabled={!hasWorkout}
              activeOpacity={hasWorkout ? 0.7 : 1}
            >
              <Text style={[typography.captionMedium, { color: hasWorkout ? '#FFF' : isToday ? colors.primary : isFuture ? colors.textTertiary : colors.text, fontSize: 13 }]}>
                {day.getDate()}
              </Text>
              {workoutCount > 1 && (
                <View style={[styles.countBadge, { backgroundColor: '#FFF' }]}>
                  <Text style={{ fontSize: 8, color: colors.primary, fontWeight: '700' }}>{workoutCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.legend}>
        {[
          { color: colors.primary, label: 'Тренировка' },
          { color: colors.success + '50', label: 'Пропущена' },
          { color: colors.primary + '30', label: 'Запланирована' },
        ].map(({ color, label }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={[typography.small, { color: colors.textSecondary }]}>{label}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  navBtn: { width: 36, alignItems: 'center' },
  weekdayRow: { flexDirection: 'row', marginBottom: spacing.sm },
  weekdayLabel: { flex: 1, textAlign: 'center', fontSize: 11 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  countBadge: { position: 'absolute', top: 3, right: 3, width: 12, height: 12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});
