/**
 * Giron Color System — Premium Graphite + Gold
 *
 * Design philosophy: Premium dark product with champagne gold accent.
 * Tokens match Claude Design "Direction A" export (2026-04-22 handoff):
 *   - Warm graphite background #0E0E0F
 *   - Layered surfaces #17171A → #1E1E22 for depth
 *   - Champagne gold #D4B07A as the signature accent (was purple #8B5CF6)
 *   - Warm cream text #F4F1EA on dark; warm grey subtext
 *
 * Light mode keeps the gold accent but inverts to a warm off-white
 * background so the brand identity stays consistent across modes.
 *
 * Macro palette (calories / protein / fats / carbs) follows the same
 * warm scheme — protein = gold (replaces old purple), so the macro
 * bars and primary CTAs share the brand color.
 */

// Light mode is the DEFAULT theme, and it used to fail WCAG AA across the
// board: gold text measured 2.82:1 on the cream background where 4.5:1 is
// required, tertiary text 2.20:1, the placeholder 2.04:1 — even the label on
// the main gold button was unreadable, since cream-on-#B08A4E is also 2.82:1
// (audit R19). The contrast test hid it by asking light mode for only 2.0-2.5.
//
// Values below were derived by darkening each token along its own hue until it
// reaches 4.5:1 on #F4F1EA, so the palette keeps its warm character. The macro
// chart palette is deliberately left alone: those are large graphical fills,
// not text, and they are part of the documented brand spec.
export const lightColors = {
  primary: '#86693B',       // Deep bronze-gold — 4.54:1 on cream (was #B08A4E, 2.82:1)
  primaryDark: '#6B5430',   // Pressed state — darker still
  primaryLight: '#D4B07A',  // Champagne gold (dark-mode accent)
  secondary: '#17171A',
  accent: '#86693B',

  background: '#F4F1EA',    // Warm cream (inverse of dark text)
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',

  text: '#17171A',          // Graphite
  textSecondary: '#6B6860',
  textTertiary: '#716E69',  // 4.50:1 on cream (was #A8A49C, 2.20:1)
  textMuted: '#716E69',     // Round 184: alias for responsive-package — same as textTertiary in light mode
  textInverse: '#F4F1EA',

  border: '#E5DFD2',        // Warm tan separator
  borderLight: '#EEE8DC',
  divider: '#E5DFD2',

  success: '#50784C',       // Deep sage — 4.51:1 (was #6FA66A, 2.54:1)
  warning: '#97623B',       // Warm amber — 4.51:1 (was #C9824E, 2.74:1)
  error: '#A9564B',         // Terracotta — 4.52:1 (was #C76558, 3.43:1)
  info: '#537189',          // Muted slate — 4.55:1 (was #6B91B0, 2.95:1)

  tabBar: '#FFFFFF',
  tabBarBorder: '#E5DFD2',
  tabBarActive: '#86693B',
  tabBarInactive: '#716E69',

  inputBackground: '#EEE8DC',
  inputBorder: '#E5DFD2',
  inputText: '#17171A',
  // Slightly darker than textTertiary: the input background (#EEE8DC) is
  // darker than the page, so the same grey only reached 4.16:1 there.
  inputPlaceholder: '#6A6762',

  overlay: 'rgba(14, 14, 15, 0.4)',
  shadow: 'rgba(14, 14, 15, 0.08)',

  progressBar: '#86693B',
  progressBarBackground: '#E5DFD2',

  // Macros mirror the semantic tokens above (calories=error, protein=primary,
  // fats=warning, carbs=success), so they move with them. Darkening keeps the
  // "protein bar is the brand gold" rule intact and lifts the macro numbers —
  // small text sitting on cream — from ~2.5-3.4:1 to AA (audit R19).
  calories: '#A9564B',      // Terracotta (warm red)
  protein: '#86693B',       // Gold — primary brand
  fats: '#97623B',          // Amber
  carbs: '#50784C',         // Sage
};

export const darkColors: typeof lightColors = {
  primary: '#D4B07A',       // Champagne gold — the signature accent
  primaryDark: '#B08A4E',   // Deeper gold for pressed states
  primaryLight: '#E5C896',
  secondary: '#F4F1EA',
  accent: '#D4B07A',

  background: '#0E0E0F',    // Graphite (tokens.A.bg)
  surface: '#17171A',       // Surface (tokens.A.surface)
  surfaceElevated: '#1E1E22', // Elevated surface (tokens.A.surfaceHi)
  card: '#17171A',

  text: '#F4F1EA',          // Warm cream
  textSecondary: '#A8A49C',
  textTertiary: '#6B6860',
  textMuted: '#6B6860',     // Round 184: alias for responsive-package — same as textTertiary in dark mode
  textInverse: '#0E0E0F',

  border: 'rgba(255, 255, 255, 0.08)',       // tokens.A.line
  borderLight: 'rgba(255, 255, 255, 0.04)',
  divider: 'rgba(255, 255, 255, 0.08)',

  success: '#9AC28C',       // Soft sage (tokens.A.good)
  warning: '#E8A36A',       // Warm amber (tokens.A.warn)
  error: '#E07A6B',         // Terracotta (tokens.A.danger)
  info: '#8BA8BF',

  tabBar: 'rgba(20, 20, 24, 0.82)', // Translucent dark — uses backdrop blur
  tabBarBorder: 'rgba(255, 255, 255, 0.14)',
  tabBarActive: '#D4B07A',
  tabBarInactive: '#A8A49C',

  inputBackground: '#1E1E22',
  inputBorder: 'rgba(255, 255, 255, 0.14)',
  inputText: '#F4F1EA',
  inputPlaceholder: '#6B6860',

  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.4)',

  progressBar: '#D4B07A',
  progressBarBackground: 'rgba(255, 255, 255, 0.08)',

  calories: '#E07A6B',      // Terracotta
  protein: '#D4B07A',       // Champagne gold — primary brand
  fats: '#E8A36A',          // Warm amber
  carbs: '#9AC28C',         // Soft sage
};

export type Colors = typeof lightColors;
