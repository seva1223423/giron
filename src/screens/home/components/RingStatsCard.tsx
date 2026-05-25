import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useThemeColors } from '../../../store';
import { typography } from '../../../theme';
import { spacing } from '../../../theme/spacing';

interface Row {
  label: string;
  value: string;
  progress: number;
  color: string;
  /** Optional day-over-day delta (-1..+∞ as a ratio: +0.05 = +5%).
   *  When provided, renders a compact `↑5%` / `↓12%` / `—` after
   *  the value. Semantic colour from the THEME (success / danger
   *  / tertiary). Audit R-2026-05-22 V4 design pick — fits in 375px
   *  without line-wrap. */
  delta?: number;
}

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

  // Audit R-2026-05-22 V3 design pick: auto-celebration state when EVERY
  // row hits 100% AND the hero ring also hits 100%. Switches palette to
  // sage (recovery/success Direction A) and shows a ✓ in the ring center.
  // No new prop needed — derived from existing data.
  const allHit = pct >= 100 && rows.every((r) => clampProgress(r.progress) >= 1);
  const SAGE = '#9AC28C';
  const heroColor = allHit ? SAGE : colors.primary;
  const heroBorder = allHit ? SAGE + '59' /* ~35% */ : colors.border;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: heroBorder,
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
              color={heroColor}
              track={colors.border}
            />
          </View>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {allHit ? (
              <Text style={{ color: SAGE, fontSize: 28, lineHeight: 30, fontWeight: '700' }}>✓</Text>
            ) : (
              <Text style={[typography.h2, { color: colors.text, lineHeight: 28 }]}>
                {pct}%
              </Text>
            )}
            <Text
              style={[
                typography.metaLabel,
                {
                  color: allHit ? SAGE : colors.textSecondary,
                  textTransform: 'uppercase',
                  marginTop: -2,
                  fontWeight: allHit ? '700' : undefined,
                },
              ]}
            >
              {allHit ? 'цели' : 'день'}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          {rows.map((r) => {
            // Render the compact delta if provided. Show only ABSOLUTE
            // value as percent + arrow; sign comes from colour. "—" for
            // flat (|delta| < 1%) to avoid noisy "↑0%" labels.
            const d = r.delta;
            const hasDelta = typeof d === 'number' && Number.isFinite(d);
            const absPct = hasDelta ? Math.abs(Math.round(d * 100)) : 0;
            const isFlat = hasDelta && absPct < 1;
            const isUp = hasDelta && d > 0 && !isFlat;
            const isDown = hasDelta && d < 0 && !isFlat;
            const deltaColor = isUp
              ? colors.success
              : isDown
                ? colors.error
                : colors.textTertiary;
            return (
              <View key={r.label}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 4,
                    gap: 6,
                  }}
                >
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>{r.label}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                    <Text style={[typography.caption, { color: colors.text, fontVariant: ['tabular-nums'] }]}>
                      {r.value}
                    </Text>
                    {hasDelta && (
                      <Text style={{ color: deltaColor, fontSize: 10, fontWeight: '600' }}>
                        {isFlat ? '—' : isUp ? `↑${absPct}%` : `↓${absPct}%`}
                      </Text>
                    )}
                  </View>
                </View>
                <Bar value={r.progress} color={r.color} track={colors.border} />
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};
