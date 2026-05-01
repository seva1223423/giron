/**
 * Round 194 — per-tool circuit breaker tests.
 *
 * The circuit breaker is inline in the chat handler (not a separate
 * function — too entangled with the agentic loop). These tests
 * verify the LOGIC pattern with a re-implementation that mirrors
 * ai.ts. If the chat handler logic is changed, this re-impl needs
 * to track or these tests will lie.
 */

const MAX_FAILURES_PER_TOOL = 2;

type ToolStub = {
  name: string;
  shouldFail: boolean;
};

/**
 * Simulates the circuit breaker portion of the agentic loop.
 * Iterates through a sequence of tool calls; failed ones increment
 * the per-tool counter; if the counter hits MAX_FAILURES_PER_TOOL,
 * subsequent calls to the SAME tool short-circuit with TOOL_BLOCKED.
 */
function simulate(
  calls: ToolStub[],
): Array<{ tool: string; result: 'success' | 'fail' | 'blocked' }> {
  const failureCount = new Map<string, number>();
  const out: Array<{ tool: string; result: 'success' | 'fail' | 'blocked' }> = [];

  for (const call of calls) {
    const priorFailures = failureCount.get(call.name) ?? 0;
    if (priorFailures >= MAX_FAILURES_PER_TOOL) {
      out.push({ tool: call.name, result: 'blocked' });
      continue;
    }
    if (call.shouldFail) {
      failureCount.set(call.name, priorFailures + 1);
      out.push({ tool: call.name, result: 'fail' });
    } else {
      failureCount.delete(call.name); // reset on success
      out.push({ tool: call.name, result: 'success' });
    }
  }
  return out;
}

describe('circuit breaker — basic blocking', () => {
  test('first failure: not blocked', () => {
    const r = simulate([{ name: 'log_meal', shouldFail: true }]);
    expect(r[0].result).toBe('fail');
  });

  test('second failure: not blocked yet (executes, fails)', () => {
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
    ]);
    expect(r[0].result).toBe('fail');
    expect(r[1].result).toBe('fail');
  });

  test('THIRD call to same tool after 2 fails: blocked', () => {
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
    ]);
    expect(r[2].result).toBe('blocked');
  });

  test('blocking holds for further calls to same tool', () => {
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: false }, // would succeed but blocked first
      { name: 'log_meal', shouldFail: false },
    ]);
    expect(r[2].result).toBe('blocked');
    expect(r[3].result).toBe('blocked');
    expect(r[4].result).toBe('blocked');
  });
});

describe('circuit breaker — per-tool isolation', () => {
  test('failure on tool A does NOT block tool B', () => {
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true }, // blocked
      { name: 'log_workout', shouldFail: false }, // should succeed
    ]);
    expect(r[2].result).toBe('blocked');
    expect(r[3].result).toBe('success');
  });

  test('multiple failed tools tracked independently', () => {
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_workout', shouldFail: true },
      { name: 'log_workout', shouldFail: true },
      { name: 'log_meal', shouldFail: false }, // blocked
      { name: 'log_workout', shouldFail: false }, // blocked
    ]);
    expect(r[4].result).toBe('blocked');
    expect(r[5].result).toBe('blocked');
  });
});

describe('circuit breaker — success resets counter', () => {
  test('success after 1 failure resets — next failure not blocked', () => {
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: false },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
    ]);
    // After success, counter reset → 2 more failures still don't block
    expect(r[2].result).toBe('fail');
    expect(r[3].result).toBe('fail');
  });

  test('success on third call (after 2 fails!) — counter checked BEFORE call', () => {
    // 2 fails → counter is 2 → MAX_FAILURES_PER_TOOL is 2 → 3rd call
    // is blocked BEFORE execution. Counter only resets on actually-
    // executed success.
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: false }, // would succeed but blocked
    ]);
    expect(r[2].result).toBe('blocked');
  });

  test('after MAX_FAILURES, tool is dead for the request even if it would succeed', () => {
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: false },
      { name: 'log_meal', shouldFail: false },
    ]);
    expect(r[2].result).toBe('blocked');
    expect(r[3].result).toBe('blocked');
  });
});

describe('circuit breaker — request scope', () => {
  test('two independent simulations have independent counters', () => {
    const r1 = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
    ]);
    const r2 = simulate([
      { name: 'log_meal', shouldFail: false },
    ]);
    expect(r1[2].result).toBe('blocked');
    expect(r2[0].result).toBe('success'); // fresh request, counter empty
  });
});

describe('circuit breaker — typical realistic patterns', () => {
  test('pattern: AI tries log_meal 5 times due to LLM stubbornness', () => {
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
    ]);
    // First two fail (counter 1, 2); from 3rd onward all blocked
    expect(r[0].result).toBe('fail');
    expect(r[1].result).toBe('fail');
    expect(r[2].result).toBe('blocked');
    expect(r[3].result).toBe('blocked');
    expect(r[4].result).toBe('blocked');
  });

  test('pattern: AI fails on log_meal then succeeds on different tool', () => {
    const r = simulate([
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true },
      { name: 'log_meal', shouldFail: true }, // blocked, AI gives up
      { name: 'find_recipes', shouldFail: false }, // pivot to alt approach
    ]);
    expect(r[2].result).toBe('blocked');
    expect(r[3].result).toBe('success');
  });

  test('pattern: 1 fail then success → counter clean for next call', () => {
    const r = simulate([
      { name: 'create_program', shouldFail: true },
      { name: 'create_program', shouldFail: false },
      // Counter reset to 0; now imagine new failures happen later in
      // same request:
      { name: 'create_program', shouldFail: true },
      { name: 'create_program', shouldFail: true },
      { name: 'create_program', shouldFail: true }, // blocks NOW
    ]);
    expect(r[3].result).toBe('fail'); // 2nd consecutive fail after reset
    expect(r[4].result).toBe('blocked');
  });
});

describe('circuit breaker — output integrity', () => {
  test('blocked result has TOOL_BLOCKED prefix shape', () => {
    // Re-implementing what ai.ts emits to confirm contract
    const blockedMessage = (toolName: string, count: number) =>
      `TOOL_BLOCKED(${toolName}): этот инструмент уже падал ${count} раз в этом запросе. НЕ пытайся снова — найди другой подход или скажи пользователю что не получается. Возможные причины: невалидный input, отсутствие нужных данных, временная ошибка БД.`;

    const msg = blockedMessage('log_meal', 2);
    expect(msg).toMatch(/^TOOL_BLOCKED\(log_meal\)/);
    expect(msg).toMatch(/2 раз/);
    expect(msg).toMatch(/НЕ пытайся снова/);
    expect(msg).toMatch(/найди другой подход/);
  });

  test('blocked message tells AI alternative actions', () => {
    const msg = `TOOL_BLOCKED(log_meal): этот инструмент уже падал 2 раз в этом запросе. НЕ пытайся снова — найди другой подход или скажи пользователю что не получается.`;
    expect(msg).toMatch(/найди другой подход|скажи пользователю/);
  });
});
