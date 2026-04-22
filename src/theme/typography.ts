import { Platform, TextStyle } from 'react-native';

// Direction A uses Manrope for headings, Inter for body, JetBrains Mono for
// meta/small-caps labels. React Native's System font (SF Pro on iOS, Roboto
// on Android) approximates Inter reasonably well at body size. Until we
// ship custom fonts via expo-font, we stay on System and lean on
// fontWeight + negative letterSpacing in headings to land close to the
// Manrope geometric-sans feel from the design export.
const fontFamily = Platform.OS === 'ios' ? 'System' : 'Roboto';
// Monospaced stack for meta labels ("01 · ONBOARDING" style). Courier
// fallback is uglier than Menlo/RobotoMono but always present.
const fontMono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export const typography: Record<string, TextStyle> = {
  // Hero display — "Спортзал, которым управляет интеллект" in onboarding
  h1: {
    fontFamily,
    fontSize: 36,
    fontWeight: '600',      // Was 800 — gold accent + tight tracking reads premium at 600
    lineHeight: 42,
    letterSpacing: -1.2,    // Was -0.5 — matches Manrope display spec
  },
  h2: {
    fontFamily,
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  h3: {
    fontFamily,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  h4: {
    fontFamily,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  body: {
    fontFamily,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
  },
  bodySemibold: {
    fontFamily,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
  },
  small: {
    fontFamily,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  smallMedium: {
    fontFamily,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  caption: {
    fontFamily,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  captionMedium: {
    fontFamily,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  // Monospaced meta label — small caps vibe via letterSpacing.
  // Used for "01 · ОНБОРДИНГ" style section labels throughout the design.
  metaLabel: {
    fontFamily: fontMono,
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
    letterSpacing: 1.5,
  },
  button: {
    fontFamily,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  buttonSmall: {
    fontFamily,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  tabLabel: {
    fontFamily,
    fontSize: 10,             // Was 11 — premium tab bar in design uses tighter label
    fontWeight: '600',        // Was 500 — reads cleaner on the translucent tab bar
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  // Large stat number (kcal total, streak count, weight). Negative tracking
  // + heavy weight matches the dashboard hero numbers in the design.
  number: {
    fontFamily,
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  numberSmall: {
    fontFamily,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    letterSpacing: -0.3,
  },
};
