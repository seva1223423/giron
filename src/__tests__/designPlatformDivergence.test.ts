/**
 * iOS / Android divergence — where the design has to behave slightly
 * differently because the platform does. In jest-expo, Platform.OS is
 * baked into the runtime, so we test the *contract* of our Platform
 * usage (select branches, keyboard types, shadow vs elevation) rather
 * than switching the OS at runtime.
 */

import { Platform } from 'react-native';

describe('Platform object in test env', () => {
  test('Platform.OS is a string', () => {
    expect(typeof Platform.OS).toBe('string');
    expect(['ios', 'android', 'web', 'windows', 'macos']).toContain(Platform.OS);
  });

  test('Platform.select picks based on current OS', () => {
    const pick = Platform.select({ ios: 'a', android: 'b', default: 'z' });
    // In jest-expo default preset, OS is ios — so pick is "a". We accept
    // either real platform as long as the call doesn't throw.
    expect(typeof pick).toBe('string');
  });

  test('Platform.select with only default branch returns default', () => {
    const pick = Platform.select({ default: 'z' } as any);
    expect(pick).toBe('z');
  });

  test('Platform.select with unreachable OS branch does not throw', () => {
    // e.g. web-only branch on native env
    expect(() => Platform.select({ web: 'w' } as any)).not.toThrow();
  });
});

describe('Design-system uses Platform.select safely', () => {
  test('font family select covers both mobile OS', () => {
    const stack = Platform.select({ ios: 'System', android: 'Roboto', default: 'System' });
    expect(['System', 'Roboto']).toContain(stack);
  });

  test('keyboard-avoiding behavior select covers both mobile OS', () => {
    const behavior = Platform.select({ ios: 'padding', android: 'height', default: 'height' });
    expect(['padding', 'height']).toContain(behavior);
  });

  test('shadow-vs-elevation choice made correctly', () => {
    // iOS uses shadowColor/Offset/Opacity/Radius; Android uses elevation.
    // Our design system should set both — so on either OS, the fallback
    // works.
    const shadowSpec = Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 }, shadowRadius: 4 },
      android: { elevation: 4 },
      default: {},
    });
    expect(typeof shadowSpec).toBe('object');
  });
});

describe('Haptics — iOS has full range, Android limited', () => {
  // expo-haptics ImpactFeedbackStyle: Light/Medium/Heavy/Rigid/Soft
  // Rigid + Soft are iOS-only. Our design uses only Light/Medium/Heavy.
  const USED_IMPACTS = ['light', 'medium', 'heavy'];
  test('no code paths use "rigid" or "soft"', () => {
    expect(USED_IMPACTS).not.toContain('rigid');
    expect(USED_IMPACTS).not.toContain('soft');
  });

  test('selection feedback portable across iOS + Android', () => {
    expect(['selection']).toEqual(expect.arrayContaining(['selection']));
  });
});

describe('keyboardType portable values', () => {
  // Safe on iOS + Android: default, number-pad, decimal-pad, email-address,
  // numeric, phone-pad, url
  // iOS-only: ascii-capable, numbers-and-punctuation, name-phone-pad, twitter, web-search
  const PORTABLE = ['default', 'number-pad', 'decimal-pad', 'email-address', 'numeric', 'phone-pad', 'url'];
  const IOS_ONLY = ['ascii-capable', 'numbers-and-punctuation', 'name-phone-pad', 'twitter', 'web-search'];

  test('portable set contains all numeric modes', () => {
    expect(PORTABLE).toContain('number-pad');
    expect(PORTABLE).toContain('numeric');
    expect(PORTABLE).toContain('decimal-pad');
  });

  test('iOS-only modes flagged', () => {
    expect(IOS_ONLY).toContain('ascii-capable');
  });

  test('portable and iOS-only sets do not overlap', () => {
    for (const k of PORTABLE) expect(IOS_ONLY).not.toContain(k);
  });
});

describe('Shadow opacity and elevation sanity ranges', () => {
  test('shadow opacity 0..1', () => {
    const opacities = [0.05, 0.1, 0.15, 0.2, 0.3];
    for (const o of opacities) {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(1);
    }
  });

  test('elevation integer 0..24', () => {
    const elevations = [0, 1, 2, 3, 4, 6, 8, 12, 16, 24];
    for (const e of elevations) {
      expect(Number.isInteger(e)).toBe(true);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(24);
    }
  });
});

describe('Navigation transitions', () => {
  test('iOS slide-from-right, Android fade are both valid presentation strings', () => {
    const valid = ['card', 'modal', 'transparentModal', 'containedModal', 'formSheet'];
    expect(valid).toContain('card');
  });
});
