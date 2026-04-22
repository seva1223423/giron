import { normalizeGender, isFemale, isMale, type NormalizedGender } from '../utils/gender';

/**
 * Tests for src/utils/gender.ts
 *
 * The bug that motivated this helper: the server returns Prisma enum values
 * in UPPERCASE ("MALE"/"FEMALE") but the client code compared against lowercase
 * ("male"/"female") — causing the wrong BMR formula to be used for every user
 * whose profile was fetched from the server.
 */

describe('normalizeGender', () => {
  // Server uppercase → lowercase
  test('normalises MALE to male', () => {
    expect(normalizeGender('MALE')).toBe<NormalizedGender>('male');
  });

  test('normalises FEMALE to female', () => {
    expect(normalizeGender('FEMALE')).toBe<NormalizedGender>('female');
  });

  // Already lowercase passthrough
  test('passes through lowercase male unchanged', () => {
    expect(normalizeGender('male')).toBe<NormalizedGender>('male');
  });

  test('passes through lowercase female unchanged', () => {
    expect(normalizeGender('female')).toBe<NormalizedGender>('female');
  });

  // Mixed case
  test('handles mixed-case Male', () => {
    expect(normalizeGender('Male')).toBe<NormalizedGender>('male');
  });

  test('handles mixed-case Female', () => {
    expect(normalizeGender('Female')).toBe<NormalizedGender>('female');
  });

  // Null / undefined / unknown
  test('returns undefined for null', () => {
    expect(normalizeGender(null)).toBeUndefined();
  });

  test('returns undefined for undefined', () => {
    expect(normalizeGender(undefined)).toBeUndefined();
  });

  test('returns undefined for empty string', () => {
    expect(normalizeGender('')).toBeUndefined();
  });

  test('returns undefined for unrecognised string', () => {
    expect(normalizeGender('OTHER')).toBeUndefined();
    expect(normalizeGender('nonbinary')).toBeUndefined();
    expect(normalizeGender('m')).toBeUndefined();
  });
});

describe('isFemale', () => {
  test('returns true for FEMALE (server enum)', () => {
    expect(isFemale('FEMALE')).toBe(true);
  });

  test('returns true for lowercase female', () => {
    expect(isFemale('female')).toBe(true);
  });

  test('returns false for MALE', () => {
    expect(isFemale('MALE')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isFemale(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isFemale(undefined)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isFemale('')).toBe(false);
  });
});

describe('isMale', () => {
  test('returns true for MALE (server enum)', () => {
    expect(isMale('MALE')).toBe(true);
  });

  test('returns true for lowercase male', () => {
    expect(isMale('male')).toBe(true);
  });

  test('returns false for FEMALE', () => {
    expect(isMale('FEMALE')).toBe(false);
  });

  test('returns false for null', () => {
    expect(isMale(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isMale(undefined)).toBe(false);
  });

  test('isFemale and isMale are mutually exclusive for valid genders', () => {
    expect(isFemale('MALE') && isMale('MALE')).toBe(false);
    expect(isFemale('FEMALE') && isMale('FEMALE')).toBe(false);
    // Exactly one true per valid gender
    expect(isFemale('MALE') || isMale('MALE')).toBe(true);
    expect(isFemale('FEMALE') || isMale('FEMALE')).toBe(true);
  });
});
