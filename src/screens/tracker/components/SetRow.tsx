import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withSequence,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useHaptic } from '../../../hooks/useHaptic';
import { AnimatedPressable } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

const SET_TYPES = ['normal', 'warmup', 'dropset'] as const;
const SET_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  normal:  { label: 'РАБ',  color: '#9E9E9E' },
  warmup:  { label: 'РАЗМ', color: '#FF9800' },
  dropset: { label: 'ДРОП', color: '#9C27B0' },
};
const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];

function rpeColor(rpe: number): string {
  if (rpe <= 7) return '#3BC46E';
  if (rpe <= 8) return '#F0A832';
  if (rpe <= 9) return '#F06432';
  return '#E8364F';
}

interface Props {
  set: any;
  setIndex: number;
  prevSet?: { weight?: number; reps?: number } | null;
  suggestedRpe?: number;
  onComplete: (reps: number, weight: number) => void;
  onRpeChange: (rpe: number) => void;
  onRemove?: () => void;
  onTypeChange?: (type: string) => void;
  onOpenPlates?: (weight: number) => void;
  colors: any;
}

function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// Animated complete button with spring pop
const CompleteButton: React.FC<{ completed: boolean; onPress: () => void; colors: any; est1RM: number }> = ({ completed, onPress, colors, est1RM }) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = useCallback(() => {
    scale.value = withSequence(
      withSpring(1.2, { damping: 6, stiffness: 700 }),
      withSpring(1, { damping: 12, stiffness: 400 }),
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onPress();
  }, [onPress, scale]);

  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={[animStyle, styles.checkBtn, { backgroundColor: completed ? colors.success : colors.inputBackground, borderColor: completed ? colors.success : colors.border }]}>
        <Text
          onPress={handlePress}
          style={{ color: completed ? '#FFF' : colors.textSecondary, fontWeight: '700', fontSize: 18, lineHeight: 44, textAlign: 'center', width: 44 }}
        >
          ✓
        </Text>
      </Animated.View>
      {est1RM > 0 && (
        <Text style={{ fontSize: 9, fontWeight: '600', color: colors.textTertiary, marginTop: 2 }}>
          ~{est1RM} 1ПМ
        </Text>
      )}
    </View>
  );
};

export const SetRow: React.FC<Props> = React.memo(({ set, setIndex, prevSet, suggestedRpe, onComplete, onRpeChange, onRemove, onTypeChange, onOpenPlates, colors }) => {
  const { width: screenW } = useWindowDimensions();
  const SHOW_PLATE_CALC = screenW > 360;
  const haptic = useHaptic();
  const initialWeight = set.weight ? set.weight.toString() : (prevSet?.weight ? prevSet.weight.toString() : '');
  const initialReps = set.reps ? set.reps.toString() : (prevSet?.reps ? prevSet.reps.toString() : '10');
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [showRpe, setShowRpe] = useState(false);
  const currentType = set.type || 'normal';

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

  return (
    <View style={{
      backgroundColor: set.completed ? colors.success + '10' : 'transparent',
      borderRadius: borderRadius.sm,
      marginBottom: 2,
      borderLeftWidth: set.completed ? 3 : 0,
      borderLeftColor: set.completed ? colors.success : 'transparent',
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
          <Text style={{ fontSize: 8, fontWeight: '700', letterSpacing: 0.5, marginBottom: 1, color: SET_TYPE_CONFIG[currentType].color }}>
            {SET_TYPE_CONFIG[currentType].label}
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
            onPress={() => { haptic.selection(); onOpenPlates(parseFloat(weight) || 0); }}
            haptic={false}
            scaleDown={0.9}
            style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.sm } as any}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>◎</Text>
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
      {!set.completed && (parseFloat(weight) === 0 || weight === '') && prevSet?.weight && (
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
                  backgroundColor: set.rpe === v ? rpeColor(v) : suggestedRpe === v ? colors.primary + '18' : colors.inputBackground,
                  borderColor: set.rpe === v ? rpeColor(v) : suggestedRpe === v ? colors.primary : colors.border,
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
            <Text style={[typography.caption, { color: rpeColor(set.rpe), marginLeft: spacing.xs, fontWeight: '700' }]}>
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
