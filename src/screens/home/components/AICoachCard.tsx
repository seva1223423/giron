import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useThemeColors, useThemeIsDark } from '../../../store';
import { useHaptic } from '../../../hooks/useHaptic';
import { Icon } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';

/**
 * One chip rendered above the hero copy. Use to surface a SINGLE
 * data signal driving the recommendation (streak count, days since
 * last workout, last RPE, sleep hours). Keep chips ≤2 — more is
 * noise.
 *
 * `accent: 'primary'` → gold tint (default for workout-day).
 * `accent: 'sage'`    → green tint (rest-day signals).
 * `accent: 'muted'`   → neutral border-only (secondary context).
 */
export interface AICoachChip {
  /** Short label shown after the icon. ≤ ~20 chars. */
  text: string;
  /** Emoji or 1-glyph symbol. Compact; not an Icon-name to keep the
   *  component self-contained without pulling the IconName union. */
  icon: string;
  accent?: 'primary' | 'sage' | 'muted';
}

interface Props {
  navigation: any;
  /** One-line recommendation copy from the AI coach. */
  recommendation: string;
  /** Visual mode. Default `'workout'` matches the existing
   *  production look. `'rest'` swaps to a sage palette + softer
   *  CTA, intended when restDayRecommendation has signal. */
  mode?: 'workout' | 'rest';
  /** Optional eyebrow override. Defaults vary by mode:
   *  workout → "Тренер рекомендует", rest → "День восстановления". */
  eyebrow?: string;
  /** Optional context chips shown between eyebrow and hero. Show ≤2. */
  chips?: AICoachChip[];
  /** Optional sub-text shown below the hero (the WHY paragraph in
   *  rest mode: "Тяжёлая тренировка + недосып. 24-48 ч..."). */
  subText?: string;
  /** Primary CTA label. Defaults per mode. */
  ctaLabel?: string;
  onPressCta: () => void;
  /** Refresh button. Workout-mode only — hidden in rest mode where
   *  refreshing rest advice would be a weird UX. */
  onPressRefresh?: () => void;
  /** Optional secondary action — rest-mode shows "Всё равно
   *  тренироваться" if provided. Workout-mode ignores it. */
  onPressSecondary?: () => void;
  secondaryLabel?: string;
  /** Active workout in progress — when set, the card overrides mode/rest
   *  and shows an "Идёт тренировка" state with a Continue CTA. Highest
   *  priority: a live session is the most actionable thing on the home
   *  screen. (Merged from master's b69c12e6 active-state design.) */
  activeWorkout?: { name: string } | null;
  /** Tap-through to the ActiveWorkout screen (used only in active state). */
  onPressContinue?: () => void;
}

/**
 * Hero AI coach card — Direction A design.
 *
 * Variants (audit R-2026-05-22, /goal-mode design exploration):
 *   - V1 (production): clean hero, no context. Trust feels assumed.
 *   - V2 chips: signal-driven context above hero. ← adopted as default
 *   - V4 rest-day: alt palette + softer CTAs. ← adopted as `mode='rest'`
 *   - V5 smart-state: one component with conditional branches. ← THIS
 *
 * `mode` switches the palette + default copy. `chips` surfaces the
 * data driving the recommendation (streak / days since / RPE / sleep).
 *
 * Backwards-compat: existing call sites that pass only
 * (recommendation, onPressCta, onPressRefresh) get the V1 look —
 * no chips, no subtext, gold palette. Adding chips upgrades to V2;
 * mode='rest' switches to V4.
 *
 * Layout reference: docs/design/variants/aiCoachCard/v5-smart-state.png
 */
export const AICoachCard: React.FC<Props> = ({
  recommendation,
  mode = 'workout',
  eyebrow,
  chips,
  subText,
  ctaLabel,
  onPressCta,
  onPressRefresh,
  onPressSecondary,
  secondaryLabel,
  activeWorkout,
  onPressContinue,
}) => {
  const colors = useThemeColors();
  const haptic = useHaptic();

  // Active workout wins over everything — a live session is the single
  // most actionable card on the home screen. Falls back to rest/workout.
  const isDark = useThemeIsDark();
  const isActive = !!activeWorkout;
  const isRest = !isActive && mode === 'rest';

  // Sage accent for rest-day. Matches the V4 mockup palette — chosen
  // for "recovery" semantics (green = nature/rest in Direction A).
  const SAGE = '#9AC28C';
  // Gold is chosen for THIS card's surface, not for the theme. colors.primary
  // is #86693B in light mode — deep enough to read on cream, but on the dark
  // card it is barely a shade off the background. The dark-theme gold is the
  // one that belongs here in both themes.
  const GOLD_ON_DARK = '#D4B07A';
  const accentColor = isRest ? SAGE : GOLD_ON_DARK;

  const eyebrowText = isActive
    ? 'Идёт тренировка'
    : eyebrow ?? (isRest ? 'День восстановления' : 'Тренер рекомендует');
  const heroText = isActive
    ? activeWorkout?.name ?? 'Текущая тренировка'
    : recommendation;
  const finalCtaLabel = isActive
    ? 'Продолжить'
    : ctaLabel ?? (isRest ? 'Обзор недели' : 'Начать тренировку');
  const finalOnPressCta = isActive ? (onPressContinue ?? onPressCta) : onPressCta;

  // This card paints its own dark gradient in BOTH themes, so text on it must
  // not follow the theme. In light mode colors.text is #17171A — near-black on
  // a near-black card, about 1.2:1, and the recommendation line vanished. The
  // profile hero already pins its text for exactly this reason.
  const onDark = '#F4F1EA';
  const onDarkDim = 'rgba(244,241,234,0.74)';

  // Gradient stops — warmer for workout, cooler/sage for rest.
  //
  // The card is a dark slab in both themes, but "dark" has to mean different
  // things depending on what surrounds it. On the graphite background of the
  // dark theme these near-black stops sit right. On the cream background of
  // the light theme they read as a hole punched in the page — the founder's
  // words were "слишком чёрный". The light-theme stops below are the same
  // hues lifted until the card reads as a warm accent instead of a void,
  // while still holding light text at better than 10:1.
  const gradStops = isRest
    ? (isDark
        ? { a: '#14201A', b: '#1A2520', c: '#1E2A22' }
        : { a: '#2B3A31', b: '#36463B', c: '#3F5145' })
    : (isDark
        ? { a: '#1E1810', b: '#2A1F12', c: '#382612' }
        : { a: '#3B2F21', b: '#4A3A26', c: '#5A4527' });
  const glowColor = accentColor;
  const glowOpacity = isRest ? 0.12 : 0.2;

  return (
    <View
      style={{
        position: 'relative',
        borderRadius: 28,
        borderWidth: 1,
        borderColor: isRest ? SAGE + '2E' /* 18% */ : colors.border,
        marginBottom: spacing.lg,
        overflow: 'hidden',
      }}
    >
      {/* Background gradient + corner glow — same SVG strategy as V1;
          only the colour stops change per mode. */}
      <Svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="aiBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradStops.a} stopOpacity={1} />
            <Stop offset="0.6" stopColor={gradStops.b} stopOpacity={1} />
            <Stop offset="1" stopColor={gradStops.c} stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id="aiGlow" cx="85%" cy="0%" rx="45%" ry="45%">
            <Stop offset="0" stopColor={glowColor} stopOpacity={glowOpacity} />
            <Stop offset="1" stopColor={glowColor} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#aiBg)" />
        <Rect width="100%" height="100%" fill="url(#aiGlow)" />
      </Svg>

      <View style={{ padding: 22, position: 'relative' }}>
        {/* Eyebrow: small gold/sage square + uppercase label */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: accentColor,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: spacing.sm,
            }}
          >
            <Icon
              name={isActive ? 'play' : isRest ? 'moon' : 'spark'}
              size={16}
              color={colors.textInverse}
              strokeWidth={2.2}
            />
          </View>
          <Text
            style={{
              color: accentColor,
              fontSize: 12,
              fontWeight: '600',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {eyebrowText}
          </Text>
        </View>

        {/* Context chips — V2 + V5. Empty array / undefined → no row */}
        {chips && chips.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.sm, flexWrap: 'wrap' }}>
            {chips.slice(0, 3).map((chip, i) => {
              const isPrimary = (chip.accent ?? (isRest ? 'sage' : 'primary')) === 'primary';
              const isSage = chip.accent === 'sage';
              const tintColor = isPrimary ? colors.primary : isSage ? SAGE : colors.textSecondary;
              const borderTint = isPrimary
                ? colors.primary + '4D'
                : isSage
                  ? SAGE + '4D'
                  : 'rgba(255,255,255,0.10)';
              const bgTint = isPrimary
                ? colors.primary + '1A'
                : isSage
                  ? SAGE + '1A'
                  : 'rgba(255,255,255,0.06)';
              return (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 100,
                    backgroundColor: bgTint,
                    borderWidth: 1,
                    borderColor: borderTint,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>{chip.icon}</Text>
                  <Text style={{ color: tintColor, fontSize: 11, fontWeight: '600' }}>
                    {chip.text}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Hero recommendation copy */}
        <Text
          style={[
            typography.h3,
            {
              color: onDark,
              lineHeight: 26,
              maxWidth: 280,
            },
          ]}
        >
          {heroText}
        </Text>

        {/* Optional WHY paragraph — rest-mode usage. */}
        {subText && (
          <Text
            style={{
              color: onDarkDim,
              fontSize: 13,
              lineHeight: 18,
              marginTop: 10,
              maxWidth: 290,
            }}
          >
            {subText}
          </Text>
        )}

        {/* Action row. Layout depends on mode + which secondary is provided. */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
          <TouchableOpacity
            onPress={() => { haptic.medium(); finalOnPressCta(); }}
            accessibilityLabel={finalCtaLabel}
            accessibilityRole="button"
            style={{
              flex: 1,
              height: 44,
              borderRadius: borderRadius.lg,
              backgroundColor: isRest ? 'transparent' : accentColor,
              borderWidth: isRest ? 1 : 0,
              borderColor: isRest ? accentColor : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={[
                typography.smallMedium,
                // On the gold button the label is dark in both themes:
                // colors.textInverse is cream in light mode, which would be
                // light-on-gold.
                { color: isRest ? accentColor : '#17171A' },
              ]}
            >
              {finalCtaLabel}
            </Text>
          </TouchableOpacity>

          {/* Workout-mode: refresh icon. Rest-mode: optional secondary
              text button ("Всё равно тренироваться"). Active-mode: neither. */}
          {!isRest && !isActive && onPressRefresh && (
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
          {isRest && onPressSecondary && (
            <TouchableOpacity
              onPress={() => { haptic.selection(); onPressSecondary(); }}
              accessibilityLabel={secondaryLabel ?? 'Всё равно тренироваться'}
              accessibilityRole="button"
              style={{
                height: 44,
                paddingHorizontal: 14,
                borderRadius: borderRadius.lg,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[typography.smallMedium, { color: onDarkDim }]}>
                {secondaryLabel ?? 'Всё равно'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};
