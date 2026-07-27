import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import Svg, { Ellipse, Path, Rect, Circle } from 'react-native-svg';
import { Card } from '../../../components';
import { typography } from '../../../theme';
import { spacing, borderRadius } from '../../../theme/spacing';
import { exercises as allExercises } from '../../../data/exercises';
import type { Workout } from '../../../types';

interface Props {
  colors: any;
  workoutHistory: Workout[];
}

// Muscle intensity: total working sets in the last 7 days per muscle group
function useMuscleLoad(workoutHistory: Workout[]) {
  return useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    const load: Record<string, number> = {};
    workoutHistory.forEach((w) => {
      if (!w.completedAt || new Date(w.completedAt).getTime() < cutoff) return;
      w.exercises.forEach((ex) => {
        const def = allExercises.find((e) => e.id === ex.exerciseId);
        if (!def) return;
        const workingSets = ex.sets.filter((s) => s.completed && s.type !== 'warmup').length;
        if (workingSets === 0) return;
        [...(def.primaryMuscles ?? [])].forEach((m) => {
          load[m] = (load[m] ?? 0) + workingSets;
        });
        [...(def.secondaryMuscles ?? [])].forEach((m) => {
          load[m] = (load[m] ?? 0) + workingSets * 0.4;
        });
      });
    });
    return load;
  }, [workoutHistory]);
}

function intensity(load: number): number {
  if (load <= 0) return 0;
  if (load < 3) return 0.25;
  if (load < 7) return 0.55;
  if (load < 12) return 0.8;
  return 1;
}

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Грудь', back: 'Спина', shoulders: 'Плечи', biceps: 'Бицепс',
  triceps: 'Трицепс', forearms: 'Предплечья', quadriceps: 'Квадрицепс',
  hamstrings: 'Бицепс бедра', glutes: 'Ягодицы', calves: 'Икры',
  abs: 'Пресс', traps: 'Трапеции', lats: 'Широчайшие', lower_back: 'Поясница',
};

/**
 * True when the surface behind the figure is dark.
 *
 * Replaces 21 comparisons against the literal '#0A0A0F' — a background colour
 * that no longer exists in the theme, so the dark branch NEVER ran. In dark
 * mode the head, hands and feet were painted near-white, and untrained muscles
 * used the light "empty" tone, coming out BRIGHTER than trained ones: the heat
 * map read backwards on the tab it appears on by default (audit R20).
 * Deriving it from luminance keeps it correct through any future palette change.
 */
function isDarkSurface(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

// Color interpolation: from base (light grey) to hot (primary)
function muscleColor(load: number, primary: string, bg: string): string {
  const t = intensity(load);
  if (t === 0) return bg;
  // Interpolate between a muted tone and the primary color
  const hex2rgb = (h: string) => {
    const c = h.replace('#', '');
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  };
  const p = hex2rgb(primary);
  const base = [160, 160, 170];
  const r = Math.round(base[0] + (p[0] - base[0]) * t);
  const g = Math.round(base[1] + (p[1] - base[1]) * t);
  const b = Math.round(base[2] + (p[2] - base[2]) * t);
  const toH = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}

// --- Front body SVG (simplified anatomical shapes) ---
// ViewBox: 0 0 100 220
const FrontBody: React.FC<{ load: Record<string, number>; primary: string; bgColor: string; borderColor: string }> = ({ load, primary, bgColor, borderColor }) => {
  const c = (m: string) => muscleColor(load[m] ?? 0, primary, isDarkSurface(bgColor) ? '#1e1e2e' : '#dde0ee');
  const stroke = borderColor;
  const sw = '0.8';
  return (
    <Svg viewBox="0 0 100 220" width="100%" height="100%">
      {/* Head */}
      <Ellipse cx="50" cy="14" rx="11" ry="13" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
      {/* Neck */}
      <Rect x="45" y="25" width="10" height="7" rx="2" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />

      {/* Shoulders */}
      <Ellipse cx="28" cy="38" rx="10" ry="7" fill={c('shoulders')} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="72" cy="38" rx="10" ry="7" fill={c('shoulders')} stroke={stroke} strokeWidth={sw} />

      {/* Chest */}
      <Path d="M36,32 Q50,28 64,32 L66,52 Q50,56 34,52 Z" fill={c('chest')} stroke={stroke} strokeWidth={sw} />

      {/* Biceps */}
      <Ellipse cx="21" cy="57" rx="6" ry="12" fill={c('biceps')} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="79" cy="57" rx="6" ry="12" fill={c('biceps')} stroke={stroke} strokeWidth={sw} />

      {/* Forearms */}
      <Ellipse cx="18" cy="81" rx="5" ry="11" fill={c('forearms')} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="82" cy="81" rx="5" ry="11" fill={c('forearms')} stroke={stroke} strokeWidth={sw} />

      {/* Hands */}
      <Ellipse cx="16" cy="97" rx="5" ry="6" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="84" cy="97" rx="5" ry="6" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />

      {/* Abs */}
      <Path d="M38,52 Q50,56 62,52 L62,92 Q50,96 38,92 Z" fill={c('abs')} stroke={stroke} strokeWidth={sw} />
      {/* Abs grid lines */}
      {[62, 72, 82].map((y) => (
        <Path key={y} d={`M40,${y} Q50,${y + 1} 60,${y}`} fill="none" stroke={stroke} strokeWidth="0.5" opacity="0.5" />
      ))}
      <Path d="M50,52 L50,92" fill="none" stroke={stroke} strokeWidth="0.5" opacity="0.5" />

      {/* Hip / groin area */}
      <Path d="M38,92 Q50,96 62,92 L64,108 Q50,112 36,108 Z" fill={c('abs')} stroke={stroke} strokeWidth={sw} opacity="0.7" />

      {/* Quadriceps */}
      <Path d="M36,108 Q42,110 44,112 L43,155 Q38,158 34,154 L33,112 Z" fill={c('quadriceps')} stroke={stroke} strokeWidth={sw} />
      <Path d="M64,108 Q58,110 56,112 L57,155 Q62,158 66,154 L67,112 Z" fill={c('quadriceps')} stroke={stroke} strokeWidth={sw} />

      {/* Knees */}
      <Ellipse cx="39" cy="158" rx="7" ry="5" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="61" cy="158" rx="7" ry="5" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />

      {/* Calves (front shin) */}
      <Path d="M33,163 Q37,165 42,163 L41,195 Q37,198 33,195 Z" fill={c('calves')} stroke={stroke} strokeWidth={sw} />
      <Path d="M67,163 Q63,165 58,163 L59,195 Q63,198 67,195 Z" fill={c('calves')} stroke={stroke} strokeWidth={sw} />

      {/* Feet */}
      <Ellipse cx="38" cy="200" rx="8" ry="5" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="62" cy="200" rx="8" ry="5" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
    </Svg>
  );
};

// --- Back body SVG ---
const BackBody: React.FC<{ load: Record<string, number>; primary: string; bgColor: string; borderColor: string }> = ({ load, primary, bgColor, borderColor }) => {
  const c = (m: string) => muscleColor(load[m] ?? 0, primary, isDarkSurface(bgColor) ? '#1e1e2e' : '#dde0ee');
  const stroke = borderColor;
  const sw = '0.8';
  return (
    <Svg viewBox="0 0 100 220" width="100%" height="100%">
      {/* Head */}
      <Ellipse cx="50" cy="14" rx="11" ry="13" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
      {/* Neck */}
      <Rect x="45" y="25" width="10" height="7" rx="2" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />

      {/* Traps */}
      <Path d="M40,26 Q50,22 60,26 L64,36 Q50,32 36,36 Z" fill={c('traps')} stroke={stroke} strokeWidth={sw} />

      {/* Shoulders (rear deltoid) */}
      <Ellipse cx="27" cy="38" rx="10" ry="7" fill={c('shoulders')} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="73" cy="38" rx="10" ry="7" fill={c('shoulders')} stroke={stroke} strokeWidth={sw} />

      {/* Lats */}
      <Path d="M36,34 L28,62 Q30,72 38,76 L40,52 Z" fill={c('lats')} stroke={stroke} strokeWidth={sw} />
      <Path d="M64,34 L72,62 Q70,72 62,76 L60,52 Z" fill={c('lats')} stroke={stroke} strokeWidth={sw} />

      {/* Upper/middle back */}
      <Path d="M36,34 Q50,30 64,34 L62,76 Q50,80 38,76 Z" fill={c('back')} stroke={stroke} strokeWidth={sw} />

      {/* Triceps */}
      <Ellipse cx="21" cy="57" rx="6" ry="12" fill={c('triceps')} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="79" cy="57" rx="6" ry="12" fill={c('triceps')} stroke={stroke} strokeWidth={sw} />

      {/* Forearms */}
      <Ellipse cx="18" cy="81" rx="5" ry="11" fill={c('forearms')} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="82" cy="81" rx="5" ry="11" fill={c('forearms')} stroke={stroke} strokeWidth={sw} />

      {/* Hands */}
      <Ellipse cx="16" cy="97" rx="5" ry="6" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="84" cy="97" rx="5" ry="6" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />

      {/* Lower back */}
      <Path d="M38,76 Q50,80 62,76 L62,96 Q50,100 38,96 Z" fill={c('lower_back')} stroke={stroke} strokeWidth={sw} />

      {/* Glutes */}
      <Path d="M38,96 Q50,100 62,96 L64,118 Q50,124 36,118 Z" fill={c('glutes')} stroke={stroke} strokeWidth={sw} />

      {/* Hamstrings */}
      <Path d="M36,118 Q42,120 44,122 L43,158 Q38,162 33,158 L33,122 Z" fill={c('hamstrings')} stroke={stroke} strokeWidth={sw} />
      <Path d="M64,118 Q58,120 56,122 L57,158 Q62,162 67,158 L67,122 Z" fill={c('hamstrings')} stroke={stroke} strokeWidth={sw} />

      {/* Knees */}
      <Ellipse cx="38" cy="160" rx="7" ry="5" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="62" cy="160" rx="7" ry="5" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />

      {/* Calves (back) */}
      <Path d="M33,165 Q38,172 42,165 L41,195 Q37,198 33,195 Z" fill={c('calves')} stroke={stroke} strokeWidth={sw} />
      <Path d="M67,165 Q62,172 58,165 L59,195 Q63,198 67,195 Z" fill={c('calves')} stroke={stroke} strokeWidth={sw} />

      {/* Feet */}
      <Ellipse cx="38" cy="200" rx="8" ry="5" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
      <Ellipse cx="62" cy="200" rx="8" ry="5" fill={isDarkSurface(bgColor) ? '#2a2a3a' : '#e8e8f0'} stroke={stroke} strokeWidth={sw} />
    </Svg>
  );
};

export const MuscleHeatmapCard: React.FC<Props> = ({ colors, workoutHistory }) => {
  const load = useMuscleLoad(workoutHistory);
  const [view, setView] = useState<'front' | 'back'>('front');
  const { width: screenW } = useWindowDimensions();
  const bodyW = (screenW - spacing.xl * 2 - 32 - 24) / 2; // half of card width minus gap

  const topMuscles = useMemo(() => {
    return Object.entries(load)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [load]);

  const hasAnyLoad = Object.values(load).some((v) => v > 0);

  return (
    <Card style={{ marginBottom: spacing.lg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <View>
          <Text style={[typography.h4, { color: colors.text }]}>Нагрузка мышц</Text>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>За последние 7 дней</Text>
        </View>
        {/* Front / Back toggle */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          {(['front', 'back'] as const).map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => setView(v)}
              style={{
                paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
                backgroundColor: view === v ? colors.primary + '20' : 'transparent',
              }}
            >
              <Text style={[typography.caption, { color: view === v ? colors.primary : colors.textSecondary, fontWeight: view === v ? '700' : '400' }]}>
                {v === 'front' ? 'Спереди' : 'Сзади'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {!hasAnyLoad ? (
        <Text style={[typography.small, { color: colors.textTertiary, textAlign: 'center', paddingVertical: spacing.lg }]}>
          Нет тренировок за последние 7 дней
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
          {/* Body diagram */}
          <View style={{ width: bodyW, aspectRatio: 100 / 220 }}>
            {view === 'front' ? (
              <FrontBody load={load} primary={colors.primary} bgColor={colors.background} borderColor={colors.border} />
            ) : (
              <BackBody load={load} primary={colors.primary} bgColor={colors.background} borderColor={colors.border} />
            )}
          </View>

          {/* Legend + top muscles */}
          <View style={{ flex: 1 }}>
            {/* Intensity scale */}
            <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: spacing.sm }]}>
              Интенсивность
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: spacing.lg }}>
              {[0, 0.25, 0.55, 0.8, 1].map((t, i) => {
                const hex2rgb = (h: string) => {
                  const c = h.replace('#', '');
                  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
                };
                const p = hex2rgb(colors.primary);
                const base = [160, 160, 170];
                const r = Math.round(base[0] + (p[0] - base[0]) * t);
                const g = Math.round(base[1] + (p[1] - base[1]) * t);
                const b2 = Math.round(base[2] + (p[2] - base[2]) * t);
                const toH = (n: number) => n.toString(16).padStart(2, '0');
                const col = t === 0 ? (colors.background === '#0A0A0F' ? '#1e1e2e' : '#dde0ee') : `#${toH(r)}${toH(g)}${toH(b2)}`;
                return (
                  <View key={i} style={{ flex: 1, height: 8, borderRadius: 2, backgroundColor: col }} />
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 9, color: colors.textTertiary }}>0</Text>
              <Text style={{ fontSize: 9, color: colors.textTertiary }}>12+ подх.</Text>
            </View>

            {/* Top muscles */}
            {topMuscles.length > 0 && (
              <>
                <Text style={[typography.captionMedium, { color: colors.text, marginBottom: spacing.sm }]}>
                  Топ мышцы
                </Text>
                {topMuscles.map(([muscle, sets]) => (
                  <View key={muscle} style={{ marginBottom: spacing.xs }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text style={{ fontSize: 10, color: colors.textSecondary }}>{MUSCLE_LABELS[muscle] ?? muscle}</Text>
                      <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '600' }}>{Math.round(sets)}</Text>
                    </View>
                    <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{ height: 4, width: `${Math.min(100, (sets / 15) * 100)}%`, backgroundColor: colors.primary, borderRadius: 2 }} />
                    </View>
                  </View>
                ))}
              </>
            )}
          </View>
        </View>
      )}
    </Card>
  );
};
