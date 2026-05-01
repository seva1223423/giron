/**
 * Iron Gym Color System — Premium Graphite + Gold
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

export const lightColors = {
  primary: '#B08A4E',       // Gold — deeper for light-mode contrast
  primaryDark: '#8E6B3E',   // Antique bronze
  primaryLight: '#D4B07A',  // Champagne gold (dark-mode accent)
  secondary: '#17171A',
  accent: '#B08A4E',

  background: '#F4F1EA',    // Warm cream (inverse of dark text)
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',

  text: '#17171A',          // Graphite
  textSecondary: '#6B6860',
  textTertiary: '#A8A49C',
  textMuted: '#A8A49C',     // Round 184: alias for responsive-package — same as textTertiary in light mode
  textInverse: '#F4F1EA',

  border: '#E5DFD2',        // Warm tan separator
  borderLight: '#EEE8DC',
  divider: '#E5DFD2',

  success: '#6FA66A',       // Muted sage (matches graphite mood, not Apple neon)
  warning: '#C9824E',       // Amber — warm
  error: '#C76558',         // Terracotta
  info: '#6B91B0',          // Muted slate

  tabBar: '#FFFFFF',
  tabBarBorder: '#E5DFD2',
  tabBarActive: '#B08A4E',
  tabBarInactive: '#A8A49C',

  inputBackground: '#EEE8DC',
  inputBorder: '#E5DFD2',
  inputText: '#17171A',
  inputPlaceholder: '#A8A49C',

  overlay: 'rgba(14, 14, 15, 0.4)',
  shadow: 'rgba(14, 14, 15, 0.08)',

  progressBar: '#B08A4E',
  progressBarBackground: '#E5DFD2',

  calories: '#C76558',      // Terracotta (warm red)
  protein: '#B08A4E',       // Gold — primary brand
  fats: '#C9824E',          // Amber
  carbs: '#6FA66A',         // Sage
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
