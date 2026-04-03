import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useHaptic } from '../../hooks/useHaptic';
import { useThemeStore, useWorkoutStore } from '../../store';
import { Card, FadeIn } from '../../components';
import { typography } from '../../theme';
import { spacing, borderRadius } from '../../theme/spacing';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// Monday-based weekday (0=Mon … 6=Sun)
function mondayWeekday(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}ч ${m}мин` : `${h}ч`;
}

export const WorkoutCalendarScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const haptic = useHaptic();
  const { colors } = useThemeStore();
  const { workoutHistory, weekPlan } = useWorkoutStore();

  const today = new Date();
  const todayStr = toDateStr(today);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Build a map: dateStr → completed workouts
  const workoutsByDate = useMemo(() => {
    const map = new Map<string, typeof workoutHistory>();
    workoutHistory.forEach((w) => {
      const date = w.completedAt || w.startedAt;
      if (!date) return;
      const key = date.split('T')[0];
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    });
    return map;
  }, [workoutHistory]);

  // Current month's DOW plan (0=Mon)
  const planDays = useMemo(() => {
    const result = new Set<number>();
    Object.entries(weekPlan).forEach(([dow, entry]) => {
      if (entry && entry.exercises.length > 0) result.add(Number(dow));
    });
    return result;
  }, [weekPlan]);

  const days = useMemo(() => getDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);

  // Padding at start (empty cells before first day)
  const leadingPad = mondayWeekday(days[0]);

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
    const hasWorkout = workoutsByDate.has(dateStr);
    if (!hasWorkout) return;
    haptic.selection();
    setSelectedDayStr(dateStr);
    setShowModal(true);
  };

  // Month stats
  const monthStats = useMemo(() => {
    let totalWorkouts = 0;
    let totalVolume = 0;
    let totalDuration = 0;

    days.forEach((d) => {
      const key = toDateStr(d);
      const ws = workoutsByDate.get(key);
      if (!ws) return;
      totalWorkouts += ws.length;
      ws.forEach((w) => {
        totalDuration += w.durationMinutes || 0;
        w.exercises?.forEach((ex) => {
          ex.sets?.forEach((s) => {
            if (s.completed && s.weight && s.reps) {
              totalVolume += s.weight * s.reps;
            }
          });
        });
      });
    });

    return { totalWorkouts, totalVolume: Math.round(totalVolume), totalDuration };
  }, [days, workoutsByDate]);

  const selectedWorkouts = selectedDayStr ? (workoutsByDate.get(selectedDayStr) || []) : [];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Text style={[typography.h2, { color: colors.text }]}>Календарь</Text>
          <Text style={[typography.small, { color: colors.textSecondary }]}>
            История тренировок
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
          style={[styles.todayBtn, { backgroundColor: colors.primary + '20', borderColor: colors.primary + '40' }]}
        >
          <Text style={[typography.captionMedium, { color: colors.primary }]}>Сегодня</Text>
        </TouchableOpacity>
      </View>

      {/* Month navigator */}
      <FadeIn delay={0}>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={goToPrevMonth} style={styles.navBtn}>
              <Text style={[typography.h3, { color: colors.primary }]}>{'‹'}</Text>
            </TouchableOpacity>
            <Text style={[typography.h4, { color: colors.text }]}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity
              onPress={goToNextMonth}
              style={styles.navBtn}
              disabled={viewYear === today.getFullYear() && viewMonth === today.getMonth()}
            >
              <Text style={[
                typography.h3,
                { color: viewYear === today.getFullYear() && viewMonth === today.getMonth()
                  ? colors.textTertiary : colors.primary }
              ]}>{'›'}</Text>
            </TouchableOpacity>
          </View>

          {/* Weekday headers */}
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <Text key={i} style={[
                styles.weekdayLabel,
                typography.captionMedium,
                { color: i >= 5 ? colors.textTertiary : colors.textSecondary },
              ]}>
                {label}
              </Text>
            ))}
          </View>

          {/* Day cells */}
          <View style={styles.daysGrid}>
            {/* Leading empty cells */}
            {Array.from({ length: leadingPad }).map((_, i) => (
              <View key={`pad-${i}`} style={styles.dayCell} />
            ))}

            {days.map((day) => {
              const dateStr = toDateStr(day);
              const isToday = dateStr === todayStr;
              const hasWorkout = workoutsByDate.has(dateStr);
              const isFuture = day > today;
              const dow = mondayWeekday(day);
              const isPlanned = !hasWorkout && !isFuture && planDays.has(dow);
              const isFuturePlanned = isFuture && planDays.has(dow);
              const workoutsOnDay = workoutsByDate.get(dateStr) || [];
              const workoutCount = workoutsOnDay.length;

              let bgColor: string = 'transparent';
              if (hasWorkout) bgColor = colors.primary;
              else if (isPlanned) bgColor = colors.success + '30';
              else if (isFuturePlanned) bgColor = colors.primary + '20';

              return (
                <TouchableOpacity
                  key={dateStr}
                  style={[
                    styles.dayCell,
                    {
                      backgroundColor: bgColor,
                      borderWidth: isToday ? 2 : 0,
                      borderColor: colors.primary,
                      borderRadius: borderRadius.sm,
                    },
                  ]}
                  onPress={() => handleDayPress(dateStr)}
                  disabled={!hasWorkout}
                  activeOpacity={hasWorkout ? 0.7 : 1}
                >
                  <Text style={[
                    typography.captionMedium,
                    {
                      color: hasWorkout ? '#FFF'
                        : isToday ? colors.primary
                        : isFuture ? colors.textTertiary
                        : colors.text,
                      fontSize: 13,
                    },
                  ]}>
                    {day.getDate()}
                  </Text>
                  {workoutCount > 1 && (
                    <View style={[styles.countBadge, { backgroundColor: '#FFF' }]}>
                      <Text style={{ fontSize: 8, color: colors.primary, fontWeight: '700' }}>
                        {workoutCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={[typography.small, { color: colors.textSecondary }]}>Тренировка</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.success + '50' }]} />
              <Text style={[typography.small, { color: colors.textSecondary }]}>Пропущена</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary + '30' }]} />
              <Text style={[typography.small, { color: colors.textSecondary }]}>Запланирована</Text>
            </View>
          </View>
        </Card>
      </FadeIn>

      {/* Month stats */}
      <FadeIn delay={80}>
        <Card style={{ marginBottom: spacing.lg }}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Статистика {MONTH_NAMES[viewMonth].toLowerCase()}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.primary, fontSize: 32 }]}>
                {monthStats.totalWorkouts}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>тренировок</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.accent, fontSize: 32 }]}>
                {monthStats.totalVolume >= 1000
                  ? `${(monthStats.totalVolume / 1000).toFixed(1)}т`
                  : `${monthStats.totalVolume}`}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                {monthStats.totalVolume >= 1000 ? 'тоннаж' : 'кг тоннаж'}
              </Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.statItem}>
              <Text style={[typography.number, { color: colors.success || colors.accent, fontSize: 32 }]}>
                {formatDuration(monthStats.totalDuration)}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>в зале</Text>
            </View>
          </View>
        </Card>
      </FadeIn>

      {/* Recent workouts this month */}
      {monthStats.totalWorkouts > 0 && (
        <FadeIn delay={160}>
          <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.md }]}>
            Тренировки месяца
          </Text>
          {days
            .filter((d) => workoutsByDate.has(toDateStr(d)))
            .reverse()
            .map((d) => {
              const dateStr = toDateStr(d);
              const ws = workoutsByDate.get(dateStr)!;
              return ws.map((w, wi) => {
                const totalSets = w.exercises?.reduce((s, e) => s + (e.sets?.filter((st) => st.completed).length || 0), 0) || 0;
                const totalVol = w.exercises?.reduce((s, e) =>
                  s + (e.sets?.reduce((ss, st) => ss + (st.completed && st.weight && st.reps ? st.weight * st.reps : 0), 0) || 0), 0) || 0;
                return (
                  <Card key={`${dateStr}-${wi}`} style={{ marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                      <View style={[styles.dateBadge, { backgroundColor: colors.primary + '20' }]}>
                        <Text style={[typography.number, { color: colors.primary, fontSize: 18 }]}>
                          {d.getDate()}
                        </Text>
                        <Text style={[typography.small, { color: colors.primary, fontSize: 10 }]}>
                          {WEEKDAY_LABELS[mondayWeekday(d)]}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodySemibold, { color: colors.text }]} numberOfLines={1}>
                          {w.name || 'Тренировка'}
                        </Text>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                          {totalSets} подходов · {totalVol > 0 ? `${Math.round(totalVol)} кг` : '—'}
                          {w.durationMinutes ? ` · ${formatDuration(w.durationMinutes)}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => { setSelectedDayStr(dateStr); setShowModal(true); }}
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
      )}

      {monthStats.totalWorkouts === 0 && (
        <FadeIn delay={120}>
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40 }}>📅</Text>
            <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md }]}>
              В этом месяце нет тренировок
            </Text>
            <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm }]}>
              Завершённые тренировки появятся здесь
            </Text>
          </View>
        </FadeIn>
      )}

      {/* Workout detail modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModal(false)}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

            {selectedDayStr && (
              <>
                <Text style={[typography.h4, { color: colors.text, marginBottom: spacing.xs }]}>
                  {formatShortDate(selectedDayStr)}
                </Text>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {selectedWorkouts.map((w, wi) => {
                    const completedSets = w.exercises?.flatMap((e) =>
                      (e.sets || []).filter((s) => s.completed)
                    ) || [];
                    const totalVol = completedSets.reduce(
                      (s, st) => s + (st.weight && st.reps ? st.weight * st.reps : 0), 0
                    );

                    return (
                      <View key={wi} style={{ marginTop: wi > 0 ? spacing.lg : spacing.md }}>
                        <Text style={[typography.bodySemibold, { color: colors.text }]}>
                          {w.name || 'Тренировка'}
                        </Text>
                        <View style={styles.workoutMeta}>
                          <Text style={[typography.caption, { color: colors.textSecondary }]}>
                            {completedSets.length} подходов
                          </Text>
                          {totalVol > 0 && (
                            <Text style={[typography.caption, { color: colors.textSecondary }]}>
                              · {Math.round(totalVol)} кг объём
                            </Text>
                          )}
                          {w.durationMinutes ? (
                            <Text style={[typography.caption, { color: colors.textSecondary }]}>
                              · {formatDuration(w.durationMinutes)}
                            </Text>
                          ) : null}
                        </View>

                        {w.exercises?.map((ex, ei) => {
                          const done = ex.sets?.filter((s) => s.completed) || [];
                          if (done.length === 0) return null;
                          const bestSet = done.reduce((best, s) =>
                            (s.weight || 0) > (best.weight || 0) ? s : best, done[0]);
                          return (
                            <View key={ei} style={[styles.exerciseRow, {
                              borderBottomColor: colors.divider,
                              borderBottomWidth: ei < (w.exercises?.length || 1) - 1 ? 1 : 0,
                            }]}>
                              <Text style={[typography.small, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                                {ex.exercise?.name || ex.exerciseId}
                              </Text>
                              <Text style={[typography.captionMedium, { color: colors.primary }]}>
                                {done.length}×{bestSet.reps}
                                {bestSet.weight ? ` · ${bestSet.weight} кг` : ''}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity
                  onPress={() => setShowModal(false)}
                  style={[styles.closeBtn, { backgroundColor: colors.primary }]}
                >
                  <Text style={[typography.bodySemibold, { color: '#FFF' }]}>Закрыть</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: 60, paddingBottom: spacing.huge },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  todayBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  navBtn: {
    width: 36,
    alignItems: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  countBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statItem: { alignItems: 'center' },
  statDivider: { width: 1, height: 40 },
  dateBadge: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing.huge,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  workoutMeta: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  closeBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
});
