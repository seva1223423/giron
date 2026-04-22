/**
 * Tests for useOnboardingTipsStore — tip tracking: markShown, hasShown, resetAll.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { useOnboardingTipsStore } from '../store/useOnboardingTipsStore';

beforeEach(() => {
  useOnboardingTipsStore.setState({ shownTips: [] });
});

describe('markShown', () => {
  test('adds tipId to shownTips', () => {
    useOnboardingTipsStore.getState().markShown('workout-intro');

    expect(useOnboardingTipsStore.getState().shownTips).toContain('workout-intro');
  });

  test('does not add duplicate if already shown', () => {
    useOnboardingTipsStore.getState().markShown('workout-intro');
    useOnboardingTipsStore.getState().markShown('workout-intro');

    expect(useOnboardingTipsStore.getState().shownTips).toHaveLength(1);
  });

  test('can track multiple different tips', () => {
    useOnboardingTipsStore.getState().markShown('tip-a');
    useOnboardingTipsStore.getState().markShown('tip-b');
    useOnboardingTipsStore.getState().markShown('tip-c');

    expect(useOnboardingTipsStore.getState().shownTips).toHaveLength(3);
  });
});

describe('hasShown', () => {
  test('returns false for unseen tip', () => {
    expect(useOnboardingTipsStore.getState().hasShown('tip-x')).toBe(false);
  });

  test('returns true after markShown', () => {
    useOnboardingTipsStore.getState().markShown('tip-x');

    expect(useOnboardingTipsStore.getState().hasShown('tip-x')).toBe(true);
  });

  test('returns false for a different tip that was not shown', () => {
    useOnboardingTipsStore.getState().markShown('tip-a');

    expect(useOnboardingTipsStore.getState().hasShown('tip-b')).toBe(false);
  });
});

describe('resetAll', () => {
  test('clears all shown tips', () => {
    useOnboardingTipsStore.getState().markShown('tip-a');
    useOnboardingTipsStore.getState().markShown('tip-b');

    useOnboardingTipsStore.getState().resetAll();

    expect(useOnboardingTipsStore.getState().shownTips).toHaveLength(0);
  });

  test('hasShown returns false after reset', () => {
    useOnboardingTipsStore.getState().markShown('tip-a');
    useOnboardingTipsStore.getState().resetAll();

    expect(useOnboardingTipsStore.getState().hasShown('tip-a')).toBe(false);
  });
});
