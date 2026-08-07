import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useSafeTop } from '../../hooks/useSafeTop';
import { useThemeColors, useWorkoutStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';
import { CalendarGrid, WorkoutDayModal, WEEKDAY_LABELS, MONTH_NAMES, toDateStr, getDaysInMonth, mondayWeekday, formatDuration } from './calendar';
import { localDateStr } from '../../utils/date';

export const WorkoutCalendarScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const safeTop = useSafeTop();
  const colors = useThemeColors();
  const { workoutHistory, weekPlan, routines } = useWorkoutStore();

  const today = new Date();
  const todayStr = toDateStr(today);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const workoutsByDate = useMemo(() => {
    const map = new Map<string, typeof workoutHistory>();
    workoutHistory.forEach((w) => {
      const date = w.completedAt || w.startedAt;
      if (!date) return;
      const key = localDateStr(new Date(date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    });
    return map;
  }, [workoutHistory]);

  const planDays = useMemo(() => {
    const result = new Set<number>();
    Object.entries(weekPlan).forEach(([dow, entry]) => {
      if (entry && (entry.exercises.length > 0 || entry.routineId)) result.add(Number(dow));
    });
    return result;
  }, [weekPlan]);

  const days = useMemo(() => getDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);

  const monthStats = useMemo(() => {
    let totalWorkouts = 0, totalVolume = 0, totalDuration = 0, totalPRs = 0;
    days.forEach((d) => {
      const ws = workoutsByDate.get(toDateStr(d));
      if (!ws) return;
      totalWorkouts += ws.length;
      ws.forEach((w) => {
        totalDuration += w.durationMinutes || 0;
        w.exercises?.forEach((ex) => {
          ex.sets?.forEach((s: any) => {
            if (s.completed && s.weight && s.reps) totalVolume += s.weight * s.reps;
            if (s.isPR) totalPRs += 1;
          });
        });
      });
    });
    return { totalWorkouts, totalVolume: Math.round(totalVolume), totalDuration, totalPRs };
  }, [days, workoutsByDate]);

  const goToPrevMonth = () => {
    haptic.selection();
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const goToNextMonth = () => {
    haptic.selection();
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const handleDayPress = (dateStr: string) => {
    if (!workoutsByDate.has(dateStr)) return;
    haptic.selection();
    setSelectedDayStr(dateStr);
    setShowModal(true);
  };

  const selectedWorkouts = selectedDayStr ? (workoutsByDate.get(selectedDayStr) || []) : [];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={[styles.content, { paddingTop: safeTop }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.h2, { color: colors.text }]}>Календарь</Text>
          <Text style={[typography.small, { color: colors.textSecondary }]}>История тренировок</Text>
        </View>
        <TouchableOpacity
          onPress={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
          style={[styles.todayBtn, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }]}
        >
          <Text style={[typography.captionMedium, { color: colors.primary }]}>Сегодня</Text>
        </TouchableOpacity>
      </View>

      <FadeIn delay={0}>
        <CalendarGrid
          viewYear={viewYear}
          viewMonth={viewMonth}
          todayStr={todayStr}
          today={today}
          workoutsByDate={workoutsByDate}
          planDays={planDays}
          onPrevMonth={goToPrevMonth}
          onNextMonth={goToNextMonth}
          onDayPress={handleDayPress}
        />
      </FadeIn>

      <FadeIn delay={80}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Статистика {MONTH_NAMES[viewMonth].toLowerCase()}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.primary, fontSize: 28 }]}>{monthStats.totalWorkouts}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>тренировок</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.accent, fontSize: 28 }]}>
                {monthStats.totalVolume >= 1000 ? `${(monthStats.totalVolume / 1000).toFixed(1)}т` : `${monthStats.totalVolume}`}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>{monthStats.totalVolume >= 1000 ? 'тоннаж' : 'кг тоннаж'}</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.success, fontSize: 28 }]}>{formatDuration(monthStats.totalDuration)}</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>в зале</Text>
            </View>
            {monthStats.totalPRs > 0 && (
              <>
                <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
                <View style={styles.statItem}>
                  <Text style={[typography.number, { color: colors.warning, fontSize: 28 }]}>{monthStats.totalPRs}</Text>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>PR</Text>
                </View>
              </>
            )}
          </View>
        </Card>
      </FadeIn>

      {monthStats.totalWorkouts > 0 ? (
        <FadeIn delay={160}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>Тренировки месяца</Text>
          {days.filter((d) => workoutsByDate.has(toDateStr(d))).reverse().map((d) => {
            const dateStr = toDateStr(d);
            const ws = workoutsByDate.get(dateStr)!;
            return ws.map((w, wi) => {
              const totalSets = w.exercises?.reduce((s: number, e: any) => s + (e.sets?.filter((st: any) => st.completed).length || 0), 0) || 0;
              const totalVol = w.exercises?.reduce((s: number, e: any) =>
                s + (e.sets?.reduce((ss: number, st: any) => ss + (st.completed && st.weight && st.reps ? st.weight * st.reps : 0), 0) || 0), 0) || 0;
              const routineName = w.routineId ? routines.find((r) => r.id === w.routineId)?.name : undefined;
              return (
                <Card key={`${dateStr}-${wi}`} style={{ marginBottom: spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <View style={[styles.dateBadge, { backgroundColor: colors.primary + '20', borderWidth: 1.5, borderColor: colors.primary + '40' }]}>
                      <Text style={[typography.number, { color: colors.primary, fontSize: 18 }]}>{d.getDate()}</Text>
                      <Text style={[typography.small, { color: colors.primary, fontSize: 10 }]}>{WEEKDAY_LABELS[mondayWeekday(d)]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>{w.name || 'Тренировка'}</Text>
                      {routineName ? (
                        <Text style={[typography.caption, { color: colors.primary, marginTop: 1 }]} numberOfLines={1}>◈ {routineName}</Text>
                      ) : null}
                      <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={2}>
                        {totalSets} подходов · {totalVol > 0 ? `${Math.round(totalVol)} кг` : '—'}
                        {w.durationMinutes ? ` · ${formatDuration(w.durationMinutes)}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setSelectedDayStr(dateStr); setShowModal(true); }}
                      // A 28pt chevron at the end of a list row: growing it
                      // would push the row's text, so widen the hit area.
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={[styles.viewBtn, { borderColor: colors.border }]}
                    >
                      <Text style={[typography.captionMedium, { color: colors.primary }]}>›</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              );
            });
          })}
        </FadeIn>
      ) : (
        <FadeIn delay={120}>
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primary }}>◧</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md }]}>В этом месяце нет тренировок</Text>
            <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>Завершённые тренировки появятся здесь</Text>
          </View>
        </FadeIn>
      )}

      <WorkoutDayModal visible={showModal} onClose={() => setShowModal(false)} selectedDayStr={selectedDayStr} workouts={selectedWorkouts} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.huge },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  todayBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: borderRadius.full, borderWidth: 1 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', flexWrap: 'wrap' },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 40 },
  dateBadge: { width: 44, height: 44, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },
  viewBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingTop: spacing.huge },
});
