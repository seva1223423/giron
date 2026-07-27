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
  // Added after the round-100 baseline and missed by the old one-directional
  // guard — the reverse check below found all nine at once (audit R43).
  'log_completed_workout',
  'delete_body_weight',
  'delete_body_measurement',
  'delete_cardio',
  'delete_sleep',
  'navigate_to_screen',
  'get_health_summary',
  'get_sleep_breakdown',
  'get_readiness_score',
];

/**
 * The ACTUAL inline tool names, read out of routes/ai.ts.
 *
 * The hand-written baseline above only ever proved "everything on the list
 * exists in code" — never the reverse — so nine tools were added without the
 * guard noticing, and the count assertion sat at 33 while the code shipped 42
 * (audit R43). Deriving the real list makes the check bidirectional and
 * self-maintaining.
 */
async function readActualToolNames(): Promise<string[]> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const content = await fs.readFile(path.resolve(__dirname, '../routes/ai.ts'), 'utf-8');
  return [...content.matchAll(/^\s+name: '([a-z][a-z0-9_]*)',$/gm)].map((m) => m[1]);
}

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

  test('the real tool list in routes/ai.ts has no duplicates', async () => {
    const actual = await readActualToolNames();
    expect(actual.length).toBeGreaterThan(0);
    expect(new Set(actual).size).toBe(actual.length);
  });

  test('every tool name uses snake_case (no spaces, no camelCase)', async () => {
    for (const name of await readActualToolNames()) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  test('no tool exists in code that the baseline list does not know about', async () => {
    // The direction the old suite never checked. If this fails, add the new
    // tool to EXPECTED_TOOL_NAMES *and* to the tool list in CLAUDE.md.
    const unknown = (await readActualToolNames()).filter((n) => !EXPECTED_TOOL_NAMES.includes(n));
    expect(unknown).toEqual([]);
  });

  test('every expected tool name appears in routes/ai.ts as a toolName === branch (round 135)', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const aiRoutePath = path.resolve(__dirname, '../routes/ai.ts');
    const content = await fs.readFile(aiRoutePath, 'utf-8');

    for (const name of EXPECTED_TOOL_NAMES) {
      // Each tool must have an executor branch — match either of:
      //   if (toolName === 'X')        — main dispatcher
      //   case 'X':                    — context-tool switch in contextTools
      const inMainDispatcher = content.includes(`toolName === '${name}'`);
      const inContextDispatcher = content.includes(`case '${name}'`);
      // CONTEXT_TOOL_DEFINITIONS may be imported from contextTools.ts —
      // its tools won't be in routes/ai.ts directly. So the assertion
      // only fires for tools defined inline in TOOL_DEFINITIONS, which
      // are ALL in EXPECTED_TOOL_NAMES per the round-100 baseline.
      if (!inMainDispatcher && !inContextDispatcher) {
        throw new Error(`Tool "${name}" has no executor branch in routes/ai.ts`);
      }
    }
  });

  test('CLAUDE.md mentions every expected tool name', async () => {
    // Read CLAUDE.md from the repo root and assert each tool name appears.
    // This catches doc drift when a new tool is added without bumping the
    // CLAUDE.md tool list.
    const fs = await import('fs/promises');
    const path = await import('path');
    const claudeMdPath = path.resolve(__dirname, '../../../CLAUDE.md');
    // Previously this swallowed a read failure and returned, so the check
    // could pass without ever running (audit R43). If the file moves, the
    // test must fail loudly and be pointed at the new path.
    const content = await fs.readFile(claudeMdPath, 'utf-8');
    const undocumented = (await readActualToolNames()).filter((n) => !content.includes(n));
    expect(undocumented).toEqual([]);
  });
});
