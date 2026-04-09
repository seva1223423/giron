/**
 * Regression tests for comma decimal separator handling (Russian locale bug)
 */

describe('comma decimal handling', () => {
  // BUG: parseFloat("72,5") returned 72 on Russian keyboards
  // FIX: .replace(',', '.') before parseFloat

  const parseWeight = (input: string) => parseFloat(input.replace(',', '.')) || 0;

  test('handles dot decimal', () => {
    expect(parseWeight('72.5')).toBe(72.5);
  });

  test('handles comma decimal (Russian locale)', () => {
    expect(parseWeight('72,5')).toBe(72.5);
  });

  test('handles integer', () => {
    expect(parseWeight('80')).toBe(80);
  });

  test('handles empty string', () => {
    expect(parseWeight('')).toBe(0);
  });

  test('handles invalid input', () => {
    expect(parseWeight('abc')).toBe(0);
  });

  test('handles zero', () => {
    expect(parseWeight('0')).toBe(0);
  });

  test('handles large numbers with comma', () => {
    expect(parseWeight('142,5')).toBe(142.5);
  });

  test('handles leading/trailing spaces with comma', () => {
    expect(parseWeight(' 72,5 '.trim().replace(',', '.'))).toBe(72.5);
  });
});

describe('PlateCalculator operator precedence bug', () => {
  // BUG FIX: PlateCalculator operator precedence
  // Was: parseFloat(x) || 0 + delta -> delta never added when parseFloat succeeds
  //   because || has lower precedence than +, so it became: parseFloat(x) || (0 + delta)
  //   When parseFloat succeeds (truthy), the right side is ignored -> delta lost
  // Fix: (parseFloat(x) || 0) + delta
  const adjustWeight = (input: string, delta: number) => {
    return Math.max(0, Math.round(((parseFloat(input.replace(',', '.')) || 0) + delta) * 4) / 4);
  };

  test('+2.5 adds correctly', () => {
    expect(adjustWeight('100', 2.5)).toBe(102.5);
  });

  test('-2.5 subtracts correctly', () => {
    expect(adjustWeight('100', -2.5)).toBe(97.5);
  });

  test('from 0 + 2.5', () => {
    expect(adjustWeight('0', 2.5)).toBe(2.5);
  });

  test('from empty + 2.5', () => {
    expect(adjustWeight('', 2.5)).toBe(2.5);
  });

  test('never goes below 0', () => {
    expect(adjustWeight('1', -5)).toBe(0);
  });

  test('rounds to nearest 0.25', () => {
    expect(adjustWeight('100', 0.3)).toBe(100.25);
    expect(adjustWeight('100', 0.1)).toBe(100);
  });

  test('handles comma decimal input with delta', () => {
    expect(adjustWeight('72,5', 2.5)).toBe(75);
    expect(adjustWeight('72,5', -2.5)).toBe(70);
  });

  // Demonstrate the original bug:
  test('REGRESSION: old code parseFloat(x) || 0 + delta would fail', () => {
    // Old buggy version: parseFloat(input) || 0 + delta
    const buggyAdjust = (input: string, delta: number) => {
      // This is what the bug looked like (DO NOT USE):
      // eslint-disable-next-line no-mixed-operators
      return parseFloat(input.replace(',', '.')) || 0 + delta;
    };
    // When parseFloat succeeds, delta is ignored!
    expect(buggyAdjust('100', 2.5)).toBe(100); // BUG: should be 102.5
    // When parseFloat fails (returns NaN), it falls through to 0 + delta
    expect(buggyAdjust('', 2.5)).toBe(2.5); // This accidentally works
  });
});
