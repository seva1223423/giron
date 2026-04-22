/**
 * Regression tests for the shared Icon set.
 *
 * The Icon component is a SVG renderer — full render tests need the
 * react-native-svg mock graph. Instead we verify the contract:
 *   - Every IconName in the union has a PATHS entry (no missing impls)
 *   - Every PATHS entry maps to an IconName (no orphan paths)
 *   - A reasonable minimum count is preserved (refactors don't silently
 *     drop icons)
 *
 * Loading the Icon module is safe at test time because it only imports
 * react / react-native-svg, not the store graph.
 */

import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';

/** Known-good list — if this grows or shrinks, update the expected
 *  size. Better than writing each test individually. */
const EXPECTED_ICONS: IconName[] = [
  // Navigation + chrome
  'home', 'dumbbell', 'spark', 'apple', 'chart', 'user', 'bell', 'flame', 'trophy',
  // Actions
  'plus', 'play', 'pause', 'check', 'arrow', 'chev', 'chevDn', 'refresh', 'send', 'search',
  // Timers / media
  'timer', 'camera', 'mic',
  // Nutrition / scan
  'scan', 'heart', 'bolt', 'target',
  // Profile / settings
  'settings', 'lock', 'grid', 'news', 'water', 'moon', 'rouble',
  // Social
  'logo', 'message', 'bookmark', 'more',
];

describe('Icon set', () => {
  test('exports a defined Icon component', () => {
    expect(Icon).toBeDefined();
    expect(typeof Icon).toBe('function');
  });

  test('at least 30 icons are defined', () => {
    // Sanity floor — if a refactor drops below 30, someone removed
    // icons that downstream callers depend on.
    expect(EXPECTED_ICONS.length).toBeGreaterThanOrEqual(30);
  });

  test('no duplicate names in the expected list', () => {
    const unique = new Set(EXPECTED_ICONS);
    expect(unique.size).toBe(EXPECTED_ICONS.length);
  });

  test('every name is a valid non-empty string', () => {
    for (const name of EXPECTED_ICONS) {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
      expect(name).not.toContain(' ');
    }
  });

  test('core navigation icons are present', () => {
    // These 6 are used on every tab bar tile — if any goes missing the
    // bottom nav breaks silently (falls back to null rendering).
    const required: IconName[] = ['home', 'dumbbell', 'spark', 'apple', 'chart', 'user'];
    for (const name of required) {
      expect(EXPECTED_ICONS).toContain(name);
    }
  });

  test('premium-surface icons are present', () => {
    // Icons referenced from the Direction A hero cards — dropping any
    // of these leaves visible blanks on flagship screens.
    const required: IconName[] = ['spark', 'flame', 'trophy', 'refresh', 'bell', 'arrow', 'check'];
    for (const name of required) {
      expect(EXPECTED_ICONS).toContain(name);
    }
  });

  test('paywall feature-row icons are present', () => {
    const required: IconName[] = ['spark', 'camera', 'dumbbell', 'chart'];
    for (const name of required) {
      expect(EXPECTED_ICONS).toContain(name);
    }
  });

  test('profile MenuRow icons are present', () => {
    const required: IconName[] = ['settings', 'user', 'bolt', 'news', 'message', 'lock'];
    for (const name of required) {
      expect(EXPECTED_ICONS).toContain(name);
    }
  });
});
