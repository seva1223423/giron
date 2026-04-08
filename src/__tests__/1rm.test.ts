describe('1RM Epley formula', () => {
  // Matches the formula used in achievements.ts: weight * (1 + reps / 30)
  const calc1RM = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30));

  test('1 rep = weight * 1.033', () => {
    expect(calc1RM(100, 1)).toBe(103); // 100 * 1.033
  });

  test('10 reps at 80kg', () => {
    expect(calc1RM(80, 10)).toBe(107); // 80 * 1.333
  });

  test('5 reps at 100kg', () => {
    expect(calc1RM(100, 5)).toBe(117); // 100 * 1.167
  });

  test('0 weight returns 0', () => {
    expect(calc1RM(0, 10)).toBe(0);
  });

  test('0 reps returns weight', () => {
    expect(calc1RM(100, 0)).toBe(100);
  });

  test('heavy single at 200kg', () => {
    expect(calc1RM(200, 1)).toBe(207);
  });

  test('high reps at low weight', () => {
    expect(calc1RM(40, 20)).toBe(67); // 40 * 1.667
  });
});
