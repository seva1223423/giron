/**
 * Static-grep regression pins for the 2026-05-13 audit batch:
 *  - HIGH:   HealthRestriction interpolation now sanitized in two places
 *  - MEDIUM: update_memory schema includes `equipment` and `milestone`
 *  - MEDIUM: saveMemories sanitizes value AND key (not just slice)
 *
 * Static-source assertions instead of runtime tests because the
 * relevant `ai.ts` symbols are bundled inside a 85k-line module with
 * heavy transitive imports (prisma, Mistral SDK, knowledge DB, etc.).
 * A targeted runtime mock would be ~200 lines for what is a 1-line
 * regression risk per fix. Static-grep stays honest and fast.
 */

import * as fs from 'fs';
import * as path from 'path';

// AI module is now split: routes/ai.ts holds the route + infrastructure,
// ai/knowledgeHelpers.ts holds the extracted prose helpers. Concat both
// so static-grep regression pins keep working regardless of which file
// owns the code after the audit R-2026-05-22 split.
const AI_SRC = [
  fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'ai.ts'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '..', 'ai', 'knowledgeHelpers.ts'), 'utf8'),
].join('\n\n// ---- module boundary ----\n\n');

describe('HealthRestriction sanitize regression pins', () => {
  test('user-facts block sanitizes bodyPart + description', () => {
    // Pre-fix: ${h.bodyPart}: ${h.description} (...) — raw interpolation.
    // Post-fix: ${sanitizeForPrompt(h.bodyPart, 60)}: ${sanitizeForPrompt(h.description, 200)}.
    expect(AI_SRC).toMatch(
      /sanitizeForPrompt\(h\.bodyPart,\s*60\)[\s\S]*?sanitizeForPrompt\(h\.description,\s*200\)/,
    );
  });

  test('joint-warning block sanitizes restriction.bodyPart + description', () => {
    expect(AI_SRC).toMatch(
      /sanitizeForPrompt\(restriction\.bodyPart,\s*60\)[\s\S]*?sanitizeForPrompt\(restriction\.description,\s*200\)/,
    );
  });

  test('NO raw `h.bodyPart}:` or `restriction.bodyPart}:` in templates', () => {
    // These exact patterns are the pre-fix shape. They MUST NOT exist.
    expect(AI_SRC).not.toMatch(/\$\{h\.bodyPart\}: \$\{h\.description\}/);
    expect(AI_SRC).not.toMatch(/\$\{restriction\.bodyPart\}: \$\{restriction\.description\}/);
  });
});

describe('update_memory schema regression', () => {
  test('Zod enum includes all 9 documented categories', () => {
    const allCats = [
      'preference', 'habit', 'injury', 'allergy', 'schedule',
      'personality', 'goal', 'equipment', 'milestone',
    ];
    // Find the update_memory schema block and assert every category
    // appears inside the enum tuple. CLAUDE.md AI-system section lists
    // exactly these 9.
    const memBlock = AI_SRC.match(
      /toolName === 'update_memory'[\s\S]{0,2000}category:\s*z\.enum\(\[([^\]]+)\]/,
    );
    expect(memBlock).not.toBeNull();
    const enumBody = memBlock![1];
    for (const cat of allCats) {
      expect(enumBody).toContain(`'${cat}'`);
    }
  });
});

describe('Tool resultText sanitize regression — workout.name and program names', () => {
  test('modify_workout introduces safeWorkoutName before resultText uses', () => {
    expect(AI_SRC).toMatch(
      /const safeWorkoutName\s*=\s*sanitizeForPrompt\(workout\.name,\s*120\)/,
    );
  });

  test('no raw `${workout.name}` interpolation left in modify_workout block', () => {
    const block = AI_SRC.match(
      /toolName === 'modify_workout'[\s\S]{0,18000}toolName === 'set_weekly_plan'/,
    );
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/\$\{workout\.name\}/);
  });

  test('activate_program sanitizes match.name before resultText', () => {
    expect(AI_SRC).toMatch(
      /const safeMatchName\s*=\s*sanitizeForPrompt\(match\.name,\s*120\)/,
    );
  });

  test('delete_program sanitizes active.name before resultText', () => {
    expect(AI_SRC).toMatch(
      /const safeActiveName\s*=\s*sanitizeForPrompt\(active\.name,\s*120\)/,
    );
  });

  test('adjust_all_weights sanitizes the active program name', () => {
    expect(AI_SRC).toMatch(
      /const safeActiveProgName\s*=\s*sanitizeForPrompt\(active\.name,\s*120\)/,
    );
  });

  test('create_workout uses safeWorkoutName in resultText', () => {
    // create_workout is a separate path from modify_workout — has its own
    // const safeWorkoutName.
    expect(AI_SRC).toMatch(/Тренировка "\$\{safeWorkoutName\}" создана/);
  });
});

describe('saveMemories sanitize regression', () => {
  test('safeKey and safeValue use sanitizeForPrompt (not just slice)', () => {
    expect(AI_SRC).toMatch(
      /const safeKey\s*=\s*sanitizeForPrompt\(String\(mem\.key\),\s*100\)/,
    );
    expect(AI_SRC).toMatch(
      /const safeValue\s*=\s*sanitizeForPrompt\(String\(mem\.value\),\s*500\)/,
    );
  });

  test('the old plain-slice form is gone', () => {
    expect(AI_SRC).not.toMatch(/const safeKey\s*=\s*String\(mem\.key\)\.slice\(0,\s*100\)/);
    expect(AI_SRC).not.toMatch(/const safeValue\s*=\s*String\(mem\.value\)\.slice\(0,\s*500\)/);
  });
});
