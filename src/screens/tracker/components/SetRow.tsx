import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, useWindowDimensions, Pressable } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useHaptic } from '../../../hooks/useHaptic';
import { AnimatedPressable, Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { estimateOneRepMaxRounded as estimate1RM } from '../../../utils/oneRepMax';

const SET_TYPES = ['normal', 'warmup', 'dropset'] as const;
/** Set-type chip config — colors resolved per-call from theme so chips
 *  follow light/dark mode. Was literal hex; refactored to use Direction A
 *  semantic tokens (primary/warning/error). Same Russian labels. */
const buildSetTypeConfig = (colors: any): Record<string, { label: string; color: string }> => ({
  normal:  { label: 'РАБ',  color: colors.primary }, // champagne gold
  warmup:  { label: 'РАЗМ', color: colors.warning }, // warm amber
  dropset: { label: 'ДРОП', color: colors.error },   // terracotta
});
const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/** RPE scale colors — sage → amber → terracotta, theme-aware.
 *  Maps directly to Direction A semantic tokens (success/warning/error).
 *  Near-failure (RPE 9.5+) falls back to error so light & dark modes both
 *  resolve correctly. */
function rpeColor(rpe: number, colors: any): string {
  if (rpe <= 7) return colors.success;  // sage (good)
  if (rpe <= 8) return colors.warning;  // amber (warn)
  return colors.error;                  // terracotta (danger / near failure)
}

interface Props {
  set: any;
  setIndex: number;
  prevSet?: { weight?: number; reps?: number } | null;
  suggestedRpe?: number;
  /** True if this is the first uncompleted set — the row gets a gold
   *  left-border + faint tint so the user's eye lands here. PHILOSOPHY §3. */
  isActive?: boolean;
  onComplete: (reps: number, weight: number) => void;
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
    accessibilityLabel={completed ? 'Сет выполнен' : 'Отметить сет выполненным'}
    style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
  >
    <Icon name="check" size={20} color={completed ? colors.textInverse : colors.textSecondary} strokeWidth={3} />
  </Pressable>
);

export const SetRow: React.FC<Props> = React.memo(({ set, setIndex, prevSet, suggestedRpe, isActive, onComplete, onRpeChange, onRemove, onTypeChange, onOpenPlates, colors }) => {
  const { width: screenW } = useWindowDimensions();
  const SHOW_PLATE_CALC = screenW > 360;
  const haptic = useHaptic();
  const initialWeight = set.weight ? set.weight.toString() : (prevSet?.weight ? prevSet.weight.toString() : '');
  const initialReps = set.reps ? set.reps.toString() : (prevSet?.reps ? prevSet.reps.toString() : '10');
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [showRpe, setShowRpe] = useState(false);
  const currentType = set.type || 'normal';
  const setTypeConfig = buildSetTypeConfig(colors);

  const handleComplete = useCallback(() => {
    if (set.completed) return;
    let finalWeight = Math.max(0, parseFloat(weight.replace(',', '.')) || 0);
    let finalReps = Math.max(0, parseInt(reps, 10) || 0);
    if (finalWeight === 0 && prevSet?.weight) {
      finalWeight = prevSet.weight;
      setWeight(String(prevSet.weight));
    }
    if (finalReps === 0 && prevSet?.reps) {
      finalReps = prevSet.reps;
      setReps(String(prevSet.reps));
    }
    onComplete(finalReps, finalWeight);
    setShowRpe(true);
  }, [weight, reps, prevSet, onComplete]);

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

  return (
    <View style={{
      backgroundColor: rowBg,
      borderRadius: borderRadius.sm,
      marginBottom: 2,
      borderLeftWidth: borderWidth,
      borderLeftColor: borderColor,
    }}>
      <View style={[styles.setRow, { paddingVertical: spacing.sm }]}>
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

        {/* Weight stepper */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <AnimatedPressable
            onPress={() => { haptic.selection(); const v = parseFloat(weight.replace(',', '.')) || 0; setWeight(String(Math.max(0, Math.round((v - 2.5) * 4) / 4))); }}
            haptic={false}
            scaleDown={0.85}
            style={[styles.stepBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }] as any}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 17 }}>−</Text>
          </AnimatedPressable>
          <TextInput
            style={[styles.setInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
            placeholder={prevSet?.weight ? prevSet.weight.toString() : '0'}
            placeholderTextColor={prevSet?.weight ? colors.primary + '60' : colors.inputPlaceholder}
          />
          <AnimatedPressable
            onPress={() => { haptic.selection(); const v = parseFloat(weight.replace(',', '.')) || 0; setWeight(String(Math.round((v + 2.5) * 4) / 4)); }}
            haptic={false}
            scaleDown={0.85}
            style={[styles.stepBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }] as any}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 17 }}>+</Text>
          </AnimatedPressable>
        </View>

        {/* Plate calc */}
        {SHOW_PLATE_CALC && onOpenPlates && (
          <AnimatedPressable
            onPress={() => { haptic.selection(); onOpenPlates(parseFloat(weight.replace(',', '.')) || 0); }}
            haptic={false}
            scaleDown={0.9}
            style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.sm } as any}
          >
            <Icon name="dumbbell" size={16} color={colors.primary} />
          </AnimatedPressable>
        )}

        {/* Reps stepper */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <AnimatedPressable
            onPress={() => { haptic.selection(); const v = parseInt(reps, 10) || 0; setReps(String(Math.max(1, v - 1))); }}
            haptic={false}
            scaleDown={0.85}
            style={[styles.stepBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }] as any}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 17 }}>−</Text>
          </AnimatedPressable>
          <TextInput
            style={[styles.setInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
            value={reps}
            onChangeText={setReps}
            keyboardType="numeric"
            placeholder="10"
            placeholderTextColor={colors.inputPlaceholder}
          />
          <AnimatedPressable
            onPress={() => { haptic.selection(); const v = parseInt(reps, 10) || 0; setReps(String(v + 1)); }}
            haptic={false}
            scaleDown={0.85}
            style={[styles.stepBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }] as any}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 17 }}>+</Text>
          </AnimatedPressable>
        </View>

        {/* Complete button */}
        <CompleteButton completed={set.completed} onPress={handleComplete} colors={colors} est1RM={completed1RM} />
      </View>

      {/* Quick weight presets */}
      {!set.completed && (parseFloat(weight.replace(',', '.')) === 0 || weight === '') && prevSet?.weight && (
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 2, paddingHorizontal: spacing.sm, paddingBottom: spacing.xs, flexWrap: 'wrap' }}>
          {[prevSet.weight, prevSet.weight + 2.5, prevSet.weight + 5, prevSet.weight - 5].filter(w => w > 0).map((w) => (
            <AnimatedPressable
              key={w}
              onPress={() => { haptic.selection(); setWeight(String(w)); }}
              haptic={false}
              scaleDown={0.91}
              style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '30' } as any}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>{w}</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}

      {/* RPE picker */}
      {set.completed && showRpe && (
        <View style={[styles.rpePicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[typography.caption, { color: colors.textTertiary, marginRight: spacing.sm }]}>RPE</Text>
          {RPE_VALUES.map((v) => (
            <View key={v} style={{ alignItems: 'center' }}>
              <AnimatedPressable
                onPress={() => { haptic.selection(); onRpeChange(v); setShowRpe(false); }}
                haptic={false}
                scaleDown={0.88}
                style={[styles.rpeBtn, {
                  backgroundColor: set.rpe === v ? rpeColor(v, colors) : suggestedRpe === v ? colors.primary + '18' : colors.inputBackground,
                  borderColor: set.rpe === v ? rpeColor(v, colors) : suggestedRpe === v ? colors.primary : colors.border,
                  borderWidth: suggestedRpe === v && set.rpe !== v ? 2 : 1,
                }] as any}
              >
                <Text style={[typography.small, { color: set.rpe === v ? '#fff' : suggestedRpe === v ? colors.primary : colors.textSecondary, fontWeight: '700' }]}>{v}</Text>
              </AnimatedPressable>
              {suggestedRpe === v && set.rpe !== v && (
                <Text style={{ fontSize: 8, color: colors.primary, fontWeight: '600', marginTop: 1 }}>ожид.</Text>
              )}
            </View>
          ))}
          {set.rpe && (
            <Text style={[typography.caption, { color: rpeColor(set.rpe, colors), marginLeft: spacing.xs, fontWeight: '700' }]}>
              {set.rpe >= 10 ? 'Макс' : set.rpe >= 9 ? 'Тяжело' : set.rpe >= 8 ? 'Сложно' : 'Легко'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  setRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.md,
  },
  setInput: {
    flex: 1, textAlign: 'center', paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm, borderWidth: 1, fontSize: 16, fontWeight: '600',
    minHeight: 40,
  },
  checkBtn: {
    width: 44, height: 44, borderRadius: borderRadius.sm,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  stepBtn: {
    width: 32, height: 44, borderRadius: borderRadius.sm,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  rpePicker: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm, marginTop: 2, marginBottom: spacing.xs,
    borderRadius: borderRadius.sm, borderWidth: 1, flexWrap: 'wrap', gap: 4,
  },
  rpeBtn: {
    width: 38, height: 38, borderRadius: borderRadius.sm,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
