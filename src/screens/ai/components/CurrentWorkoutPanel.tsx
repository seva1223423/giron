/**
 * CurrentWorkoutPanel — live mirror of the in-progress workout, shown
 * under the AI chat header.
 *
 * Direction A spec (chat2.md): "Постоянная панель «Текущая тренировка»
 * под шапкой. Все упражнения с подходами, текущее подсвечено золотом,
 * подходы в виде чипов: серые = план, зелёные с ✓ = выполнено,
 * прогресс‑бар по всей тренировке."
 *
 * Phase B implementation choices:
 *  - Read-only display. When Phase A commands (e.g. `+подход 100×6`,
 *    `done`) mutate the workout store, this panel re-renders. The user
 *    SEES what the parser changed.
 *  - Renders null when no `activeWorkout` — chat looks normal outside a
 *    session.
 *  - Subscribes to the store via a selector that only re-runs when the
 *    activeWorkout reference changes (Zustand bails on === equality).
 *  - Collapsible: tap the header pill to hide/show the exercise list.
 *    Default expanded so the user gets full visibility on first paint.
 *  - Tap-to-switch-exercise is NOT in Phase B — Phase A's `next` /
 *    `следующее упражнение` already covers the user need, and keeping
 *    the panel read-only avoids touching the store API.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useWorkoutStore } from '../../../store';
import { useThemeStore } from '../../../store/useThemeStore';

export const CurrentWorkoutPanel: React.FC = () => {
  const { colors } = useThemeStore();
  const activeWorkout = useWorkoutStore((s) => s.activeWorkout);
  const [collapsed, setCollapsed] = useState(false);

  if (!activeWorkout) return null;

  const { workout, currentExerciseIndex } = activeWorkout;
  const exercises = workout.exercises;
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const completedSets = exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0,
  );
  const progress = totalSets > 0 ? completedSets / totalSets : 0;
  const currentExercise = exercises[currentExerciseIndex];
  const currentName = currentExercise?.exercise?.name ?? workout.name;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Top row: current exercise name + progress + collapse toggle */}
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        style={styles.headerRow}
        accessibilityRole="button"
        accessibilityLabel={collapsed ? 'Показать тренировку' : 'Свернуть тренировку'}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.heading, { color: colors.text }]} numberOfLines={1}>
              {currentName}
            </Text>
            <Text style={[styles.subheading, { color: colors.textSecondary }]} numberOfLines={1}>
              Подходы: {completedSets} / {totalSets}
            </Text>
          </View>
        </View>
        <Text style={[styles.chev, { color: colors.textTertiary }]}>
          {collapsed ? '▾' : '▴'}
        </Text>
      </Pressable>

      {/* Overall progress bar — always visible (the most compact "are we
          making progress?" signal). Track + fill, gold on graphite. */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` as any },
          ]}
        />
      </View>

      {/* Expanded body: list of exercises, each row = name + chip strip */}
      {!collapsed && (
        <View style={styles.body}>
          {exercises.map((ex, exIdx) => {
            const isCurrent = exIdx === currentExerciseIndex;
            return (
              <View key={ex.id} style={styles.exerciseRow}>
                <Text
                  style={[
                    styles.exerciseName,
                    {
                      color: isCurrent ? colors.primary : colors.textSecondary,
                      fontWeight: isCurrent ? '700' : '500',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {ex.exercise?.name ?? `Упр. ${exIdx + 1}`}
                </Text>
                <View style={styles.chipRow}>
                  {ex.sets.map((s, setIdx) => (
                    <View
                      key={setIdx}
                      style={[
                        styles.chip,
                        s.completed
                          ? {
                              backgroundColor: colors.primary + '33',
                              borderColor: colors.primary,
                            }
                          : {
                              backgroundColor: 'transparent',
                              borderColor: colors.border,
                            },
                      ]}
                    >
                      {s.completed ? (
                        // Use a thin checkmark glyph — small enough that
                        // the per-CLAUDE.md "no emoji in UI" rule is fine
                        // (this is a Unicode tick used as iconography, not
                        // an emoji ⭐). The Sticker component is overkill
                        // at 8pt.
                        <Text style={[styles.chipTick, { color: colors.primary }]}>✓</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heading: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subheading: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  chev: {
    fontSize: 14,
    paddingHorizontal: 6,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  body: {
    marginTop: 10,
    gap: 8,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  exerciseName: {
    fontSize: 12,
    flex: 1,
    letterSpacing: -0.1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 4,
  },
  chip: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipTick: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});
