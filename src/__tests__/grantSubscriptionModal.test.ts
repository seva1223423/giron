/**
 * Unit tests for GrantSubscriptionModal date resolution logic.
 *
 * The modal owns plan + duration selection. Pure logic (preset vs custom vs lifetime)
 * is extracted into resolveEndDate / addDays / parseCustomDays so it can be tested
 * without rendering the component.
 */

import {
  addDays,
  parseCustomDays,
  resolveEndDate,
  CUSTOM_MIN,
  CUSTOM_MAX,
} from '../screens/admin/components/GrantSubscriptionModal';

const FIXED_NOW = new Date('2026-05-07T12:00:00Z');

describe('addDays', () => {
  it('returns YYYY-MM-DD shifted by N days', () => {
    expect(addDays(30, FIXED_NOW)).toBe('2026-06-06');
    expect(addDays(7, FIXED_NOW)).toBe('2026-05-14');
    expect(addDays(365, FIXED_NOW)).toBe('2027-05-07');
  });

  it('handles year rollover', () => {
    const dec31 = new Date('2026-12-31T12:00:00Z');
    expect(addDays(1, dec31)).toBe('2027-01-01');
  });
});

describe('parseCustomDays', () => {
  it('returns number for valid input within bounds', () => {
    expect(parseCustomDays('45')).toBe(45);
    expect(parseCustomDays(String(CUSTOM_MIN))).toBe(CUSTOM_MIN);
    expect(parseCustomDays(String(CUSTOM_MAX))).toBe(CUSTOM_MAX);
  });

  it('returns null for out-of-bounds or invalid input', () => {
    expect(parseCustomDays('0')).toBeNull();
    expect(parseCustomDays('-5')).toBeNull();
    expect(parseCustomDays(String(CUSTOM_MAX + 1))).toBeNull();
    expect(parseCustomDays('abc')).toBeNull();
    expect(parseCustomDays('')).toBeNull();
  });
});

describe('resolveEndDate', () => {
  it('returns null for lifetime preset (presetDays === null)', () => {
    expect(resolveEndDate(null, '', FIXED_NOW)).toBeNull();
  });

  it('returns shifted date for numeric preset', () => {
    expect(resolveEndDate(30, '', FIXED_NOW)).toBe('2026-06-06');
    expect(resolveEndDate(7, '', FIXED_NOW)).toBe('2026-05-14');
  });

  it('uses custom field when filled, ignoring preset', () => {
    expect(resolveEndDate(30, '45', FIXED_NOW)).toBe('2026-06-21');
    expect(resolveEndDate(null, '45', FIXED_NOW)).toBe('2026-06-21');
  });

  it('returns undefined when custom is filled but invalid', () => {
    expect(resolveEndDate(30, 'abc', FIXED_NOW)).toBeUndefined();
    expect(resolveEndDate(30, '0', FIXED_NOW)).toBeUndefined();
    expect(resolveEndDate(30, String(CUSTOM_MAX + 1), FIXED_NOW)).toBeUndefined();
  });

  it('returns undefined when nothing selected', () => {
    expect(resolveEndDate(undefined, '', FIXED_NOW)).toBeUndefined();
  });

  it('whitespace-only custom is treated as empty (preset wins)', () => {
    expect(resolveEndDate(30, '   ', FIXED_NOW)).toBe('2026-06-06');
  });
});
