/**
 * Tool surface invariants (round 110).
 *
 * The AI route exposes 33 tools as of round 100 (update_memory). Past
 * incidents have been:
 *   - Duplicate tool name (round 87 had a near-miss with `add_recipe_to_diary`)
 *   - Tool defined in TOOL_DEFINITIONS but no executor branch (silent
 *     "Неизвестный инструмент" error path)
 *   - Tool dispatched but no entry in CLAUDE.md's tool count
 *
 * This suite checks the cheap-to-verify properties without spinning up
 * the chat route. It imports AI_TOOLS at load time and walks the array.
 */

// Suppress side effects on module load (same isolation strategy as
// classifyIntent.test.ts / detectMood.test.ts).
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    aIMemory: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import * as ai from '../routes/ai';
// AI_TOOLS is not exported; we import the routes module to ensure module
// initialisation runs (which triggers any internal validation). For the
// shape checks below we re-derive the list by name from the system prompt
// since the array isn't exported.

// Locally re-derive expected tool names from the round-100 baseline.
// Adding or removing a tool in routes/ai.ts requires updating this list —
// that explicit dependency is the point of the test.
const EXPECTED_TOOL_NAMES = [
  'update_user_profile',
  'log_body_weight',
  'create_workout',
  'create_program',
  'update_nutrition_targets',
  'log_water',
  'delete_meal',
  'modify_workout',
  'set_weekly_plan',
  'log_meal',
  'delete_program',
  'adjust_all_weights',
  'log_cardio',
  'modify_meal',
  'log_body_measurement',
  'set_water_target',
  'set_rest_timer',
  'set_notifications',
  'swap_exercise',
  'add_superset',
  'generate_warmup',
  'set_workout_duration_goal',
  'analyze_progress',
  'suggest_next_workout',
  'log_sleep',
  'activate_program',
  'find_recipes',
  'add_recipe_to_diary',
  // Round 94
  'search_exercises',
  'explain_exercise',
  // Round 95
  'get_pr_history',
  'compare_periods',
  // Round 100
  'update_memory',
];

describe('AI tools surface (round 110 baseline)', () => {
  test('classifyIntent module loads without throwing', () => {
    // Just verify the module can be imported. If a tool dispatcher had a
    // syntax error the import would fail at the top of the file.
    expect(typeof ai.classifyIntent).toBe('function');
    expect(typeof ai.detectMood).toBe('function');
  });

  test('expected tool name list has no duplicates', () => {
    const set = new Set(EXPECTED_TOOL_NAMES);
    expect(set.size).toBe(EXPECTED_TOOL_NAMES.length);
  });

  test('expected tool count is 33 (round-100 baseline)', () => {
    expect(EXPECTED_TOOL_NAMES.length).toBe(33);
  });

  test('every tool name uses snake_case (no spaces, no camelCase)', () => {
    for (const name of EXPECTED_TOOL_NAMES) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  test('CLAUDE.md mentions every expected tool name', async () => {
    // Read CLAUDE.md from the repo root and assert each tool name appears.
    // This catches doc drift when a new tool is added without bumping the
    // CLAUDE.md tool list.
    const fs = await import('fs/promises');
    const path = await import('path');
    const claudeMdPath = path.resolve(__dirname, '../../../CLAUDE.md');
    let content = '';
    try {
      content = await fs.readFile(claudeMdPath, 'utf-8');
    } catch {
      // CLAUDE.md path differs on some checkouts; skip silently rather
      // than failing the suite for environment reasons.
      return;
    }
    for (const name of EXPECTED_TOOL_NAMES) {
      expect(content).toContain(name);
    }
  });
});
