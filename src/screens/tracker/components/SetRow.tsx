import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { useHaptic } from '../../../hooks/useHaptic';
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

export const SetRow: React.FC<Props> = React.memo(({ set, setIndex, prevSet, suggestedRpe, onComplete, onRpeChange, onRemove, onTypeChange, onOpenPlates, colors }) => {
  const haptic = useHaptic();
  const initialWeight = set.weight ? set.weight.toString() : (prevSet?.weight ? prevSet.weight.toString() : '');
  const initialReps = set.reps ? set.reps.toString() : (prevSet?.reps ? prevSet.reps.toString() : '10');
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [showRpe, setShowRpe] = useState(false);
  const currentType = set.type || 'normal';

  return (
    <View style={{ backgroundColor: set.completed ? colors.success + '10' : 'transparent', borderRadius: borderRadius.sm, marginBottom: 2 }}>
      <View style={[styles.setRow, { paddingVertical: spacing.sm }]}>
        {/* Set number / type badge */}
        <TouchableOpacity
          onPress={onTypeChange ? () => {
            haptic.selection();
            const idx = SET_TYPES.indexOf(currentType as any);
            onTypeChange(SET_TYPES[(idx + 1) % SET_TYPES.length]);
          } : undefined}
          onLongPress={onRemove}
          delayLongPress={500}
          style={{ width: 40, alignItems: 'center' }}
        >
          <Text style={{ fontSize: 8, fontWeight: '700', letterSpacing: 0.5, marginBottom: 1, color: SET_TYPE_CONFIG[currentType].color }}>
            {SET_TYPE_CONFIG[currentType].label}
          </Text>
          <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>{setIndex + 1}</Text>
        </TouchableOpacity>

        {/* Weight stepper */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <TouchableOpacity
            onPress={() => { haptic.selection(); const v = parseFloat(weight.replace(',', '.')) || 0; setWeight(String(Math.max(0, Math.round((v - 2.5) * 4) / 4))); }}
            style={[styles.stepBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 15 }}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.setInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
            placeholder={prevSet?.weight ? prevSet.weight.toString() : '0'}
            placeholderTextColor={prevSet?.weight ? colors.primary + '60' : colors.inputPlaceholder}
          />
          <TouchableOpacity
            onPress={() => { haptic.selection(); const v = parseFloat(weight.replace(',', '.')) || 0; setWeight(String(Math.round((v + 2.5) * 4) / 4)); }}
            style={[styles.stepBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 15 }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Plate calc */}
        {onOpenPlates && (
          <TouchableOpacity
            onPress={() => { haptic.selection(); onOpenPlates(parseFloat(weight) || 0); }}
            style={{ paddingHorizontal: spacing.xs, paddingVertical: spacing.xs }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <Text style={{ fontSize: 16 }}>🏋️</Text>
          </TouchableOpacity>
        )}

        {/* Reps stepper */}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <TouchableOpacity
            onPress={() => { haptic.selection(); const v = parseInt(reps) || 0; setReps(String(Math.max(1, v - 1))); }}
            style={[styles.stepBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 15 }}>−</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.setInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.text }]}
            value={reps}
            onChangeText={setReps}
            keyboardType="numeric"
            placeholder="10"
            placeholderTextColor={colors.inputPlaceholder}
          />
          <TouchableOpacity
            onPress={() => { haptic.selection(); const v = parseInt(reps) || 0; setReps(String(v + 1)); }}
            style={[styles.stepBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: '800', fontSize: 15 }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Complete button */}
        <TouchableOpacity
          style={[styles.checkBtn, { backgroundColor: set.completed ? colors.success : colors.inputBackground, borderColor: set.completed ? colors.success : colors.border }]}
          onPress={() => {
            onComplete(parseInt(reps) || 0, parseFloat(weight.replace(',', '.')) || 0);
            setShowRpe(true);
          }}
        >
          <Text style={{ color: set.completed ? '#FFF' : colors.textSecondary, fontWeight: '700' }}>✓</Text>
        </TouchableOpacity>
      </View>

      {/* RPE picker */}
      {set.completed && showRpe && (
        <View style={[styles.rpePicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[typography.caption, { color: colors.textTertiary, marginRight: spacing.sm }]}>RPE</Text>
          {RPE_VALUES.map((v) => (
            <View key={v} style={{ alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => { haptic.selection(); onRpeChange(v); setShowRpe(false); }}
                style={[styles.rpeBtn, { backgroundColor: set.rpe === v ? rpeColor(v) : colors.inputBackground, borderColor: set.rpe === v ? rpeColor(v) : suggestedRpe === v ? colors.primary : colors.border, borderWidth: suggestedRpe === v && set.rpe !== v ? 1.5 : 1 }]}
              >
                <Text style={[typography.small, { color: set.rpe === v ? '#fff' : colors.textSecondary, fontWeight: '700' }]}>{v}</Text>
              </TouchableOpacity>
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
  },
  checkBtn: {
    width: 40, height: 40, borderRadius: borderRadius.sm,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5,
  },
  stepBtn: {
    width: 26, height: 36, borderRadius: borderRadius.sm,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  rpePicker: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs, marginTop: 2, marginBottom: spacing.xs,
    borderRadius: borderRadius.sm, borderWidth: 1, flexWrap: 'wrap', gap: 4,
  },
  rpeBtn: {
    width: 34, height: 28, borderRadius: borderRadius.sm,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
