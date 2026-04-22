import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { SelectedDayCard } from './SelectedDayCard';
import { MonthStatsCard } from './MonthStatsCard';
import type { Workout } from '../../../types';
import { localDateStr } from '../../../utils/date';


const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface CalendarTabProps {
  colors: any;
  workoutHistory: Workout[];
}

// Accepts a pre-built Set for O(1) per-cell lookup instead of O(n) .some()
function getCalendarData(monthDate: Date, completedDateSet: Set<string>) {
  const now = new Date();
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: { date: number; dateStr: string; hasWorkout: boolean; isToday: boolean }[] = [];

  let startDow = firstDay.getDay();
  if (startDow === 0) startDow = 7;
  for (let i = 1; i < startDow; i++) {
    days.push({ date: 0, dateStr: '', hasWorkout: false, isToday: false });
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasWorkout = completedDateSet.has(dateStr);
    const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
    days.push({ date: d, dateStr, hasWorkout, isToday });
  }

  return days;
}

export const CalendarTab: React.FC<CalendarTabProps> = ({ colors, workoutHistory }) => {
  const { width: screenWidth } = useWindowDimensions();
  const CELL_SIZE = (screenWidth - spacing.xl * 2) / 7;
  const haptic = useHaptic();
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Build Set once per workoutHistory change; getCalendarData uses O(1) lookups
  const completedDateSet = useMemo(
    () => new Set(workoutHistory.flatMap((w) => w.completedAt ? [localDateStr(new Date(w.completedAt))] : [])),
    [workoutHistory],
  );

  const calDays = useMemo(
    () => getCalendarData(calendarMonth, completedDateSet),
    [calendarMonth, completedDateSet],
  );
  const monthStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthWorkouts = workoutHistory.filter((w) => w.completedAt && localDateStr(new Date(w.completedAt)).startsWith(monthStr));
  const selectedDayWorkouts = selectedDay
    ? workoutHistory.filter((w) => w.completedAt && localDateStr(new Date(w.completedAt)) === selectedDay)
    : [];

  const isCurrentMonth =
    calendarMonth.getFullYear() === new Date().getFullYear() &&
    calendarMonth.getMonth() === new Date().getMonth();

  const goToPrevMonth = () => {
    haptic.selection();
    setSelectedDay(null);
    setCalendarMonth((prev) => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; });
  };

  const goToNextMonth = () => {
    if (isCurrentMonth) return;
    haptic.selection();
    setSelectedDay(null);
    setCalendarMonth((prev) => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; });
  };

  return (
    <>
      <FadeIn delay={0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <TouchableOpacity onPress={goToPrevMonth} style={styles.monthNavBtn}>
            <Text style={[typography.h4, { color: colors.primary }]}>‹</Text>
          </TouchableOpacity>
          <Text style={[typography.h4, { color: colors.text }]}>
            {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
          </Text>
          <TouchableOpacity
            onPress={goToNextMonth}
            style={[styles.monthNavBtn, isCurrentMonth && { opacity: 0.3 }]}
            disabled={isCurrentMonth}
          >
            <Text style={[typography.h4, { color: colors.primary }]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.calendarHeader}>
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
            <Text key={d} style={[typography.captionMedium, { color: colors.textSecondary, width: CELL_SIZE, textAlign: 'center' }]}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {calDays.map((day, i) => {
            const isSelected = day.dateStr && selectedDay === day.dateStr;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => {
                  if (!day.date || !day.hasWorkout) return;
                  haptic.selection();
                  setSelectedDay(isSelected ? null : day.dateStr);
                }}
                activeOpacity={day.hasWorkout ? 0.7 : 1}
                style={[
                  styles.calendarCell,
                  { width: CELL_SIZE, height: CELL_SIZE },
                  day.isToday && { borderWidth: 2, borderColor: colors.primary },
                  day.hasWorkout && { backgroundColor: isSelected ? colors.success + '60' : colors.success + '30' },
                  isSelected && { borderWidth: 2, borderColor: colors.success },
                ]}
              >
                {day.date > 0 && (
                  <>
                    <Text style={[typography.smallMedium, { color: day.hasWorkout ? colors.success : colors.text }]}>
                      {day.date}
                    </Text>
                    {day.hasWorkout && (
                      <View style={[styles.workoutDot, { backgroundColor: colors.success }]} />
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </FadeIn>

      {selectedDay && (
        <SelectedDayCard selectedDay={selectedDay} workouts={selectedDayWorkouts} colors={colors} />
      )}

      <MonthStatsCard monthDate={calendarMonth} workouts={monthWorkouts} colors={colors} />
    </>
  );
};

const styles = StyleSheet.create({
  monthNavBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  calendarHeader: { flexDirection: 'row', marginBottom: spacing.sm },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  workoutDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
