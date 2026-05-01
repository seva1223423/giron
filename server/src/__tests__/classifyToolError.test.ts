/**
 * Round 189 — tool-error classification tests.
 *
 * `classifyToolError` is the typed-error-recovery layer that replaced
 * the silent "Не удалось выполнить действие" fallback. The AI uses
 * the returned string to either retry with corrected input or explain
 * the constraint to the user.
 *
 * Each error class produces a distinct, actionable message:
 *   - Prisma P2025 → "record not found, suggest alternative"
 *   - Prisma P2002 → "already exists, no need to retry"
 *   - Prisma P2003 → "invalid foreign key reference"
 *   - Prisma P2024 → "DB connection timed out, retry later"
 *   - Zod ZodError → "validation failed: field.path: msg"
 *   - Generic Error with "not found" → "suggest pick from related"
 *   - Generic Error with "timeout" → "transient, retry in moment"
 *   - Generic Error with "rate limit" → "wait a minute"
 *   - Truly unknown → "unexpected, offer different approach"
 */

import { classifyToolError } from '../routes/ai';

// Mock Prisma errors look like { code: 'P2025', meta: { ... } }
function prismaErr(code: string, meta: Record<string, unknown> = {}): unknown {
  const e: any = new Error(`Prisma error: ${code}`);
  e.code = code;
  e.meta = meta;
  return e;
}

// Mock Zod error has .errors array of issues
function zodErr(issues: Array<{ path: string[]; message: string }>): unknown {
  const e: any = new Error('Zod validation failed');
  e.errors = issues;
  return e;
}

describe('classifyToolError — Prisma errors', () => {
  test('P2025 (not found) → tells AI to suggest alternatives', () => {
    const out = classifyToolError('log_meal', prismaErr('P2025', { modelName: 'Meal' }));
    expect(out).toMatch(/log_meal/);
    expect(out).toMatch(/not found/);
    expect(out).toMatch(/Suggest a similar alternative/);
  });

  test('P2002 (unique constraint) → tells user it already exists', () => {
    const out = classifyToolError('log_workout', prismaErr('P2002', { target: 'userId_date' }));
    expect(out).toMatch(/log_workout/);
    expect(out).toMatch(/already exists/);
    expect(out).toMatch(/userId_date/);
  });

  test('P2003 (foreign key) → invalid reference', () => {
    const out = classifyToolError('log_meal', prismaErr('P2003', { field_name: 'recipeId' }));
    expect(out).toMatch(/invalid reference/);
    expect(out).toMatch(/recipeId/);
  });

  test('P2024 (timeout) → transient, retry later', () => {
    const out = classifyToolError('analyze_progress', prismaErr('P2024'));
    expect(out).toMatch(/timed out/);
    expect(out).toMatch(/try again/i);
  });
});

describe('classifyToolError — Zod validation errors', () => {
  test('single field error includes path + message', () => {
    const out = classifyToolError('update_user_profile', zodErr([
      { path: ['weightKg'], message: 'must be between 35 and 250' },
    ]));
    expect(out).toMatch(/update_user_profile/);
    expect(out).toMatch(/validation failed/);
    expect(out).toMatch(/weightKg/);
    expect(out).toMatch(/must be between 35 and 250/);
  });

  test('multiple field errors join with comma', () => {
    const out = classifyToolError('create_workout', zodErr([
      { path: ['name'], message: 'required' },
      { path: ['exercises'], message: 'must have at least 1' },
      { path: ['daysPerWeek'], message: 'must be 1-7' },
    ]));
    expect(out).toMatch(/name/);
    expect(out).toMatch(/exercises/);
    expect(out).toMatch(/daysPerWeek/);
  });

  test('truncates to first 3 issues to keep prompt small', () => {
    const issues = Array.from({ length: 10 }, (_, i) => ({
      path: [`field${i}`],
      message: 'invalid',
    }));
    const out = classifyToolError('big_input_tool', zodErr(issues));
    // Should mention first 3 fields, not all 10
    expect(out).toContain('field0');
    expect(out).toContain('field1');
    expect(out).toContain('field2');
    expect(out).not.toContain('field4');
  });
});

describe('classifyToolError — generic Errors', () => {
  test('"not found" message → suggest related items', () => {
    const out = classifyToolError('find_recipes', new Error('Recipe "блины с икрой" not found'));
    expect(out).toMatch(/find_recipes/);
    expect(out).toMatch(/блины с икрой/);
    expect(out).toMatch(/Suggest the user pick from related/);
  });

  test('"timeout" message → transient, retry', () => {
    const out = classifyToolError('analyze_progress', new Error('Request timed out after 30s'));
    expect(out).toMatch(/transient/);
    expect(out).toMatch(/retry in a moment/);
    expect(out).toMatch(/don't promise/);
  });

  test('ECONNRESET → transient', () => {
    const out = classifyToolError('log_meal', new Error('ECONNRESET on db connection'));
    expect(out).toMatch(/transient/);
  });

  test('"rate limit" message → wait a minute', () => {
    const out = classifyToolError('search_exercises', new Error('Hit rate limit on Algolia'));
    expect(out).toMatch(/rate-limited/);
    expect(out).toMatch(/wait a minute/);
  });

  test('truncates message to 200 chars to bound prompt growth', () => {
    const huge = 'X'.repeat(500);
    const out = classifyToolError('foo', new Error(huge));
    // The 200-char cap on the error message body — total output may be slightly larger
    // due to wrapper text but should be < 500
    expect(out.length).toBeLessThan(400);
  });

  test('generic message → acknowledge + offer alternative', () => {
    const out = classifyToolError('log_water', new Error('Some weird state'));
    expect(out).toMatch(/Acknowledge to the user/);
    expect(out).toMatch(/offer an alternative/);
  });
});

describe('classifyToolError — unknown error shape', () => {
  test('non-Error object → unexpected failure message', () => {
    const out = classifyToolError('mystery_tool', { weird: 'thing' });
    expect(out).toMatch(/mystery_tool/);
    expect(out).toMatch(/unexpected failure/);
    expect(out).toMatch(/don't keep retrying/);
  });

  test('null error → still classified', () => {
    const out = classifyToolError('null_tool', null);
    expect(out).toMatch(/null_tool/);
    expect(out).toMatch(/unexpected failure/);
  });

  test('undefined error → still classified', () => {
    const out = classifyToolError('undef_tool', undefined);
    expect(out).toMatch(/unexpected failure/);
  });

  test('plain string thrown → handled', () => {
    const out = classifyToolError('str_tool', 'thrown a string');
    expect(out).toMatch(/unexpected failure/);
  });
});

describe('classifyToolError — output safety', () => {
  test('every error type produces TOOL_ERROR(toolName) prefix', () => {
    const cases = [
      classifyToolError('a', prismaErr('P2025')),
      classifyToolError('b', zodErr([{ path: ['x'], message: 'y' }])),
      classifyToolError('c', new Error('not found')),
      classifyToolError('d', new Error('random')),
      classifyToolError('e', null),
    ];
    for (const c of cases) {
      expect(c).toMatch(/^TOOL_ERROR\(/);
    }
  });

  test('all messages stay under 500 chars (bounded prompt growth)', () => {
    const cases = [
      classifyToolError('toolA', prismaErr('P2025', { modelName: 'X' })),
      classifyToolError('toolB', new Error('X'.repeat(500))),
      classifyToolError('toolC', zodErr([
        { path: ['a', 'b', 'c'], message: 'X'.repeat(100) },
        { path: ['d'], message: 'X'.repeat(100) },
      ])),
    ];
    for (const c of cases) {
      expect(c.length).toBeLessThan(500);
    }
  });
});
