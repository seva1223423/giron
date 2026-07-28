/**
 * The set row prefills from the previous session.
 *
 * This is the fastest path in the whole app: you open an exercise, the weight
 * you lifted last time is already there, and one tap logs the set. It broke
 * once in a way types could not catch — a new set is created with `weight: 0`,
 * and `set.weight ?? prevSet?.weight` keeps the zero because `??` only falls
 * through on null. The row read "—" and the checkmark logged 0 kg.
 *
 * Rendering the row is the only way to pin that, so it is pinned here.
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { SetRow } from '../screens/tracker/components/SetRow';

// The row imports the shared components barrel, which reaches the auth store
// and from there expo-notifications — none of which this test is about.
// Stubbed down to what the row actually renders through: a pressable shell,
// an icon that draws nothing, and a sheet that is closed.
jest.mock('../components', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    AnimatedPressable: ({ children, ...props }: any) =>
      React.createElement(Pressable, props, children),
    Icon: () => null,
    NumberSheet: () => null,
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const colors = {
  primary: '#D4B07A', success: '#9AC28C', warning: '#E8A36A', error: '#E07A6B',
  text: '#F4F1EA', textSecondary: '#A8A49C', textTertiary: '#6E6A63',
  textInverse: '#17171A', border: '#2A2A2F', inputBackground: '#131316',
  surface: '#17171A', surfaceElevated: '#1E1E22', overlay: 'rgba(0,0,0,0.5)',
};

/** A set as the app actually creates one: zeroed, not undefined. */
const freshSet = (over: Record<string, unknown> = {}) => ({
  id: 's1', setNumber: 1, type: 'normal', reps: 10, weight: 0, completed: false, ...over,
});

function renderRow(props: Record<string, unknown> = {}) {
  const onComplete = jest.fn();
  const utils = render(
    <SetRow
      set={freshSet()}
      setIndex={0}
      prevSet={{ weight: 60, reps: 8 }}
      isActive
      onComplete={onComplete}
      onRpeChange={jest.fn()}
      colors={colors}
      {...props}
    />,
  );
  return { ...utils, onComplete };
}

describe('SetRow prefill', () => {
  test('a set created with weight 0 shows last session\'s weight', () => {
    renderRow();
    // Not "—": the zero must fall through to the previous session.
    expect(screen.queryByText('60')).toBeTruthy();
    expect(screen.queryByText('—')).toBeNull();
  });

  test('ticking an untouched set logs the previous weight, never 0', () => {
    const { onComplete } = renderRow();
    fireEvent.press(screen.getByLabelText('Отметить сет выполненным'));
    const [reps, weight] = onComplete.mock.calls[0];
    expect(weight).toBe(60);
    // Reps stay at the set's own target. A program that says 4×8 means 8 even
    // if last session only managed 6 — the plan is the intent, the previous
    // weight is only a starting point for the load.
    expect(reps).toBe(10);
  });

  test('with no previous session the row asks for a weight instead of inventing one', () => {
    renderRow({ prevSet: null });
    expect(screen.queryByText('—')).toBeTruthy();
  });

  test('an already-logged set shows its own numbers, not the previous ones', () => {
    renderRow({ set: freshSet({ weight: 82.5, reps: 5, completed: true }) });
    expect(screen.queryByText('82.5')).toBeTruthy();
    expect(screen.queryByText('60')).toBeNull();
  });

  test('re-ticking a logged set is flagged as a correction', () => {
    const { onComplete } = renderRow({ set: freshSet({ weight: 82.5, reps: 5, completed: true }) });
    fireEvent.press(screen.getByLabelText('Сет выполнен — нажми, чтобы сохранить исправленные цифры'));
    expect(onComplete.mock.calls[0][2]).toBe(true);
  });

  test('last session arriving after mount still prefills an untouched row', () => {
    const { rerender } = renderRow({ prevSet: null });
    expect(screen.queryByText('—')).toBeTruthy();
    // History is fetched after the screen mounts.
    rerender(
      <SetRow
        set={freshSet()}
        setIndex={0}
        prevSet={{ weight: 75, reps: 6 }}
        isActive
        onComplete={jest.fn()}
        onRpeChange={jest.fn()}
        colors={colors}
      />,
    );
    expect(screen.queryByText('75')).toBeTruthy();
  });
});
