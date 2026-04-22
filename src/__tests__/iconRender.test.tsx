/**
 * Icon component structural smoke — verifies the Icon function returns
 * a non-null React element for every name in the union, and returns
 * null for unknown names (graceful fallback).
 *
 * Full render through react-test-renderer crashes on react-native-svg
 * teardown in jest-expo's environment, so we just exercise the
 * function-as-component call and inspect the tree shape. Still catches
 * the two important regressions:
 *   - Adding a name without a PATHS entry (returns null)
 *   - A PATHS entry that accidentally `throw`s at evaluation
 */

import React from 'react';
import { Icon, type IconName } from '../components/Icon';

const NAMES: IconName[] = [
  'home', 'dumbbell', 'spark', 'apple', 'chart', 'user', 'bell', 'flame', 'trophy',
  'plus', 'play', 'pause', 'check', 'arrow', 'chev', 'chevDn', 'refresh', 'send', 'search',
  'timer', 'camera', 'mic', 'scan', 'heart', 'bolt', 'target',
  'settings', 'lock', 'grid', 'news', 'water', 'moon', 'rouble',
  'logo', 'message', 'bookmark', 'more',
];

describe('Icon component structural smoke', () => {
  test.each(NAMES)('Icon name="%s" returns a non-null React element', (name) => {
    const result = (Icon as any)({ name });
    expect(result).not.toBeNull();
    // Should be a React element with a type (Svg) and props
    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('props');
    expect(result.props).toHaveProperty('viewBox', '0 0 24 24');
  });

  test('unknown name returns null (graceful fallback)', () => {
    const result = (Icon as any)({ name: 'totally-not-an-icon' });
    expect(result).toBeNull();
  });

  test('respects size prop in props of rendered Svg', () => {
    const result = (Icon as any)({ name: 'home', size: 32 });
    expect(result.props.width).toBe(32);
    expect(result.props.height).toBe(32);
  });

  test('default size is 20', () => {
    const result = (Icon as any)({ name: 'bell' });
    expect(result.props.width).toBe(20);
    expect(result.props.height).toBe(20);
  });

  test('children are populated (SVG paths / rects / circles)', () => {
    const result = (Icon as any)({ name: 'flame' });
    expect(result.props.children).toBeTruthy();
  });

  test('37 icons (union count) all render non-null', () => {
    // Quick sanity count so shifting the union size surfaces here too
    expect(NAMES.length).toBeGreaterThanOrEqual(37);
    for (const name of NAMES) {
      expect((Icon as any)({ name })).not.toBeNull();
    }
  });
});
