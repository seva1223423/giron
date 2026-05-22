import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { spacing, borderRadius } from '../../../theme/spacing';
import type { WorkoutExercise } from '../../../types';
import { findLiveSet, rpeFillRatio, buildSetEyebrow } from './heroLogic';

interface Props {
  exercise: WorkoutExercise;
  /** Previous-session reference for the matching set — shows "Прошлый: 100×8". */
  previousSet?: { weight?: number; reps?: number } | null;
  /** Called when the user taps the hero card — scrolls to / focuses the
   *  editable SetRow below (parent handles the scroll). */
  onFocusCurrent?: () => void;
}

/**
 * Gold hero card that previews the "next working set" with display-scale
 * numbers. Pixel copy of the Active workout card in the Direction A
 * design handoff (upgraded-a.jsx → A_Active):
 *
 *   ┌──────────────────────────────────────────┐
 *   │ ПОДХОД 3 ИЗ 4 · РАБОЧИЙ       100×8      │
 *   │                                          │
 *   │  Вес         Повт.          RPE          │
 *   │ 102.5         8              7           │
 *   │  кг        цель 8–10    восприятие       │
 *   │                                          │
 *   │ ▓▓░░░░░░   (RPE scale, gold + black)     │
 *   │ легко                         в отказ    │
 *   └──────────────────────────────────────────┘
 *
 * Read-only — taps scroll to the actual editable SetRow below so the
 * existing input/complete logic stays authoritative. The next uncomplete
 * set's own values feed this card; if every set is done, falls back to
 * the last set so the card still anchors the exercise visually.
 *
 * Dark-on-gold palette is shared across every premium surface in the
 * design (paywall CTA, Home AI card CTA, quick-action icon tiles).
 */
export const CurrentSetHero: React.FC<Props> = ({ exercise, previousSet, onFocusCurrent }) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  const live = findLiveSet(exercise.sets ?? []);
  if (!live) return null;
  const { index: liveIndex, set: liveSet } = live;

  const eyebrow = buildSetEyebrow(exercise, liveIndex);
  const prevHint = previousSet?.weight && previousSet?.reps
    ? `Прошлый: ${previousSet.weight}×${previousSet.reps}`
    : null;

  // RPE 6..10 → 8 cells with fill proportion.
  const rpeValue = liveSet.rpe ?? 7;
  const rpeFill = rpeFillRatio(rpeValue);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => { haptic.selection(); onFocusCurrent?.(); }}
      accessibilityLabel={`${eyebrow}. Вес ${liveSet.weight || 0} килограмм, повторов ${liveSet.reps || 0}, RPE ${rpeValue}`}
      accessibilityHint="Тап — прокрутить к редактированию сета"
      accessibilityRole="button"
      style={[styles.card, { backgroundColor: colors.primary }]}
    >
      {/* Soft dark overlay disc matching the design's pseudo element */}
      <View style={[styles.bgDisc, { backgroundColor: 'rgba(0,0,0,0.06)' }]} pointerEvents="none" />

      <View style={styles.header}>
        <Text style={styles.eyebrow} numberOfLines={1}>{eyebrow}</Text>
        {prevHint && (
          <Text style={styles.prevHint} numberOfLines={1}>{prevHint}</Text>
        )}
      </View>

      <View style={styles.statsRow}>
        <Stat label="Вес" value={liveSet.weight ? (liveSet.weight % 1 === 0 ? `${liveSet.weight}` : liveSet.weight.toFixed(1)) : '—'} unit="кг" />
        <Stat label="Повт." value={liveSet.reps ? String(liveSet.reps) : '—'} unit={liveSet.type === 'warmup' ? 'разминка' : 'цель'} />
        <Stat label="RPE" value={liveSet.rpe != null ? String(liveSet.rpe) : '—'} unit="восприятие" />
      </View>

      {/* RPE scale — 8 cells */}
      <View style={{ marginTop: 10 }}>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
            const cellCenter = i / 7;
            const filled = cellCenter <= rpeFill;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 2,
                  backgroundColor: filled ? 'rgba(10,10,10,0.75)' : 'rgba(10,10,10,0.2)',
                }}
              />
            );
          })}
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 4,
          }}
        >
          <Text style={styles.rpeMark}>легко</Text>
          <Text style={styles.rpeMark}>в отказ</Text>
        </View>
      </View>

      <Text style={styles.tapHint}>Тап — редактировать</Text>
    </TouchableOpacity>
  );
};

/** Single stat block inside the hero — label over a 40pt number over unit. */
const Stat: React.FC<{ label: string; value: string; unit: string }> = ({ label, value, unit }) => (
  <View style={{ flex: 1 }}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    <Text style={styles.statUnit}>{unit}</Text>
  </View>
);

// Direction A rule (PHILOSOPHY.md + design.md §20): gold CTA always has
// DARK text — cream-on-gold fails contrast at 2.8:1. All literal
// rgba(10,10,10,...) values in this file are the dark-on-gold pairing,
// intentional. Do not refactor to colors.text — that would invert in
// light mode and break the gold hero's contrast.
const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.xxl,
    padding: 18,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  bgDisc: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  // Dark text on gold (philosophy §"Числа — тяжёлые", design §20)
  eyebrow: {
    color: 'rgba(10,10,10,0.65)',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    flex: 1,
  },
  prevHint: {
    color: 'rgba(10,10,10,0.65)',
    fontSize: 10,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  statLabel: {
    color: 'rgba(10,10,10,0.6)',
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  // Hero number — dive-watch typography from PHILOSOPHY.md. 40pt is the
  // "read from a bench at 0.5s" target.
  statValue: {
    color: '#0A0A0A',
    fontSize: 40,
    fontWeight: '600',
    letterSpacing: -1.5,
    lineHeight: 42,
    marginTop: 2,
  },
  statUnit: {
    color: 'rgba(10,10,10,0.55)',
    fontSize: 9,
    fontWeight: '500',
    marginTop: 2,
  },
  rpeMark: {
    color: 'rgba(10,10,10,0.6)',
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  tapHint: {
    color: 'rgba(10,10,10,0.55)',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.3,
  },
});
