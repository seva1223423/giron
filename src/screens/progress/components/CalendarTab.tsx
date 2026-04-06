import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
import { Card, FadeIn } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { Workout } from '../../../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CELL_SIZE = (SCREEN_WIDTH - spacing.xl * 2) / 7;

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface CalendarTabProps {
  colors: any;
  workoutHistory: Workout[];
}

function getCalendarData(monthDate: Date, workoutHistory: Workout[]) {
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
    const hasWorkout = workoutHistory.some(
      (w) => w.completedAt && w.completedAt.startsWith(dateStr)
    );
    const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
    days.push({ date: d, dateStr, hasWorkout, isToday });
  }

  return days;
}

export const CalendarTab: React.FC<CalendarTabProps> = ({ colors, workoutHistory }) => {
  const haptic = useHaptic();
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const calDays = getCalendarData(calendarMonth, workoutHistory);
  const monthStr = `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`;
  const monthWorkouts = workoutHistory.filter((w) => w.completedAt && w.completedAt.startsWith(monthStr));
  const monthVolume = monthWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0);
  const monthDuration = monthWorkouts.reduce((s, w) => s + (w.durationMinutes || 0), 0);
  const selectedDayWorkouts = selectedDay
    ? workoutHistory.filter((w) => w.completedAt && w.completedAt.startsWith(selectedDay))
    : [];

  const goToPrevMonth = () => {
    haptic.selection();
    setSelectedDay(null);
    setCalendarMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() - 1);
      return d;
    });
  };

  const goToNextMonth = () => {
    const now = new Date();
    if (calendarMonth.getFullYear() === now.getFullYear() && calendarMonth.getMonth() === now.getMonth()) return;
    haptic.selection();
    setSelectedDay(null);
    setCalendarMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + 1);
      return d;
    });
  };

  const isCurrentMonth =
    calendarMonth.getFullYear() === new Date().getFullYear() &&
    calendarMonth.getMonth() === new Date().getMonth();

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

      {selectedDay && selectedDayWorkouts.length > 0 && (
        <FadeIn delay={0}>
          <Card style={{ marginTop: spacing.xl }}>
            <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                weekday: 'long',
              })}
            </Text>
            {selectedDayWorkouts.map((w, i) => (
              <View
                key={w.id}
                style={[
                  { paddingVertical: spacing.md },
                  i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
                ]}
              >
                <Text style={[typography.bodySemibold, { color: colors.text }]}>{w.name}</Text>
                <Text style={[typography.small, { color: colors.textSecondary, marginTop: 2 }]}>
                  {w.exercises.length} упр.
                  {w.durationMinutes ? ` · ${w.durationMinutes} мин` : ''}
                  {w.totalVolume ? ` · ${Math.round(w.totalVolume)} кг` : ''}
                </Text>
                {w.exercises.length > 0 && (
                  <Text style={[typography.caption, { color: colors.textTertiary, marginTop: spacing.xs }]}>
                    {w.exercises.map((ex) => ex.exercise.name).join(', ')}
                  </Text>
                )}
              </View>
            ))}
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={150}>
        <Card style={{ marginTop: spacing.xl }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            {MONTH_NAMES[calendarMonth.getMonth()]}
          </Text>
          {monthWorkouts.length === 0 ? (
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Нет тренировок за этот месяц
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={[typography.number, { color: colors.primary }]}>{monthWorkouts.length}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>тренировок</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={[typography.number, { color: colors.accent }]}>{Math.round(monthVolume)}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>кг объём</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={[typography.number, { color: colors.success }]}>{monthDuration}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>минут</Text>
              </View>
            </View>
          )}
        </Card>
      </FadeIn>
    </>
  );
};

const styles = StyleSheet.create({
  monthNavBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  calendarHeader: { flexDirection: 'row', marginBottom: spacing.sm },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  workoutDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
