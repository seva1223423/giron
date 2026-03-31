export const lightColors = {
  primary: '#FF6B35',
  primaryDark: '#E55A2B',
  primaryLight: '#FF8A5C',
  secondary: '#1A1A2E',
  accent: '#FFD700',

  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',

  text: '#1A1A2E',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  textInverse: '#FFFFFF',

  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  divider: '#F0F0F0',

  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  tabBar: '#FFFFFF',
  tabBarBorder: '#E5E7EB',
  tabBarActive: '#FF6B35',
  tabBarInactive: '#9CA3AF',

  inputBackground: '#F3F4F6',
  inputBorder: '#E5E7EB',
  inputText: '#1A1A2E',
  inputPlaceholder: '#9CA3AF',

  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: 'rgba(0, 0, 0, 0.08)',

  progressBar: '#FF6B35',
  progressBarBackground: '#E5E7EB',

  calories: '#EF4444',
  protein: '#3B82F6',
  fats: '#F59E0B',
  carbs: '#10B981',
};

export const darkColors: typeof lightColors = {
  primary: '#FF6B35',
  primaryDark: '#FF8A5C',
  primaryLight: '#E55A2B',
  secondary: '#F8F9FA',
  accent: '#FFD700',

  background: '#0F0F1A',
  surface: '#1A1A2E',
  surfaceElevated: '#232340',
  card: '#1A1A2E',

  text: '#F8F9FA',
  textSecondary: '#9CA3AF',
  textTertiary: '#6B7280',
  textInverse: '#1A1A2E',

  border: '#2D2D44',
  borderLight: '#232340',
  divider: '#2D2D44',

  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  tabBar: '#1A1A2E',
  tabBarBorder: '#2D2D44',
  tabBarActive: '#FF6B35',
  tabBarInactive: '#6B7280',

  inputBackground: '#232340',
  inputBorder: '#2D2D44',
  inputText: '#F8F9FA',
  inputPlaceholder: '#6B7280',

  overlay: 'rgba(0, 0, 0, 0.7)',
  shadow: 'rgba(0, 0, 0, 0.3)',

  progressBar: '#FF6B35',
  progressBarBackground: '#2D2D44',

  calories: '#EF4444',
  protein: '#3B82F6',
  fats: '#F59E0B',
  carbs: '#10B981',
};

export type Colors = typeof lightColors;
