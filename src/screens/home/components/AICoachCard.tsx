import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useThemeStore } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

interface Props {
  navigation: any;
  /** One-line recommendation copy from the AI coach, e.g.
   *  "Сегодня — грудь и трицепс. Жим штанги на 2.5 кг больше". */
  recommendation: string;
  /** Uppercase eyebrow — the "ТРЕНЕР РЕКОМЕНДУЕТ" label. */
  eyebrow?: string;
  /** Primary CTA label (gold pill). */
  ctaLabel?: string;
  onPressCta: () => void;
  /** Secondary "regenerate" tap — refreshes the recommendation. */
  onPressRefresh?: () => void;
}

/**
 * Hero AI coach card — pixel copy of the Direction A home design:
 *
 *   • Warm graphite → deep-amber 135° linear gradient background
 *   • Soft gold radial glow in the top-right
 *   • Uppercase eyebrow "ТРЕНЕР РЕКОМЕНДУЕТ" with a small gold square icon
 *   • 22pt display recommendation copy, tightly tracked
 *   • Gold pill primary CTA + circular refresh button to the right
 *
 * Data in, UI out — parent decides the recommendation text and wires
 * the CTAs. The SVG gradient/glow keeps things on-brand without pulling
 * in an extra gradient library (we already depend on react-native-svg).
 */
export const AICoachCard: React.FC<Props> = ({
  recommendation,
  eyebrow = 'Тренер рекомендует',
  ctaLabel = 'Начать тренировку',
  onPressCta,
  onPressRefresh,
}) => {
  const { colors } = useThemeStore();
  const haptic = useHaptic();

  return (
    <View
      style={{
        position: 'relative',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: spacing.lg,
        overflow: 'hidden',
      }}
    >
      {/* Background gradient — graphite (#1E1810) → warm brown (#2A1F12) →
          amber (#382612). Matches the design export exactly. */}
      <Svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="aiBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#1E1810" stopOpacity={1} />
            <Stop offset="0.6" stopColor="#2A1F12" stopOpacity={1} />
            <Stop offset="1" stopColor="#382612" stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id="aiGlow" cx="85%" cy="0%" rx="45%" ry="45%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={0.2} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#aiBg)" />
        <Rect width="100%" height="100%" fill="url(#aiGlow)" />
      </Svg>

      <View style={{ padding: 22, position: 'relative' }}>
        {/* Eyebrow: small gold square + uppercase label */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: spacing.sm,
            }}
          >
            <Icon name="spark" size={16} color={colors.textInverse} strokeWidth={2.2} />
          </View>
          <Text
            style={{
              color: colors.primary,
              fontSize: 12,
              fontWeight: '600',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {eyebrow}
          </Text>
        </View>

        {/* Hero recommendation copy — 22pt display, tight tracking */}
        <Text
          style={[
            typography.h3,
            {
              color: colors.text,
              lineHeight: 26,
              maxWidth: 280,
            },
          ]}
        >
          {recommendation}
        </Text>

        {/* Action row: gold pill CTA + circular refresh */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
          <TouchableOpacity
            onPress={() => { haptic.medium(); onPressCta(); }}
            accessibilityLabel={ctaLabel}
            accessibilityRole="button"
            style={{
              flex: 1,
              height: 44,
              borderRadius: borderRadius.lg,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.textInverse, fontSize: 14, fontWeight: '600' }}>
              {ctaLabel}
            </Text>
          </TouchableOpacity>
          {onPressRefresh && (
            <TouchableOpacity
              onPress={() => { haptic.selection(); onPressRefresh(); }}
              accessibilityLabel="Обновить рекомендацию"
              accessibilityRole="button"
              style={{
                width: 44,
                height: 44,
                borderRadius: borderRadius.lg,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="refresh" size={18} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};
