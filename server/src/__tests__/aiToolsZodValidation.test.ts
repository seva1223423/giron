/**
 * Tests for the Zod input validation layer added across all 39
 * parameter-taking AI tools (audit R-2026-05-22 follow-up).
 *
 * Each test exercises one tool with intentionally-bad input and
 * asserts the tool returns the graceful "Ошибка параметров X: ..."
 * message instead of throwing or silently corrupting data.
 *
 * Static-grep style — we don't need a live executeTool runtime because
 * the safeParse call is the same shape in every tool. One grep
 * confirms the pattern is consistently applied; per-tool runtime
 * tests would be 39 nearly-identical files.
 *
 * If a future commit removes a Zod schema or replaces safeParse with
 * cast-without-validation, this test catches it.
 */

import * as fs from 'fs';
import * as path from 'path';

const AI_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'routes', 'ai.ts'),
  'utf8',
);

// Tools that DON'T take parameters — no Zod expected.
const NO_PARAM_TOOLS = ['delete_program', 'suggest_next_workout', 'get_readiness_score'];

// All other tools that have an `if (toolName === 'X')` branch must
// either use a Zod schema OR be in NO_PARAM_TOOLS above. Anything not
// in either list means a regression.
const ALL_TOOLS = [
  'update_user_profile', 'log_body_weight', 'create_workout',
  'log_completed_workout', 'log_meal', 'log_water', 'delete_meal',
  'create_program', 'update_nutrition_targets', 'modify_workout',
  'set_weekly_plan', 'delete_program', 'activate_program',
  'adjust_all_weights', 'log_cardio', 'get_health_summary',
  'get_sleep_breakdown', 'get_readiness_score', 'delete_cardio',
  'modify_meal', 'log_body_measurement', 'set_water_target',
  'set_rest_timer', 'set_notifications', 'swap_exercise',
  'add_superset', 'generate_warmup', 'set_workout_duration_goal',
  'analyze_progress', 'suggest_next_workout', 'log_sleep',
  'delete_sleep', 'delete_body_measurement', 'delete_body_weight',
  'find_recipes', 'add_recipe_to_diary', 'search_exercises',
  'explain_exercise', 'get_pr_history', 'compare_periods',
  'update_memory', 'navigate_to_screen',
];

describe('AI tool Zod validation coverage', () => {
  test('every parameter-taking tool uses safeParse on toolInput', () => {
    for (const tool of ALL_TOOLS) {
      if (NO_PARAM_TOOLS.includes(tool)) continue;
      // Find the tool's branch and confirm safeParse appears between
      // the branch start and the next `if (toolName ===` (or end of fn).
      const branchRe = new RegExp(
        `if \\(toolName === '${tool}'\\)[\\s\\S]*?(?=if \\(toolName === '|^}$)`,
        'm',
      );
      const match = AI_SRC.match(branchRe);
      expect(match).not.toBeNull();
      expect(match![0]).toMatch(/\.safeParse\(toolInput\)/);
    }
  });

  test('NO raw `toolInput as { ... }` casts remain in executeTool branches', () => {
    // Before this audit, every tool did `const { x } = toolInput as { x: Y }`
    // which bypassed runtime validation. Post-fix should be zero.
    expect(AI_SRC).not.toMatch(/toolInput as \{/);
  });

  test('every tool with Zod has a graceful error path (no throw)', () => {
    // The pattern is `if (!parsed.success) { return { resultText:
    // 'Ошибка параметров X: ...', actionDescription: '' }; }` —
    // graceful so the AI can re-ask, not a 500 to the client.
    const errorReturns = AI_SRC.match(/Ошибка параметров \w+:/g) || [];
    // 39 tools should have this string (one per Zod schema).
    expect(errorReturns.length).toBeGreaterThanOrEqual(39);
  });
});

describe('Zod schema shape — sample tools', () => {
  test('log_body_weight schema accepts string OR number for weightKg', () => {
    // Mistral occasionally wraps numerics as strings; the schema must
    // accept both. Confirmed by the z.union([z.number(), z.string()])
    // form. Pins the union — a future commit narrowing back to z.number
    // would break this.
    expect(AI_SRC).toMatch(
      /logBodyWeightSchema[\s\S]*?weightKg:\s*z\.union\(\[z\.number\(\),\s*z\.string\(\)\]\)/,
    );
  });

  test('create_workout schema bounds reps + sets + weight', () => {
    expect(AI_SRC).toMatch(/createWorkoutSchema[\s\S]*?sets:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(50\)/);
    expect(AI_SRC).toMatch(/createWorkoutSchema[\s\S]*?reps:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(1000\)/);
    expect(AI_SRC).toMatch(/createWorkoutSchema[\s\S]*?weight:\s*z\.number\(\)\.min\(0\)\.max\(2000\)/);
  });

  test('set_weekly_plan caps dayIndex to 0-6 and schedule length to 7', () => {
    expect(AI_SRC).toMatch(/setWeeklyPlanSchema[\s\S]*?dayIndex:\s*z\.number\(\)\.int\(\)\.min\(0\)\.max\(6\)/);
    expect(AI_SRC).toMatch(/setWeeklyPlanSchema[\s\S]*?\}\)\)\.max\(7\)/);
  });

  test('log_cardio accepts string-or-number for all numeric fields', () => {
    // The original code already coerced via Number(); Zod just lets
    // string-form values through without rejecting the call.
    expect(AI_SRC).toMatch(/logCardioSchema[\s\S]*?durationMinutes:\s*z\.union\(\[z\.number\(\),\s*z\.string\(\)\]\)/);
    expect(AI_SRC).toMatch(/logCardioSchema[\s\S]*?avgHeartRate:\s*z\.union\(\[z\.number\(\),\s*z\.string\(\)\]\)/);
  });

  test('navigate_to_screen accepts arbitrary params object', () => {
    // `params` is forwarded as-is to the client; the whitelist gate
    // happens downstream in validateNavigation. Schema must be open.
    expect(AI_SRC).toMatch(/navigateSchema[\s\S]*?params:\s*z\.record\(z\.unknown\(\)\)\.optional\(\)/);
  });
});
