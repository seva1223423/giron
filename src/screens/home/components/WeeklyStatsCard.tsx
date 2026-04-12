import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useThemeStore } from '../../../store';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { Workout } from '../../../types';

interface Props {
  workoutHistory: Workout[];
  weekPlan: Record<number, { name: string; emoji: string; exercises: string[] } | null>;
  streak: number;
  navigation: any;
}

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export const WeeklyStatsCard: React.FC<Props> = ({ workoutHistory, weekPlan, streak, navigation }) => {
  const { colors } = useThemeStore();

  const weekWorkouts = useMemo(() => workoutHistory.filter((w) => {
    if (!w.completedAt) return false;
    return new Date(w.completedAt) >= new Date(Date.now() - 7 * 86400000);
  }), [workoutHistory]);

  const prevWeekWorkouts = useMemo(() => workoutHistory.filter((w) => {
    if (!w.completedAt) return false;
    const d = new Date(w.completedAt);
    return d >= new Date(Date.now() - 14 * 86400000) && d < new Date(Date.now() - 7 * 86400000);
  }), [workoutHistory]);

  const weekVolume = useMemo(() => weekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0), [weekWorkouts]);
  const prevWeekVolume = useMemo(() => prevWeekWorkouts.reduce((s, w) => s + (w.totalVolume || 0), 0), [prevWeekWorkouts]);
  const volumeDeltaPct = prevWeekVolume > 0
    ? Math.round(((weekVolume - prevWeekVolume) / prevWeekVolume) * 100)
    : null;

  const weekAdherence = useMemo(() => {
    const now = new Date();
    const currentDow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() - currentDow);
    mondayDate.setHours(0, 0, 0, 0);

    let planned = 0;
    let done = 0;
    for (let i = 0; i <= 6; i++) {
      if (!weekPlan[i]) continue;
      planned++;
      if (i > currentDow) continue;
      const dayDate = new Date(mondayDate);
      dayDate.setDate(mondayDate.getDate() + i);
      const dayStr = dayDate.toISOString().split('T')[0];
      if (workoutHistory.some((w) => w.completedAt?.startsWith(dayStr))) done++;
    }
    return { planned, done, pastPlanned: Math.min(planned, currentDow + 1) };
  }, [weekPlan, workoutHistory]);

  const now = new Date();
  const currentDow = now.getDay() === 0 ? 6 : now.getDay() - 1;

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <Text style={[typography.h4, { color: colors.text }]}>Эта неделя</Text>
        <TouchableOpacity onPress={() => navigation.navigate('WorkoutsTab', { screen: 'WorkoutHistory' })}>
          <Text style={[typography.smallMedium, { color: colors.primary }]}>История</Text>
        </TouchableOpacity>
      </View>

      {/* Day dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg }}>
        {DAY_LABELS.map((day, i) => {
          const dayDate = new Date(now);
          dayDate.setDate(now.getDate() - currentDow + i);
          const dateStr = dayDate.toISOString().split('T')[0];
          const hadWorkout = workoutHistory.some((w) => w.completedAt?.startsWith(dateStr));
          const isToday = i === currentDow;
          const hasPlan = !!weekPlan[i];
          const isPast = i < currentDow;
          return (
            <View key={day} style={{ alignItems: 'center', gap: 4 }}>
              <Text style={[typography.small, { color: isToday ? colors.primary : colors.textTertiary, fontSize: 10 }]}>
                {day}
              </Text>
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: hadWorkout ? colors.success : isToday ? colors.primary + '15' : colors.surface,
                borderWidth: isToday ? 2 : hasPlan && !hadWorkout && !isPast ? 1.5 : 0,
                borderColor: isToday ? colors.primary : colors.accent,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {hadWorkout ? (
                  <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>✓</Text>
                ) : hasPlan && !isPast ? (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent }}>{weekPlan[i]?.emoji || '◎'}</Text>
                ) : (
                  <Text style={[typography.small, { color: isToday ? colors.primary : colors.textTertiary }]}>
                    {dayDate.getDate()}
                  </Text>
                )}
              </View>
              {hasPlan && !hadWorkout && !isPast && (
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent }} />
              )}
            </View>
          );
        })}
      </View>

      {/* Adherence bar */}
      {weekAdherence.planned > 0 && weekAdherence.pastPlanned > 0 && (
        <View style={{ marginTop: spacing.sm, marginBottom: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={[typography.small, { color: colors.textSecondary }]}>Выполнение плана</Text>
            <Text style={[typography.small, {
              color: weekAdherence.done === weekAdherence.pastPlanned ? colors.success : colors.textSecondary,
              fontWeight: '700',
            }]}>
              {weekAdherence.done}/{weekAdherence.pastPlanned}
            </Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border }}>
            <View style={{
              height: 6, borderRadius: 3,
              backgroundColor: weekAdherence.done === weekAdherence.pastPlanned ? colors.success : colors.primary,
              width: `${(weekAdherence.done / weekAdherence.pastPlanned) * 100}%`,
            }} />
          </View>
        </View>
      )}

      {/* Stats row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap' }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={[typography.number, { color: colors.primary }]}>{weekWorkouts.length}</Text>
            {prevWeekWorkouts.length > 0 && weekWorkouts.length !== prevWeekWorkouts.length && (
              <Text style={[typography.small, {
                color: weekWorkouts.length >= prevWeekWorkouts.length ? colors.success : colors.error,
                fontSize: 10, fontWeight: '700',
              }]}>
                {weekWorkouts.length >= prevWeekWorkouts.length ? '▲' : '▼'}{Math.abs(weekWorkouts.length - prevWeekWorkouts.length)}
              </Text>
            )}
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>Тренировок</Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={[typography.number, { color: colors.accent }]}>{Math.round(weekVolume / 1000)}</Text>
            {volumeDeltaPct !== null && (
              <Text style={[typography.small, {
                color: volumeDeltaPct >= 0 ? colors.success : colors.error,
                fontSize: 10, fontWeight: '700',
              }]}>
                {volumeDeltaPct >= 0 ? '▲' : '▼'}{Math.abs(volumeDeltaPct)}%
              </Text>
            )}
          </View>
          <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>Тонн</Text>
        </View>

        <View style={{ alignItems: 'center' }}>
          <Text style={[typography.number, { color: colors.success }]}>
            {weekWorkouts.reduce((s, w) => s + (w.durationMinutes || 0), 0)}
          </Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>Минут</Text>
        </View>

        {streak > 0 && (
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={[typography.number, { color: colors.error }]}>{streak}</Text>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.error }} />
            </View>
            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>Дней</Text>
          </View>
        )}
      </View>
    </Card>
  );
};
