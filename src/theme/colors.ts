/**
 * Iron Gym Color System
 *
 * Design philosophy: Dark minimalism with purple accent
 * Inspired by Apple design language — clean, unified, elegant
 */

export const lightColors = {
  primary: '#8B5CF6',       // Purple — main accent
  primaryDark: '#7C3AED',
  primaryLight: '#A78BFA',
  secondary: '#1A1A2E',
  accent: '#8B5CF6',        // Same as primary for unity

  background: '#F5F5F7',    // Apple-style light gray
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',

  text: '#1C1C1E',          // Apple dark text
  textSecondary: '#636366',  // Apple secondary
  textTertiary: '#AEAEB2',   // Apple tertiary
  textInverse: '#FFFFFF',

  border: '#E5E5EA',        // Apple separator
  borderLight: '#F2F2F7',
  divider: '#E5E5EA',

  success: '#34C759',       // Apple green
  warning: '#FF9F0A',       // Apple orange
  error: '#FF3B30',         // Apple red
  info: '#5AC8FA',          // Apple blue

  tabBar: '#FFFFFF',
  tabBarBorder: '#E5E5EA',
  tabBarActive: '#8B5CF6',
  tabBarInactive: '#AEAEB2',

  inputBackground: '#F2F2F7',
  inputBorder: '#E5E5EA',
  inputText: '#1C1C1E',
  inputPlaceholder: '#AEAEB2',

  overlay: 'rgba(0, 0, 0, 0.4)',
  shadow: 'rgba(0, 0, 0, 0.06)',

  progressBar: '#8B5CF6',
  progressBarBackground: '#E5E5EA',

  calories: '#FF3B30',      // Red
  protein: '#8B5CF6',       // Purple (unified)
  fats: '#FF9F0A',          // Orange
  carbs: '#34C759',         // Green
};

export const darkColors: typeof lightColors = {
  primary: '#A78BFA',       // Lighter purple for dark mode
  primaryDark: '#8B5CF6',
  primaryLight: '#C4B5FD',
  secondary: '#F5F5F7',
  accent: '#A78BFA',

  background: '#0A0A0F',    // Very dark
  surface: '#141420',       // Dark card
  surfaceElevated: '#1C1C2E',
  card: '#141420',

  text: '#F5F5F7',
  textSecondary: '#98989D',
  textTertiary: '#636366',
  textInverse: '#0A0A0F',

  border: '#2C2C3A',
  borderLight: '#1C1C2E',
  divider: '#2C2C3A',

  success: '#30D158',       // Apple green (dark)
  warning: '#FFD60A',
  error: '#FF453A',
  info: '#64D2FF',

  tabBar: '#141420',
  tabBarBorder: '#2C2C3A',
  tabBarActive: '#A78BFA',
  tabBarInactive: '#636366',

  inputBackground: '#1C1C2E',
  inputBorder: '#2C2C3A',
  inputText: '#F5F5F7',
  inputPlaceholder: '#636366',

  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.4)',

  progressBar: '#A78BFA',
  progressBarBackground: '#2C2C3A',

  calories: '#FF453A',
  protein: '#A78BFA',       // Purple (unified)
  fats: '#FFD60A',
  carbs: '#30D158',
};

export type Colors = typeof lightColors;
