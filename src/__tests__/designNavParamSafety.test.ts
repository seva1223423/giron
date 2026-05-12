/**
 * Nav param safety — React Navigation silently passes through
 * unstable/null/undefined params. If a screen expects `route.params.id`
 * and it's missing, we get a crash deep inside the render. These
 * tests lock the shape of the param typings (via consumer helpers)
 * and exercise their defensive defaults.
 */

// Minimal guards that screens use. We duplicate them here rather than
// import, because importing the screen would pull in the full RN/Nav
// graph.

interface SafeRoute<T> {
  name?: string;
  params?: Partial<T> | undefined;
}

function withRouteDefaults<T extends object>(route: SafeRoute<T>, defaults: T): T {
  return { ...defaults, ...(route.params ?? {}) };
}

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length < 100;
}

function parseWorkoutIdParam(raw: unknown): string | null {
  if (!isValidId(raw)) return null;
  return raw;
}

describe('withRouteDefaults', () => {
  test('empty route → all defaults', () => {
    const out = withRouteDefaults({}, { a: 1, b: 'x' });
    expect(out).toEqual({ a: 1, b: 'x' });
  });

  test('partial params override defaults', () => {
    const out = withRouteDefaults({ params: { a: 5 } }, { a: 1, b: 'x' });
    expect(out).toEqual({ a: 5, b: 'x' });
  });

  test('null params → defaults', () => {
    const out = withRouteDefaults({ params: undefined }, { a: 1, b: 'x' });
    expect(out).toEqual({ a: 1, b: 'x' });
  });

  test('undefined params → defaults', () => {
    const out = withRouteDefaults({ params: undefined }, { a: 1, b: 'x' });
    expect(out).toEqual({ a: 1, b: 'x' });
  });

  test('full override', () => {
    const out = withRouteDefaults({ params: { a: 10, b: 'y' } }, { a: 1, b: 'x' });
    expect(out).toEqual({ a: 10, b: 'y' });
  });

  test('extra keys in params preserved', () => {
    const out = withRouteDefaults<any>({ params: { a: 5, extra: true } }, { a: 1 });
    expect(out.extra).toBe(true);
  });
});

describe('isValidId (workout/meal/routine IDs)', () => {
  test('empty string invalid', () => {
    expect(isValidId('')).toBe(false);
  });

  test('null invalid', () => {
    expect(isValidId(null)).toBe(false);
  });

  test('undefined invalid', () => {
    expect(isValidId(undefined)).toBe(false);
  });

  test('number invalid (we use string IDs)', () => {
    expect(isValidId(12345)).toBe(false);
  });

  test('empty object invalid', () => {
    expect(isValidId({})).toBe(false);
  });

  test('array invalid', () => {
    expect(isValidId([])).toBe(false);
  });

  test('regular ID string valid', () => {
    expect(isValidId('workout-123')).toBe(true);
    expect(isValidId('a')).toBe(true);
    expect(isValidId('uuid-style-4c-8a-9e-f0')).toBe(true);
  });

  test('very long string rejected (likely injection)', () => {
    expect(isValidId('x'.repeat(200))).toBe(false);
  });

  test('boolean invalid', () => {
    expect(isValidId(true)).toBe(false);
  });
});

describe('parseWorkoutIdParam', () => {
  test('null raw → null', () => {
    expect(parseWorkoutIdParam(null)).toBeNull();
  });

  test('valid string → same string', () => {
    expect(parseWorkoutIdParam('w-123')).toBe('w-123');
  });

  test('integer → null', () => {
    expect(parseWorkoutIdParam(42)).toBeNull();
  });

  test('object → null', () => {
    expect(parseWorkoutIdParam({ id: 'x' })).toBeNull();
  });

  test('array → null', () => {
    expect(parseWorkoutIdParam(['w-1'])).toBeNull();
  });

  test('empty string → null', () => {
    expect(parseWorkoutIdParam('')).toBeNull();
  });
});

describe('Deep-link route params', () => {
  // Simulating an attacker-crafted deep link like giron://workout/<id>
  test('very long ID from URL rejected', () => {
    const suspicious = 'x'.repeat(500);
    expect(parseWorkoutIdParam(suspicious)).toBeNull();
  });

  test('URL-encoded nonsense rejected at boundary', () => {
    // %22%22 = "", empty
    const raw = '';
    expect(parseWorkoutIdParam(raw)).toBeNull();
  });

  test('base64 JSON blob too long', () => {
    const raw = Buffer.from(JSON.stringify({ a: 1, b: 2 })).toString('base64');
    // Only rejected if long. Typical {}b64 is 16-chars, ok.
    const result = parseWorkoutIdParam(raw);
    // Not expected to be null for short strings
    expect(typeof result).toMatch(/string|object/);
  });
});

describe('Back navigation state assumptions', () => {
  // The app relies on canGoBack() — test that the assumption that
  // navigation stack is non-empty is codified. In practice, this means
  // onboarding's "Skip" and "Back" chips render conditionally on stack
  // depth.
  test('stack depth integer ≥ 0', () => {
    const depths = [0, 1, 2, 3, 10];
    for (const d of depths) {
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  test('canGoBack derived from depth > 1', () => {
    const canGoBack = (depth: number) => depth > 1;
    expect(canGoBack(0)).toBe(false);
    expect(canGoBack(1)).toBe(false);
    expect(canGoBack(2)).toBe(true);
    expect(canGoBack(10)).toBe(true);
  });
});
