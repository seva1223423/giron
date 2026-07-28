import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useHaptic } from '../../../hooks/useHaptic';
import { AnimatedPressable, Icon, NumberSheet } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { estimateOneRepMaxRounded as estimate1RM } from '../../../utils/oneRepMax';
import { buildPresets } from '../../../utils/wheel';

const SET_TYPES = ['normal', 'warmup', 'dropset'] as const;
/** Set-type chip config — colors resolved per-call from theme so chips
 *  follow light/dark mode. Was literal hex; refactored to use Direction A
 *  semantic tokens (primary/warning/error). Same Russian labels. */
const buildSetTypeConfig = (colors: any): Record<string, { label: string; color: string }> => ({
  normal:  { label: 'РАБ',  color: colors.primary }, // champagne gold
  warmup:  { label: 'РАЗМ', color: colors.warning }, // warm amber
  dropset: { label: 'ДРОП', color: colors.error },   // terracotta
});

/** RPE scale colors — sage → amber → terracotta, theme-aware.
 *  Maps directly to Direction A semantic tokens (success/warning/error).
 *  Near-failure (RPE 9.5+) falls back to error so light & dark modes both
 *  resolve correctly. */
function rpeColor(rpe: number, colors: any): string {
  if (rpe <= 7) return colors.success;  // sage (good)
  if (rpe <= 8) return colors.warning;  // amber (warn)
  return colors.error;                  // terracotta (danger / near failure)
}

/** 102.5 → "102.5", 60.0 → "60". */
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100));

/**
 * WHY THIS ROW HAS ALMOST NO BUTTONS.
 *
 * It used to carry five controls — −, weight field, +, −, reps field, + and a
 * plate icon — which on a five-set exercise put more than twenty tap targets
 * on screen at once. It read as a control panel, and the fixed 2.5 kg step
 * meant forty taps to go from nothing to 100 kg.
 *
 * Now the row is data: number, "60 кг × 10", RPE, and one checkmark. Tapping
 * any number opens a wheel sheet at the bottom of the screen, where the thumb
 * already is. The plate calculator moved inside that sheet, next to the weight
 * it describes. RPE is no longer an eight-button strip that pops open after
 * every set — it is just another number you can tap.
 */

interface Props {
  set: any;
  setIndex: number;
  prevSet?: { weight?: number; reps?: number } | null;
  suggestedRpe?: number;
  /** True if this is the first uncompleted set — the row gets a gold
   *  left-border + faint tint so the user's eye lands here. PHILOSOPHY §3. */
  isActive?: boolean;
  /** isCorrection = the set was ALREADY completed and the user is fixing the
   *  numbers. The caller must not restart the rest timer or auto-advance. */
  onComplete: (reps: number, weight: number, isCorrection?: boolean) => void;
  /** Picked numbers, before the set is ticked off. Persists them so the hero
   *  card above shows what you chose and a backgrounded app does not lose it. */
  onValuesChange?: (reps: number, weight: number) => void;
  onRpeChange: (rpe: number) => void;
  onRemove?: () => void;
  onTypeChange?: (type: string) => void;
  onOpenPlates?: (weight: number) => void;
  colors: any;
}

// Animated complete button with spring pop + burst on completion.
// State-as-event (PHILOSOPHY.md §5): pressing the checkmark is a mini-event,
// not a silent state change. Spring bounce + haptic success.
const CompleteButton: React.FC<{ completed: boolean; onPress: () => void; colors: any; est1RM: number }> = ({ completed, onPress, colors, est1RM }) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = useCallback(() => {
    // Burst: overshoot 1.3 then settle — more pronounced than a press feedback,
    // signals "set committed" celebration. Was 1.2; bumped for visibility.
    scale.value = withSequence(
      withSpring(1.3, { damping: 6, stiffness: 700 }),
      withSpring(1, { damping: 10, stiffness: 400 }),
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPress();
  }, [onPress, scale]);

  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={[animStyle, styles.checkBtn, { backgroundColor: completed ? colors.success : colors.inputBackground, borderColor: completed ? colors.success : colors.border }]}>
        <TouchableArea onPress={handlePress} completed={completed} colors={colors} />
      </Animated.View>
      {est1RM > 0 && (
        <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textTertiary, marginTop: 2 }}>
          ~{est1RM} 1ПМ
        </Text>
      )}
    </View>
  );
};

// Inner pressable surface inside CompleteButton — hosts the Icon and
// receives taps. Split out so the animated container stays purely visual.
const TouchableArea: React.FC<{ onPress: () => void; completed: boolean; colors: any }> = ({ onPress, completed, colors }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={completed ? 'Сет выполнен — нажми, чтобы сохранить исправленные цифры' : 'Отметить сет выполненным'}
    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
  >
    <Icon name="check" size={20} color={completed ? colors.textInverse : colors.textSecondary} strokeWidth={3} />
  </Pressable>
);

export const SetRow: React.FC<Props> = React.memo(({ set, setIndex, prevSet, suggestedRpe, isActive, onComplete, onValuesChange, onRpeChange, onRemove, onTypeChange, onOpenPlates, colors }) => {
  const haptic = useHaptic();
  // Truthiness, not ??: a fresh set is created with weight 0, so nullish
  // coalescing would keep the zero and never fall through to last session's
  // number — the row would read "—" and the set would log 0 kg.
  const [weight, setWeight] = useState<number>(set.weight || prevSet?.weight || 0);
  const [reps, setReps] = useState<number>(set.reps || prevSet?.reps || 10);
  // History is fetched after the screen mounts, so last session's numbers can
  // arrive when the rows already exist. Prefill then too — but only while the
  // user has not picked anything: once they do, the number is theirs, and an
  // explicit 0 means a bodyweight set.
  const touchedRef = useRef(false);
  useEffect(() => {
    if (touchedRef.current || set.completed) return;
    if (!set.weight && prevSet?.weight) setWeight(prevSet.weight);
    if (!set.reps && prevSet?.reps) setReps(prevSet.reps);
  }, [prevSet?.weight, prevSet?.reps, set.weight, set.reps, set.completed]);

  const pickWeight = useCallback((v: number) => { touchedRef.current = true; setWeight(v); }, []);
  const pickReps = useCallback((v: number) => { touchedRef.current = true; setReps(v); }, []);
  // Only one sheet is ever open, so a single discriminator beats two booleans.
  const [sheet, setSheet] = useState<'load' | 'rpe' | null>(null);
  const [draftRpe, setDraftRpe] = useState<number>(set.rpe ?? suggestedRpe ?? 8);
  const currentType = set.type || 'normal';
  const setTypeConfig = buildSetTypeConfig(colors);

  const handleComplete = useCallback(() => {
    // A completed set used to be frozen here: tapping ✓ again returned
    // immediately, so a mis-tap that logged 0 kg could never be corrected —
    // the wrong number stayed in history and in the PR maths forever (audit
    // W2). Re-confirming now saves the corrected values, and the caller is
    // told this is a correction so it does not restart rest or jump exercises.
    onComplete(Math.max(0, reps), Math.max(0, weight), !!set.completed);
  }, [weight, reps, onComplete, set.completed]);

  const completed1RM = set.completed && set.weight && set.reps
    ? estimate1RM(set.weight, set.reps)
    : 0;

  // Highlight logic (PHILOSOPHY §3 — 3-level hierarchy):
  //   completed → sage tint + 3px sage border-left
  //   active (current set)  → gold 6% tint + 3px gold border-left (signals "you are here")
  //   future → flat
  const rowBg = set.completed ? colors.success + '10' : isActive ? colors.primary + '0F' : 'transparent';
  const borderColor = set.completed ? colors.success : isActive ? colors.primary : 'transparent';
  const borderWidth = set.completed || isActive ? 3 : 0;

  const showPrev = !set.completed && !!prevSet?.weight;

  return (
    <View style={{
      backgroundColor: rowBg,
      borderRadius: borderRadius.sm,
      marginBottom: 2,
      borderLeftWidth: borderWidth,
      borderLeftColor: borderColor,
    }}>
      <View style={styles.setRow}>
        {/* Set number / type badge */}
        <AnimatedPressable
          onPress={onTypeChange ? () => {
            haptic.selection();
            const idx = SET_TYPES.indexOf(currentType as any);
            onTypeChange(SET_TYPES[(idx + 1) % SET_TYPES.length]);
          } : undefined}
          onLongPress={onRemove}
          delayLongPress={500}
          haptic={false}
          scaleDown={0.9}
          style={{ width: 40, alignItems: 'center', paddingVertical: spacing.xs } as any}
        >
          <Text style={{ fontSize: 8, fontWeight: '700', letterSpacing: 0.5, marginBottom: 1, color: setTypeConfig[currentType].color }}>
            {setTypeConfig[currentType].label}
          </Text>
          <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>{setIndex + 1}</Text>
        </AnimatedPressable>

        {/* The whole "60 кг × 10" block is one target — the numbers are the
            control, so there is nothing else to aim at. */}
        <AnimatedPressable
          onPress={() => { haptic.selection(); setSheet('load'); }}
          haptic={false}
          scaleDown={0.97}
          style={styles.values as any}
          accessibilityRole="button"
          accessibilityLabel={`${weight > 0 ? `${fmt(weight)} килограмм, ` : ''}${reps} повторений. Нажми, чтобы изменить`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={[typography.h3, { color: weight > 0 ? colors.text : colors.textTertiary }]} allowFontScaling={false}>
              {weight > 0 ? fmt(weight) : '—'}
            </Text>
            {weight > 0 && (
              <Text style={[typography.caption, { color: colors.textTertiary, marginLeft: 2 }]} allowFontScaling={false}>кг</Text>
            )}
            <Text style={[typography.body, { color: colors.textTertiary, marginHorizontal: 6 }]} allowFontScaling={false}>×</Text>
            <Text style={[typography.h3, { color: colors.text }]} allowFontScaling={false}>{reps}</Text>
          </View>
          {showPrev && (
            <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
              прошлый раз {fmt(prevSet!.weight!)}{prevSet?.reps ? ` × ${prevSet.reps}` : ''}
            </Text>
          )}
        </AnimatedPressable>

        {/* RPE — shown only once the set exists. A dash invites the tap; the
            eight-button strip that used to pop open here is gone. */}
        {set.completed && (
          <AnimatedPressable
            onPress={() => { haptic.selection(); setDraftRpe(set.rpe ?? suggestedRpe ?? 8); setSheet('rpe'); }}
            haptic={false}
            scaleDown={0.92}
            style={styles.rpeSlot as any}
            accessibilityRole="button"
            accessibilityLabel={set.rpe ? `Тяжесть ${set.rpe} из 10. Нажми, чтобы изменить` : 'Оценить тяжесть подхода'}
          >
            <Text style={{ fontSize: 8, fontWeight: '700', letterSpacing: 0.5, color: colors.textTertiary }}>RPE</Text>
            <Text
              style={[typography.bodyMedium, { color: set.rpe ? rpeColor(set.rpe, colors) : colors.primary }]}
              allowFontScaling={false}
            >
              {set.rpe ? fmt(set.rpe) : '—'}
            </Text>
          </AnimatedPressable>
        )}

        <CompleteButton completed={set.completed} onPress={handleComplete} colors={colors} est1RM={completed1RM} />
      </View>

      {/* Mounted only while open, so a screen of sets holds at most one Modal. */}
      {sheet === 'load' && (
        <NumberSheet
          visible
          onClose={() => setSheet(null)}
          title={`Подход ${setIndex + 1}`}
          // 0.5 kg steps so dumbbells and microplates are reachable; the
          // presets below jump in 2.5 kg, which is what the wheel would be
          // slow at. Coarse where it helps, fine where it must.
          primary={{ label: 'Вес', value: weight, onChange: pickWeight, min: 0, max: 300, step: 0.5, unit: 'кг' }}
          secondary={{ label: 'Повторения', value: reps, onChange: pickReps, min: 0, max: 60, step: 1 }}
          presets={buildPresets(weight, 2.5)}
          secondaryAction={onOpenPlates ? {
            label: 'Расчёт блинов',
            onPress: () => { setSheet(null); onOpenPlates(weight); },
          } : undefined}
          confirmLabel={set.completed ? 'Сохранить' : 'Готово'}
          onConfirm={() => {
            setSheet(null);
            // Either way the number is written through. A logged set is a
            // correction; an unlogged one is saved without being ticked off,
            // so the hero card above agrees with the row and nothing is lost
            // if the app is backgrounded before the set is done.
            if (set.completed) onComplete(Math.max(0, reps), Math.max(0, weight), true);
            else onValuesChange?.(Math.max(0, reps), Math.max(0, weight));
          }}
        />
      )}

      {sheet === 'rpe' && (
        <NumberSheet
          visible
          onClose={() => setSheet(null)}
          title="Насколько тяжело"
          primary={{ label: 'Тяжесть', value: draftRpe, onChange: setDraftRpe, min: 6, max: 10, step: 0.5, unit: 'из 10' }}
          presets={suggestedRpe ? [suggestedRpe] : []}
          confirmLabel={`${fmt(draftRpe)} — ${draftRpe >= 10 ? 'максимум' : draftRpe >= 9 ? 'тяжело' : draftRpe >= 8 ? 'сложно' : 'легко'}`}
          onConfirm={() => { onRpeChange(draftRpe); setSheet(null); }}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  setRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.sm,
  },
  values: {
    flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.xs,
  },
  rpeSlot: {
    minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  checkBtn: {
    width: 44, height: 44, borderRadius: borderRadius.sm,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
});
