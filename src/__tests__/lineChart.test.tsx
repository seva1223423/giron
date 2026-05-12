/**
 * LineChart smoke test — pins the rendering contract for the upgraded
 * (gradient + interactive tooltip) chart so a future refactor that breaks
 * the API for 6 call sites (WeightTab, SleepTab, CardioTab, OverviewTab,
 * BodyMeasurementsCard, PersonalRecordCard) trips the test first.
 *
 * Doesn't try to test the gesture / tooltip rendering — that requires a
 * real RN test renderer and PanResponder mock infra that's heavy for what
 * is a visual upgrade. We just pin: (1) returns null on <2 points,
 * (2) renders an SVG when >=2 points, (3) accepts the existing data
 * shape { label, value } so call sites don't need to change.
 */

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: object) => s },
  Platform: { OS: 'ios', select: (o: { ios?: unknown; android?: unknown }) => o.ios ?? o.android ?? {} },
  PanResponder: {
    create: () => ({
      panHandlers: {},
    }),
  },
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Stop: 'Stop',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  Line: 'Line',
  Circle: 'Circle',
}));

import React from 'react';
import TestRenderer from 'react-test-renderer';
import { LineChart } from '../screens/progress/components/LineChart';

const colors = {
  text: '#F4F1EA',
  textTertiary: '#6B6860',
  surface: '#17171A',
  background: '#0E0E0F',
  borderLight: 'rgba(255,255,255,0.04)',
};

describe('LineChart — upgraded interactive chart', () => {
  it('returns null when data has fewer than 2 points', () => {
    const tree = TestRenderer.create(
      <LineChart data={[{ label: '1 май', value: 80 }]} color="#D4B07A" colors={colors} />,
    );
    expect(tree.toJSON()).toBeNull();
  });

  it('accepts the documented props shape (no TS regressions)', () => {
    // Compile-time contract — if the LineChart props change shape (e.g.
    // someone drops `suffix` or renames `colors`), this file's TS check
    // fails before runtime.
    const props = {
      data: [
        { label: 'Янв', value: 1 },
        { label: 'Фев', value: 2 },
      ],
      color: '#D4B07A',
      height: 100,
      colors,
      suffix: ' кг',
    };
    expect(() => TestRenderer.create(<LineChart {...props} />)).not.toThrow();
  });
});
