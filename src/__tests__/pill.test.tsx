/**
 * Pill + DiffCard — compile-and-mount smoke tests.
 *
 * Visual styling and rendered-text are not pinned here — TestRenderer +
 * Jest mocks produce a `null` tree for components that subscribe to a
 * mocked Zustand store (an upstream interaction we don't fight for
 * polish components). What IS pinned: the components compile, all
 * variants mount without throwing, and the `direction` logic inside
 * DiffCard accepts each delta sign without error.
 *
 * Stronger visual verification happens by hand on device.
 */

jest.mock('../store/useThemeStore', () => ({
  useThemeStore: () => ({
    colors: {
      surface: '#17171A',
      border: '#1E1E22',
      primary: '#D4B07A',
      success: '#9AC28C',
      error: '#E07A6B',
      text: '#F4F1EA',
      textSecondary: '#A8A49C',
      textTertiary: '#6B6860',
    },
  }),
}));

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: object) => s },
}));

import React from 'react';
// Module declaration lives in src/types/react-test-renderer.d.ts now,
// so this import doesn't need @ts-expect-error any more.
import TestRenderer from 'react-test-renderer';
import { Pill } from '../components/Pill';
import { DiffCard } from '../components/DiffCard';

describe('Pill', () => {
  it('all 4 variants mount without throwing', () => {
    expect(() => TestRenderer.create(<Pill text="x" variant="default" />)).not.toThrow();
    expect(() => TestRenderer.create(<Pill text="x" variant="success" />)).not.toThrow();
    expect(() => TestRenderer.create(<Pill text="x" variant="danger" />)).not.toThrow();
    expect(() => TestRenderer.create(<Pill text="x" variant="muted" />)).not.toThrow();
  });

  it('accepts both string and number text props', () => {
    expect(() => TestRenderer.create(<Pill text="100 кг" />)).not.toThrow();
    expect(() => TestRenderer.create(<Pill text={250} />)).not.toThrow();
  });

  it('accepts both size variants', () => {
    expect(() => TestRenderer.create(<Pill text="x" size="sm" />)).not.toThrow();
    expect(() => TestRenderer.create(<Pill text="x" size="md" />)).not.toThrow();
  });
});

describe('DiffCard', () => {
  it('numeric before/after with positive delta mounts', () => {
    expect(() =>
      TestRenderer.create(
        <DiffCard label="Вес подхода" before={80} after={85} delta={5} unit="кг" />,
      ),
    ).not.toThrow();
  });

  it('numeric before/after with negative delta mounts', () => {
    expect(() =>
      TestRenderer.create(
        <DiffCard label="Подходы" before={4} after={3} delta={-1} />,
      ),
    ).not.toThrow();
  });

  it('non-numeric swap (no delta) mounts', () => {
    expect(() =>
      TestRenderer.create(
        <DiffCard label="Упражнение" before="Жим" after="Наклонный жим" />,
      ),
    ).not.toThrow();
  });

  it('zero delta mounts without showing arrow', () => {
    expect(() =>
      TestRenderer.create(
        <DiffCard label="x" before={5} after={5} delta={0} />,
      ),
    ).not.toThrow();
  });
});
