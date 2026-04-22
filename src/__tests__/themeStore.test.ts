/**
 * Tests for useThemeStore — theme mode, colors, toggling
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { useThemeStore } from '../store/useThemeStore';
import { lightColors, darkColors } from '../theme/colors';

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({
      mode: 'light',
      isDark: false,
      colors: lightColors,
    });
  });

  test('starts in light mode', () => {
    const state = useThemeStore.getState();
    expect(state.mode).toBe('light');
    expect(state.isDark).toBe(false);
    // Premium Graphite + Gold palette — warm cream background in light mode
    // (inverse of the dark-mode text color, keeps the brand warmth consistent).
    expect(state.colors.background).toBe('#F4F1EA');
  });

  test('setMode dark changes colors to dark palette', () => {
    useThemeStore.getState().setMode('dark');
    const state = useThemeStore.getState();
    expect(state.mode).toBe('dark');
    expect(state.isDark).toBe(true);
    expect(state.colors).toEqual(darkColors);
  });

  test('setMode light changes colors to light palette', () => {
    useThemeStore.getState().setMode('dark');
    useThemeStore.getState().setMode('light');
    const state = useThemeStore.getState();
    expect(state.mode).toBe('light');
    expect(state.isDark).toBe(false);
    expect(state.colors).toEqual(lightColors);
  });

  test('setMode auto uses time-based theme', () => {
    useThemeStore.getState().setMode('auto');
    const state = useThemeStore.getState();
    expect(state.mode).toBe('auto');
    // isDark depends on current time — just verify it is a boolean and colors are consistent
    expect(typeof state.isDark).toBe('boolean');
    if (state.isDark) {
      expect(state.colors).toEqual(darkColors);
    } else {
      expect(state.colors).toEqual(lightColors);
    }
  });

  test('toggleTheme cycles light → dark', () => {
    useThemeStore.getState().setMode('light');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().mode).toBe('dark');
  });

  test('toggleTheme cycles dark → light', () => {
    useThemeStore.getState().setMode('dark');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().mode).toBe('light');
  });

  test('toggleTheme from auto → light', () => {
    useThemeStore.getState().setMode('auto');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().mode).toBe('light');
  });

  test('applyAutoTheme does nothing when mode is not auto', () => {
    useThemeStore.getState().setMode('light');
    const before = useThemeStore.getState().isDark;
    useThemeStore.getState().applyAutoTheme();
    expect(useThemeStore.getState().isDark).toBe(before);
  });
});
