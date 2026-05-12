/**
 * CurrentWorkoutPanel — minimal render contract pin.
 *
 * Tests only the no-workout-null path. The active-workout render branch
 * is exercised by hand on a real device — fighting Jest's hoisting +
 * Zustand selector semantics for what is fundamentally a visual
 * component costs more than it returns.
 *
 * If someone refactors the component to drop the `if (!activeWorkout)
 * return null` guard, this test catches it — Phase A wires the panel
 * UNDER the chat header on every AI screen render, including the case
 * where no workout is running. A regression that drops the guard would
 * crash the chat header with an undefined deref.
 */

jest.mock('../store', () => ({
  useWorkoutStore: (selector: (s: unknown) => unknown) =>
    selector({ activeWorkout: null }),
}));

jest.mock('../store/useThemeStore', () => ({
  useThemeStore: () => ({
    colors: {
      surface: '#17171A',
      border: '#1E1E22',
      primary: '#D4B07A',
      text: '#F4F1EA',
      textSecondary: '#A8A49C',
      textTertiary: '#6B6860',
    },
  }),
}));

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  StyleSheet: { create: (s: object) => s },
}));

import React from 'react';
import TestRenderer from 'react-test-renderer';
import { CurrentWorkoutPanel } from '../screens/ai/components/CurrentWorkoutPanel';

describe('CurrentWorkoutPanel', () => {
  it('returns null when there is no active workout (chat stays clean)', () => {
    const tree = TestRenderer.create(<CurrentWorkoutPanel />);
    expect(tree.toJSON()).toBeNull();
  });
});
