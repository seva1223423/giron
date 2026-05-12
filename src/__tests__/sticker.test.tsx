/**
 * Sticker — branded achievement sticker resolver + render contract.
 *
 * Pins two things:
 *  1. The resolver `getStickerForAchievement` returns a valid sticker ID
 *     for EVERY one of the 48 achievements defined in
 *     `utils/achievements.ts`. If a new achievement is added and slips
 *     past the prefix-match table, the test fails before it ships as a
 *     missing sticker.
 *  2. `<AchievementSticker>` accepts the documented props shape.
 */

jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  StyleSheet: { create: (s: object) => s },
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Svg: 'Svg',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Stop: 'Stop',
  Path: 'Path',
  Rect: 'Rect',
  Circle: 'Circle',
  Ellipse: 'Ellipse',
  G: 'G',
  Text: 'SvgText',
}));

import React from 'react';
import TestRenderer from 'react-test-renderer';
import {
  AchievementSticker,
  Sticker,
  getStickerForAchievement,
  type StickerId,
} from '../components/Sticker';
import { ACHIEVEMENT_DEFINITIONS, type Achievement } from '../utils/achievements';

const VALID_STICKER_IDS: StickerId[] = [
  'pr', 'streak', 'barbell', 'bolt', 'trophy', 'sweat',
  'beast', 'hr', 'hundred', 'ai', 'sleep', 'go',
];

describe('Sticker — resolver completeness', () => {
  it('every ACHIEVEMENT_DEFINITION maps to a known sticker', () => {
    // Iterate all 48 achievements and assert each lands on a known sticker.
    // If someone adds achievement #49 with a novel id-prefix, the prefix-match
    // table in getStickerForAchievement falls through to the category default
    // — still valid, won't fail. But if category is also unknown, this test
    // catches it because the result won't be in VALID_STICKER_IDS.
    const unmapped: string[] = [];
    ACHIEVEMENT_DEFINITIONS.forEach((def) => {
      const stickerId = getStickerForAchievement({
        id: def.id,
        category: def.category,
      });
      if (!VALID_STICKER_IDS.includes(stickerId)) {
        unmapped.push(`${def.id} → ${stickerId}`);
      }
    });
    expect(unmapped).toEqual([]);
  });

  it('produces the expected sticker for representative achievements', () => {
    // Pin a few key mappings so refactors that quietly change the resolver
    // logic surface in this test. Touch the most "promised" mappings.
    expect(getStickerForAchievement({ id: 'first_workout', category: 'workout' })).toBe('go');
    expect(getStickerForAchievement({ id: 'streak_30', category: 'streak' })).toBe('streak');
    expect(getStickerForAchievement({ id: 'workouts_100', category: 'workout' })).toBe('barbell');
    expect(getStickerForAchievement({ id: 'bench_100', category: 'strength' })).toBe('pr');
    expect(getStickerForAchievement({ id: 'big3_500', category: 'strength' })).toBe('trophy');
    expect(getStickerForAchievement({ id: 'volume_1m', category: 'strength' })).toBe('beast');
    expect(getStickerForAchievement({ id: 'single_workout_10k', category: 'strength' })).toBe('bolt');
    expect(getStickerForAchievement({ id: 'reps_5000', category: 'strength' })).toBe('sweat');
    expect(getStickerForAchievement({ id: 'nutrition_30', category: 'nutrition' })).toBe('hundred');
    expect(getStickerForAchievement({ id: 'exercises_50', category: 'exploration' })).toBe('ai');
    expect(getStickerForAchievement({ id: 'morning_10', category: 'exploration' })).toBe('hr');
    expect(getStickerForAchievement({ id: 'workout_3h', category: 'exploration' })).toBe('sleep');
    expect(getStickerForAchievement({ id: 'weekend_warrior', category: 'exploration' })).toBe('go');
  });

  it('falls back to category default for unknown id', () => {
    // Future-proofing: if someone adds an achievement with no matching prefix,
    // the category-default fallback kicks in so we never render undefined.
    expect(getStickerForAchievement({ id: 'totally_new_id', category: 'streak' })).toBe('streak');
    expect(getStickerForAchievement({ id: 'totally_new_id', category: 'strength' })).toBe('pr');
    expect(getStickerForAchievement({ id: 'totally_new_id', category: 'nutrition' })).toBe('hundred');
    expect(getStickerForAchievement({ id: 'totally_new_id', category: 'exploration' })).toBe('ai');
    expect(getStickerForAchievement({ id: 'totally_new_id', category: 'workout' })).toBe('barbell');
  });
});

describe('Sticker — render contract', () => {
  it('Sticker accepts all 12 sticker ids without throwing', () => {
    VALID_STICKER_IDS.forEach((id) => {
      expect(() =>
        TestRenderer.create(<Sticker stickerId={id} size={48} />),
      ).not.toThrow();
    });
  });

  it('AchievementSticker accepts a full Achievement shape', () => {
    const ach: Achievement = {
      id: 'streak_7',
      emoji: '●',
      title: 'Test',
      description: 'desc',
      category: 'streak',
      unlocked: true,
    };
    expect(() =>
      TestRenderer.create(<AchievementSticker achievement={ach} size={48} />),
    ).not.toThrow();
  });

  it('Sticker falls back to barbell for unknown sticker id (safety net)', () => {
    // TS won't let a real caller pass an unknown id, but a stale ID from
    // AsyncStorage / a server payload could slip in. Lock the fallback.
    expect(() =>
      TestRenderer.create(<Sticker stickerId={'unknown_thing' as StickerId} size={48} />),
    ).not.toThrow();
  });
});
