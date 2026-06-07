/**
 * AI Round 1 — per-tool execution timeout helper.
 *
 * `withToolTimeout(promise, ms, toolName)` rejects with an Error whose
 * message contains "timed out" if `promise` doesn't settle within `ms`.
 * That message is what classifyToolError matches via /timeout|timed out/
 * to route the failure to the "transient, retry in a moment" branch.
 *
 * The contract these tests pin:
 *   1. Resolves passthrough when the inner promise resolves first.
 *   2. Rejects with timeout error when the inner promise hangs past `ms`.
 *   3. Forwards the inner rejection (not a timeout) when inner rejects first.
 *   4. The timeout error message contains the tool name and "timed out"
 *      so classifyToolError + log greps both find it.
 */

import { withToolTimeout, classifyToolError } from '../routes/ai';

describe('withToolTimeout', () => {
  test('resolves passthrough when inner settles before timeout', async () => {
    const result = await withToolTimeout(Promise.resolve(42), 100, 'log_meal');
    expect(result).toBe(42);
  });

  test('rejects with timeout error when inner hangs past ms', async () => {
    // Inner promise never resolves — would hang forever without the timeout.
    const hung = new Promise(() => { /* intentionally never settles */ });
    await expect(withToolTimeout(hung, 50, 'log_meal'))
      .rejects.toThrow(/timed out after 50ms/);
  });

  test('forwards the inner rejection when inner rejects first', async () => {
    const failed = Promise.reject(new Error('Database is down'));
    await expect(withToolTimeout(failed, 1000, 'log_meal'))
      .rejects.toThrow('Database is down');
  });

  test('timeout error message includes the tool name', async () => {
    const hung = new Promise(() => {});
    try {
      await withToolTimeout(hung, 30, 'create_workout');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toContain('create_workout');
      expect((e as Error).message).toContain('timed out');
    }
  });

  test('timeout error routes through classifyToolError as transient', async () => {
    // The whole point of the "timed out" wording: classifyToolError's
    // generic-error branch picks it up via /timeout|timed out/i regex
    // and tells the AI it's transient — same path as ECONNRESET etc.
    const hung = new Promise(() => {});
    let caught: unknown;
    try {
      await withToolTimeout(hung, 20, 'log_water');
    } catch (e) {
      caught = e;
    }
    const classified = classifyToolError('log_water', caught);
    expect(classified).toMatch(/transient/);
    expect(classified).toMatch(/log_water/);
  });
});
