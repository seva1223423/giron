import React, { useEffect } from 'react';
import { View, Text, TextInput } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Row {
  /** Uppercase metaLabel — e.g. "СЕГОДНЯ · КАЛОРИИ". */
  label: string;
  /** The numerator (animated from 0 → this value over 800ms on mount). */
  numerator: number;
  /** Static text after the numerator — e.g. " / 2 400 ккал". */
  suffix?: string;
  progress: number;
  color: string;
}

// react-native-reanimated requires us to animate the `text` prop of a
// TextInput (RN Text doesn't expose a controllable text prop without a
// re-render). This is the canonical pattern from the docs for
// hero-counter style animations.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** Counts up from 0 to `target` over `duration` ms. Used on the three
 *  hero numerators (calories, protein, week workouts) so the card feels
 *  like the dial coming to life when you open the screen. */
const AnimatedNumber: React.FC<{
  target: number;
  duration?: number;
  color: string;
  fontVariantNum?: boolean;
}> = ({ target, duration = 800, color, fontVariantNum = true }) => {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(target, { duration, easing: Easing.out(Easing.cubic) });
  }, [target, duration, v]);
  const animatedProps = useAnimatedProps(() => ({
    text: String(Math.round(v.value)),
    // The defaultValue keeps RN from warning about uncontrolled input.
    defaultValue: String(Math.round(v.value)),
  }) as any);
  return (
    <AnimatedTextInput
      // editable=false + pointerEvents=none make this a plain text node
      // for the user — they can't focus or copy from it.
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[
        typography.numberSmall,
        {
          color,
          padding: 0,
          margin: 0,
          fontVariant: fontVariantNum ? (['tabular-nums'] as const) : undefined,
        },
      ]}
      animatedProps={animatedProps}
    />
  );
};

interface Props {
  /** 0..1 — the hero ring completion (e.g. fraction of daily calorie target). */
  dayProgress: number;
  /** Three data rows rendered to the right of the ring. */
  rows: Row[];
}

// Re-export for any callers that imported from here; real source is the
// pure util so tests can run without the store graph.
import { clampProgress } from '../../../utils/layout';
export { clampProgress };

/** A small progress ring built on react-native-svg. Rotated -90° so the
 *  value starts from the top. Rounded cap keeps the stroke soft. */
const Ring: React.FC<{
  size: number;
  stroke: number;
  value: number;
  color: string;
  track: string;
}> = ({ size, stroke, value, color, track }) => {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const off = C * (1 - clampProgress(value));
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={off}
      />
    </Svg>
  );
};

/** A simple linear progress bar. Rounded pill with a filled segment.
 *  Width is clamped through clampProgress so NaN / Infinity don't cause
 *  React Native to warn about invalid percentage strings. */
const Bar: React.FC<{ value: number; color: string; track: string; height?: number }> = ({
  value,
  color,
  track,
  height = 4,
}) => (
  <View
    style={{
      height,
      backgroundColor: track,
      borderRadius: 999,
      overflow: 'hidden',
      width: '100%',
    }}
  >
    <View
      style={{
        height: '100%',
        width: `${clampProgress(value) * 100}%`,
        backgroundColor: color,
        borderRadius: 999,
      }}
    />
  </View>
);

/**
 * Home dashboard ring-stats card — pixel copy of Direction A:
 *
 *   ┌─────────────────────────────────────┐
 *   │  ┌─────┐    Калории   1 640 / 2 400 │
 *   │  │ 68% │    ▓▓▓▓▓▓▓▓▓▓              │
 *   │  │ ДЕНЬ│    Белок     98 / 160 г    │
 *   │  └─────┘    ▓▓▓▓▓▓▓▓▓▓              │
 *   │            Шаги      7 824 / 10 000 │
 *   │            ▓▓▓▓▓▓▓▓▓▓               │
 *   └─────────────────────────────────────┘
 *
 * The ring diameter (110) and stroke (8) match the design; the center
 * label uses the display heading spec; rows use captionMedium with a
 * monospaced value column.
 */
export const RingStatsCard: React.FC<Props> = ({ dayProgress, rows }) => {
  const colors = useThemeColors();
  // clampProgress already guards NaN/Infinity/out-of-range; the Math.round
  // stays because we want an integer for the "68%" display.
  const pct = Math.round(clampProgress(dayProgress) * 100);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 24,
        padding: 20,
        marginBottom: spacing.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
        <View style={{ width: 110, height: 110, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute' }}>
            <Ring
              size={110}
              stroke={8}
              value={dayProgress}
              color={colors.primary}
              track={colors.border}
            />
          </View>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Text
              style={[typography.h2, { color: colors.text, lineHeight: 28 }]}
            >
              {pct}%
            </Text>
            <Text
              style={[
                typography.metaLabel,
                { color: colors.textSecondary, textTransform: 'uppercase', marginTop: -2 },
              ]}
            >
              день
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: spacing.md }}>
          {rows.map((r) => (
            <View key={r.label}>
              {/* Bentley-pattern (PHILOSOPHY §4): metaLabel above the
                  number, big animated numerator + small static suffix
                  below, then the progress bar. Reads like a dashboard. */}
              <Text
                style={[
                  typography.metaLabel,
                  { color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 2 },
                ]}
              >
                {r.label}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
                <AnimatedNumber target={r.numerator} color={colors.text} />
                {r.suffix ? (
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.textSecondary, marginLeft: spacing.xs, fontVariant: ['tabular-nums'] },
                    ]}
                  >
                    {r.suffix}
                  </Text>
                ) : null}
              </View>
              <Bar value={r.progress} color={r.color} track={colors.border} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
};
