/**
 * Giron — branded achievement stickers (Direction A).
 *
 * 12 self-contained SVG stickers ported from the Claude Design handoff
 * `stickers.jsx`. Replaces the unicode-glyph emoji rendering of
 * achievements (`◎ ◉ ◈ ◧ ◫ ◇ ○ ●` etc.) which violated the brand
 * contract spelled out in CLAUDE.md:
 *   "38 SVG-иконок в Icon компоненте, без эмодзи, без unicode-глифов."
 *
 * Public API:
 *   <Sticker stickerId="pr" size={48} />          ← direct
 *   <AchievementSticker achievement={a} size={48} /> ← maps any of the
 *       48 achievement.id → the right sticker (gold/sage/terracotta tinted
 *       to the brand palette).
 *
 * Each sticker is a viewBox="0 0 100 100" SVG, so any `size` scales 1:1.
 * They use accent colours pinned to Direction A tokens (`#D4B07A` gold,
 * `#E07A6B` terracotta, `#9AC28C` sage) — NOT theme-aware, because the
 * stickers themselves are *decorations* (a gold trophy stays gold on
 * light theme; only the chrome around them shifts).
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import type { Achievement } from '../utils/achievements';

// Direction A palette pinned for stickers — same values as in stickers.jsx.
const ACCENT = '#D4B07A';
const ACCENT_DARK = '#A87F48';
const ACCENT_LIGHT = '#E8C895';
const TERRACOTTA = '#E07A6B';
const SAGE = '#9AC28C';
const SAND = '#E8A36A';
const CREAM = '#FFD27A';
const SKY = '#7AE6FF';
const DEEP_BLUE = '#3B7BB0';
const NIGHT = '#1E1830';
const MOON = '#E8E0D0';
const INK = '#0A0A0A';

export type StickerId =
  | 'pr'
  | 'streak'
  | 'barbell'
  | 'bolt'
  | 'trophy'
  | 'sweat'
  | 'beast'
  | 'hr'
  | 'hundred'
  | 'ai'
  | 'sleep'
  | 'go';

interface StickerProps {
  stickerId: StickerId;
  size?: number;
  /**
   * When the achievement isn't unlocked we render the sticker dimmed (grayscale +
   * opacity) so locked tiles read as "not yet earned" without hiding the icon.
   */
  locked?: boolean;
}

export const Sticker: React.FC<StickerProps> = ({ stickerId, size = 56, locked = false }) => {
  const Comp = STICKERS[stickerId] ?? STICKERS.barbell;
  return (
    <View style={[styles.wrap, { width: size, height: size, opacity: locked ? 0.35 : 1 }]}>
      <Svg viewBox="0 0 100 100" width={size} height={size}>
        <Comp />
      </Svg>
    </View>
  );
};

// ─── 12 sticker SVGs ────────────────────────────────────────────────────────

const StickerPR = () => (
  <G>
    <Defs>
      <LinearGradient id="prGrad" x1="0" x2="1" y1="0" y2="1">
        <Stop offset="0" stopColor={ACCENT_LIGHT} />
        <Stop offset="1" stopColor={ACCENT_DARK} />
      </LinearGradient>
    </Defs>
    <Circle cx="50" cy="50" r="44" fill="url(#prGrad)" stroke={INK} strokeWidth="2" />
    <Circle cx="50" cy="50" r="38" fill="none" stroke={INK} strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
    <SvgText x="50" y="44" fontSize="11" fontWeight="700" textAnchor="middle" fill={INK} letterSpacing={2}>NEW</SvgText>
    <SvgText x="50" y="68" fontSize="26" fontWeight="700" textAnchor="middle" fill={INK} letterSpacing={-1}>PR</SvgText>
    <Path d="M22 50 L18 46 M82 50 L78 46 M22 50 L18 54 M82 50 L78 54" stroke={INK} strokeWidth="1.5" fill="none" opacity="0.6" />
  </G>
);

const StickerStreak = () => (
  <G>
    <Defs>
      <LinearGradient id="flGrad" x1="0" x2="0" y1="1" y2="0">
        <Stop offset="0" stopColor={TERRACOTTA} />
        <Stop offset="0.6" stopColor={SAND} />
        <Stop offset="1" stopColor={CREAM} />
      </LinearGradient>
    </Defs>
    <Path
      d="M50 12 C 60 28, 78 38, 78 60 a 28 28 0 0 1 -56 0 c 0 -14 8 -22 16 -28 c -2 9 4 14 9 14 c 0 -18 0 -28 3 -34 z"
      fill="url(#flGrad)"
      stroke={INK}
      strokeWidth="2"
    />
  </G>
);

const StickerBarbell = () => (
  <G>
    <Rect x="6" y="44" width="88" height="12" rx="3" fill={ACCENT} stroke={INK} strokeWidth="2" />
    <Rect x="14" y="34" width="10" height="32" rx="2" fill={INK} />
    <Rect x="76" y="34" width="10" height="32" rx="2" fill={INK} />
    <Rect x="26" y="38" width="6" height="24" rx="1" fill={TERRACOTTA} stroke={INK} strokeWidth="1" />
    <Rect x="68" y="38" width="6" height="24" rx="1" fill={TERRACOTTA} stroke={INK} strokeWidth="1" />
    <SvgText x="50" y="86" fontSize="9" fontWeight="700" textAnchor="middle" fill={ACCENT} letterSpacing={2}>IRON</SvgText>
  </G>
);

const StickerBolt = () => (
  <G>
    <Circle cx="50" cy="50" r="42" fill="#0E0E0F" stroke={ACCENT} strokeWidth="2.5" />
    <Path
      d="M55 18 L30 54 L48 54 L42 82 L70 44 L52 44 Z"
      fill={ACCENT}
      stroke={INK}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </G>
);

const StickerTrophy = () => (
  <G>
    <Circle cx="50" cy="50" r="44" fill={ACCENT} stroke={INK} strokeWidth="2" />
    <Path d="M34 22 L66 22 L66 38 a 16 16 0 0 1 -32 0 Z" fill={INK} />
    <Path d="M34 28 L26 28 L26 34 a 8 8 0 0 0 8 8" fill="none" stroke={INK} strokeWidth="2" />
    <Path d="M66 28 L74 28 L74 34 a 8 8 0 0 1 -8 8" fill="none" stroke={INK} strokeWidth="2" />
    <Rect x="44" y="56" width="12" height="8" fill={INK} />
    <Rect x="36" y="64" width="28" height="6" rx="1" fill={INK} />
  </G>
);

const StickerSweat = () => (
  <G>
    <Defs>
      <LinearGradient id="dropG" x1="0" x2="0" y1="0" y2="1">
        <Stop offset="0" stopColor={SKY} />
        <Stop offset="1" stopColor={DEEP_BLUE} />
      </LinearGradient>
    </Defs>
    <Path
      d="M50 14 C 65 32, 78 46, 78 60 a 28 28 0 0 1 -56 0 C 22 46, 35 32, 50 14 z"
      fill="url(#dropG)"
      stroke={INK}
      strokeWidth="2"
    />
    <Ellipse cx="42" cy="46" rx="6" ry="10" fill="#FFFFFF" opacity="0.45" />
  </G>
);

const StickerBeast = () => (
  <G>
    <Circle cx="50" cy="50" r="42" fill="#1E1810" stroke={ACCENT} strokeWidth="2.5" />
    <Path
      d="M22 58 Q 22 44 36 44 L42 44 Q 50 30 60 38 Q 76 36 78 56 Q 70 58 60 56 Q 56 64 50 60 L40 60 Q 28 60 22 58 Z"
      fill={ACCENT}
    />
    <Circle cx="64" cy="48" r="4" fill={INK} />
  </G>
);

const StickerHR = () => (
  <G>
    <Path
      d="M50 84 C 12 60, 12 28, 32 22 C 42 18, 50 26, 50 32 C 50 26, 58 18, 68 22 C 88 28, 88 60, 50 84 Z"
      fill={TERRACOTTA}
      stroke={INK}
      strokeWidth="2"
    />
    <Path
      d="M22 52 L34 52 L40 40 L48 64 L56 46 L62 52 L78 52"
      stroke={INK}
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </G>
);

const Sticker100 = () => (
  <G>
    <Circle cx="50" cy="50" r="44" fill={SAGE} stroke={INK} strokeWidth="2" />
    <SvgText x="50" y="60" fontSize="22" fontWeight="800" textAnchor="middle" fill={INK} letterSpacing={-1}>100%</SvgText>
    <Path d="M50 18 L52 22 L56 20 L55 24 L58 26 L54 28 L54 32 L50 30 L46 32 L46 28 L42 26 L45 24 L44 20 L48 22 Z" fill={INK} />
  </G>
);

const StickerAI = () => (
  <G>
    <Rect x="8" y="8" width="84" height="84" rx="16" fill="#0E0E0F" stroke={ACCENT} strokeWidth="2.5" />
    <Path d="M50 22 L54 42 L74 46 L54 50 L50 70 L46 50 L26 46 L46 42 Z" fill={ACCENT} />
    <Circle cx="32" cy="28" r="3" fill={ACCENT} />
    <Circle cx="72" cy="76" r="3" fill={ACCENT} />
  </G>
);

const StickerSleep = () => (
  <G>
    <Circle cx="50" cy="50" r="42" fill={NIGHT} stroke={INK} strokeWidth="2" />
    <Path d="M62 28 a 24 24 0 1 0 12 36 a 18 18 0 0 1 -12 -36 z" fill={MOON} />
    <Circle cx="34" cy="32" r="1.5" fill="#FFFFFF" />
    <Circle cx="28" cy="44" r="1" fill="#FFFFFF" />
    <Circle cx="38" cy="58" r="1.5" fill="#FFFFFF" />
  </G>
);

const StickerGo = () => (
  <G>
    <Circle cx="50" cy="50" r="44" fill={TERRACOTTA} stroke={INK} strokeWidth="2" />
    <SvgText x="50" y="62" fontSize="32" fontWeight="800" textAnchor="middle" fill={INK} letterSpacing={-1}>GO</SvgText>
    <Path d="M50 14 L54 8 L46 8 Z" fill={INK} />
    <Path d="M50 86 L54 92 L46 92 Z" fill={INK} />
  </G>
);

const STICKERS: Record<StickerId, React.FC> = {
  pr: StickerPR,
  streak: StickerStreak,
  barbell: StickerBarbell,
  bolt: StickerBolt,
  trophy: StickerTrophy,
  sweat: StickerSweat,
  beast: StickerBeast,
  hr: StickerHR,
  hundred: Sticker100,
  ai: StickerAI,
  sleep: StickerSleep,
  go: StickerGo,
};

// ─── Achievement → Sticker resolver ─────────────────────────────────────────

/**
 * Map any of the 48 achievements (defined in `utils/achievements.ts`) to one
 * of the 12 stickers above. Rules — picked so the visual reads strongly:
 *
 *  - `streak_*` → flame (Streak)
 *  - `first_workout` → GO (the start moment)
 *  - `workouts_*`, `workouts_month` → barbell (raw gym presence)
 *  - `bench_*`, `squat_*`, `deadlift_*` → PR jeton (single-rep records)
 *  - `big3_*` → trophy (combined-strength champion)
 *  - `volume_*` → beast (lifetime tonnage)
 *  - `single_workout_*` → bolt (one session burst)
 *  - `reps_*`, `sets_*` → sweat (intensity)
 *  - `nutrition_*` → 100% (consistency / completeness)
 *  - `exercises_*` → AI (exploration / learning)
 *  - `morning_*`, `evening_*` → HR (cardio-zone time-of-day theme)
 *  - `weekend_warrior` → GO (extra-mile burst)
 *  - `workout_2h`, `workout_3h` → sleep (long-effort recovery theme)
 *
 * The function is deterministic — no `unlocked` state input — because the
 * sticker IDENTITY shouldn't change when an achievement unlocks. Locking is
 * handled at the render layer via the `locked` prop.
 */
export function getStickerForAchievement(
  achievement: Pick<Achievement, 'id' | 'category'>,
): StickerId {
  const id = achievement.id;

  if (id === 'first_workout') return 'go';
  if (id === 'weekend_warrior') return 'go';
  if (id.startsWith('streak_')) return 'streak';
  if (id.startsWith('workouts_')) return 'barbell';
  if (id.startsWith('big3_')) return 'trophy';
  if (id.startsWith('volume_')) return 'beast';
  if (id.startsWith('single_workout_')) return 'bolt';
  if (id.startsWith('reps_') || id.startsWith('sets_')) return 'sweat';
  if (id.startsWith('bench_') || id.startsWith('squat_') || id.startsWith('deadlift_')) return 'pr';
  if (id.startsWith('nutrition_')) return 'hundred';
  if (id.startsWith('exercises_')) return 'ai';
  if (id.startsWith('morning_') || id.startsWith('evening_')) return 'hr';
  if (id === 'workout_2h' || id === 'workout_3h') return 'sleep';

  // Sensible fallback by category — covers any future achievement that
  // doesn't match an above pattern (rather than blowing up the render).
  switch (achievement.category) {
    case 'streak':
      return 'streak';
    case 'strength':
      return 'pr';
    case 'nutrition':
      return 'hundred';
    case 'exploration':
      return 'ai';
    case 'workout':
    default:
      return 'barbell';
  }
}

interface AchievementStickerProps {
  achievement: Pick<Achievement, 'id' | 'category' | 'unlocked'>;
  size?: number;
}

/**
 * Convenience wrapper for the AchievementsTab + summary cards: pass the
 * Achievement object directly, get back the right sticker dimmed if locked.
 */
export const AchievementSticker: React.FC<AchievementStickerProps> = ({ achievement, size = 56 }) => (
  <Sticker
    stickerId={getStickerForAchievement(achievement)}
    size={size}
    locked={!achievement.unlocked}
  />
);

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
