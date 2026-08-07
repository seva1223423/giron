/**
 * Every tool must be in the prompt's "which tool for what" guide.
 *
 * Tool definitions reach the model through the API, so a tool missing from the
 * guide can still be called — it just never gets recommended. Ten of them had
 * drifted out, including the three that make the coach usable mid-workout:
 * start_workout, log_active_set, finish_workout. The model had them available
 * and no instruction to reach for them.
 *
 * The reverse failure happened too. `generate_warmup` was described as
 * "информация о разминочных подходах" long after it stopped being an info tool
 * and started adding real sets, so the model would have used it to talk rather
 * than to act.
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: { user: { findUnique: jest.fn() }, aIMemory: { findMany: jest.fn().mockResolvedValue([]) } },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, '../routes/ai.ts'), 'utf8');

/** Tool names as the surface test pins them — the one list that cannot drift silently. */
const toolNames = (() => {
  const surface = fs.readFileSync(path.join(__dirname, 'aiToolsSurface.test.ts'), 'utf8');
  const block = surface.match(/const EXPECTED_TOOL_NAMES[\s\S]*?\n\];/)?.[0] ?? '';
  return [...block.matchAll(/^ {2}'([a-z_]+)'/gm)].map((m) => m[1]);
})();

/** Names the prompt documents as `- **name** — что делает`. */
const documented = new Set([...source.matchAll(/- \*\*([a-z_]+)\*\*/g)].map((m) => m[1]));

describe('system prompt tool guide', () => {
  test('the tool list itself was found', () => {
    // Guards against the regex silently matching nothing and the suite passing
    // for the wrong reason.
    expect(toolNames.length).toBeGreaterThan(40);
  });

  test('every tool is documented in the guide', () => {
    const missing = toolNames.filter((n) => !documented.has(n));
    expect(missing).toEqual([]);
  });

  test('the mid-workout tools are documented, since they are the newest', () => {
    for (const name of ['start_workout', 'log_active_set', 'finish_workout']) {
      expect(documented.has(name)).toBe(true);
    }
  });

  test('generate_warmup is described as an action, not as information', () => {
    const line = source.split('\n').find((l) => l.includes('- **generate_warmup**')) ?? '';
    expect(line).toMatch(/ДОБАВИТЬ|добавить/);
    expect(line).not.toMatch(/^.*информация о разминочных подходах$/);
  });

  test('log_active_set is distinguished from log_completed_workout', () => {
    // These two are the easiest pair to confuse: one writes into the running
    // session, the other creates a whole backdated workout.
    const line = source.split('\n').find((l) => l.includes('- **log_active_set**')) ?? '';
    expect(line).toContain('log_completed_workout');
  });
});
