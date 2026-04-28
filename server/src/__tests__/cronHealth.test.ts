/**
 * Unit tests for utils/cronHealth — verifies the in-memory ledger records
 * success / failure / duration correctly and isolates per-id state.
 */

import {
  trackCron,
  getCronHealth,
  _resetCronHealth,
} from '../utils/cronHealth';

beforeEach(() => {
  _resetCronHealth();
});

describe('trackCron', () => {
  test('records lastSuccessAt + duration on success', async () => {
    const result = await trackCron('test-job', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });

    expect(result).toBe(42);

    const records = getCronHealth();
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec.id).toBe('test-job');
    expect(rec.successCount).toBe(1);
    expect(rec.errorCount).toBe(0);
    expect(rec.lastSuccessAt).toBeTruthy();
    expect(rec.lastErrorAt).toBeNull();
    expect(rec.lastDurationMs).toBeGreaterThanOrEqual(0);
  });

  test('rethrows on failure and records lastErrorAt + message', async () => {
    await expect(
      trackCron('failing-job', async () => {
        throw new Error('SMTP down');
      }),
    ).rejects.toThrow('SMTP down');

    const records = getCronHealth();
    expect(records).toHaveLength(1);
    const rec = records[0];
    expect(rec.successCount).toBe(0);
    expect(rec.errorCount).toBe(1);
    expect(rec.lastErrorAt).toBeTruthy();
    expect(rec.lastErrorMessage).toBe('SMTP down');
    expect(rec.lastSuccessAt).toBeNull();
  });

  test('truncates very long error messages to 200 chars', async () => {
    const longMessage = 'x'.repeat(500);
    await expect(
      trackCron('long-error', async () => {
        throw new Error(longMessage);
      }),
    ).rejects.toThrow();

    const rec = getCronHealth().find((r) => r.id === 'long-error');
    expect(rec?.lastErrorMessage?.length).toBe(200);
  });

  test('isolates state per id', async () => {
    await trackCron('job-a', async () => {});
    await trackCron('job-b', async () => {});
    await trackCron('job-a', async () => {});

    const recs = getCronHealth();
    expect(recs).toHaveLength(2);
    const a = recs.find((r) => r.id === 'job-a');
    const b = recs.find((r) => r.id === 'job-b');
    expect(a?.successCount).toBe(2);
    expect(b?.successCount).toBe(1);
  });

  test('accumulates success and error counts independently', async () => {
    await trackCron('mixed', async () => {});
    await expect(trackCron('mixed', async () => { throw new Error('x'); })).rejects.toThrow();
    await trackCron('mixed', async () => {});

    const rec = getCronHealth().find((r) => r.id === 'mixed');
    expect(rec?.successCount).toBe(2);
    expect(rec?.errorCount).toBe(1);
  });

  test('returned snapshots are detached copies (mutation-safe)', async () => {
    await trackCron('snap', async () => {});
    const snap1 = getCronHealth();
    snap1[0].successCount = 999;
    const snap2 = getCronHealth();
    expect(snap2[0].successCount).toBe(1);
  });
});
