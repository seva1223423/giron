import React, { useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Animated, Pressable } from 'react-native';
import { useHaptic } from '../hooks/useHaptic';
import { useSafeBottom } from '../hooks/useSafeBottom';
import { useThemeColors } from '../store';
import { typography } from '../theme';
import { spacing, borderRadius } from '../theme/spacing';
import { NumberWheel } from './NumberWheel';
import { buildPresets } from '../utils/wheel';

export { buildPresets };

/**
 * Bottom sheet for entering one or two numbers.
 *
 * The app's single answer to "change this value". It replaces the ± button
 * pairs that were scattered across the set row, the nutrition goals, the
 * water tracker, the steps goal and the program builder — roughly forty
 * buttons, each a small target, each implemented slightly differently.
 *
 * Layout, top to bottom: presets (the handful of values actually used, one
 * tap each) → wheel (any value at all) → one confirm button. Everything the
 * finger touches sits in the bottom third of the screen.
 */

interface WheelSpec {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Sheet caption, e.g. "Подход 2" or "Дневные цели". */
  title: string;
  primary: WheelSpec;
  /** Optional second wheel shown beside the first (weight × reps). */
  secondary?: WheelSpec;
  /** One-tap values for the primary wheel. Pass [] to hide the row. */
  presets?: number[];
  /** Text link under the wheels — e.g. the plate calculator, which belongs
   *  here next to the weight rather than as an icon in every set row. */
  secondaryAction?: { label: string; onPress: () => void };
  confirmLabel: string;
  onConfirm: () => void;
}

export const NumberSheet: React.FC<Props> = ({
  visible, onClose, title, primary, secondary, presets, secondaryAction, confirmLabel, onConfirm,
}) => {
  const colors = useThemeColors();
  const haptic = useHaptic();
  const safeBottom = useSafeBottom();
  const slide = useRef(new Animated.Value(400)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slide, { toValue: 0, tension: 90, friction: 13, useNativeDriver: true }).start();
    } else {
      slide.setValue(400);
    }
  }, [visible, slide]);

  const chips = presets ?? [];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
      />
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            paddingBottom: safeBottom + spacing.md,
            transform: [{ translateY: slide }],
          },
        ]}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <Text style={[typography.captionMedium, { color: colors.textTertiary, textAlign: 'center', letterSpacing: 1 }]}>
          {title.toUpperCase()}
        </Text>

        {chips.length > 0 && (
          <View style={styles.chips}>
            {chips.map((p) => {
              const active = Math.abs(p - primary.value) < 1e-6;
              return (
                <TouchableOpacity
                  key={p}
                  onPress={() => { haptic.selection(); primary.onChange(p); }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary + '26' : colors.surface,
                      borderColor: active ? colors.primary + '6B' : colors.border,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${primary.label} ${p}${primary.unit ? ` ${primary.unit}` : ''}`}
                >
                  <Text
                    style={[typography.smallMedium, { color: active ? colors.primary : colors.textSecondary }]}
                    allowFontScaling={false}
                  >
                    {Number.isInteger(p) ? p : Math.round(p * 100) / 100}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.wheels}>
          <View style={{ flex: 1 }}>
            <NumberWheel
              value={primary.value}
              onChange={primary.onChange}
              min={primary.min}
              max={primary.max}
              step={primary.step}
              unit={primary.unit}
              label={primary.label}
              testID="sheet-wheel-primary"
            />
          </View>
          {secondary && (
            <>
              <Text style={[typography.body, { color: colors.textTertiary, alignSelf: 'center' }]}>×</Text>
              <View style={{ flex: 1 }}>
                <NumberWheel
                  value={secondary.value}
                  onChange={secondary.onChange}
                  min={secondary.min}
                  max={secondary.max}
                  step={secondary.step}
                  unit={secondary.unit}
                  label={secondary.label}
                  testID="sheet-wheel-secondary"
                />
              </View>
            </>
          )}
        </View>

        {secondaryAction && (
          <TouchableOpacity
            onPress={secondaryAction.onPress}
            style={styles.link}
            accessibilityRole="button"
            accessibilityLabel={secondaryAction.label}
          >
            <Text style={[typography.smallMedium, { color: colors.primary }]}>{secondaryAction.label}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => { haptic.success(); onConfirm(); }}
          style={[styles.cta, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
        >
          <Text style={[typography.bodySemibold, { color: colors.textInverse }]}>{confirmLabel}</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl,
    borderTopWidth: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.md },
  chip: {
    minWidth: 56, minHeight: 40, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  wheels: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.sm },
  link: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cta: {
    minHeight: 52, borderRadius: borderRadius.lg,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm,
  },
});
