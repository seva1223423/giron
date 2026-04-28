/**
 * Cron health tracker — lightweight in-memory ledger of when each cron
 * job last ran, how long it took, and how many times it failed. Exposed
 * via GET /admin/cron-health so the founder can verify
 * retention/digest/keep-warm crons are actually firing on Render without
 * grepping logs.
 *
 * Why in-memory: the data resets on dyno restart, which is fine — Render
 * restarts at most every few hours, the founder mostly checks once a
 * session, and persisting cron-tick state to Postgres would add a write
 * to every tick for no functional gain. If a question like "how many
 * pushes did we send last week" comes up, the AdminLog table is the
 * proper source — this module is for liveness only.
 *
 * Usage:
 *   await trackCron('retention', async () => { ...workload... })
 * or imperatively:
 *   markCronStart('retention'); try { ... } finally { markCronEnd('retention') }
 */

interface CronRecord {
  /** Stable id, e.g. 'retention', 'weekly-summary', 'admin-digest' */
  id: string;
  /** ISO timestamp of the last successful completion */
  lastSuccessAt: string | null;
  /** ISO timestamp of the last failure */
  lastErrorAt: string | null;
  /** Last error message (truncated to 200 chars) */
  lastErrorMessage: string | null;
  /** Duration in ms of the most recent run */
  lastDurationMs: number | null;
  /** Total successful runs since boot */
  successCount: number;
  /** Total failed runs since boot */
  errorCount: number;
  /** ISO timestamp this record was first registered (proxy for boot time) */
  registeredAt: string;
}

const records: Map<string, CronRecord> = new Map();

/** Internal: get-or-create the record. */
function getOrCreate(id: string): CronRecord {
  let rec = records.get(id);
  if (!rec) {
    rec = {
      id,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastDurationMs: null,
      successCount: 0,
      errorCount: 0,
      registeredAt: new Date().toISOString(),
    };
    records.set(id, rec);
  }
  return rec;
}

/** Wraps an async cron workload, recording timing + outcome automatically. */
export async function trackCron<T>(
  id: string,
  fn: () => Promise<T>,
): Promise<T> {
  const rec = getOrCreate(id);
  const startedAt = Date.now();
  try {
    const result = await fn();
    rec.lastSuccessAt = new Date().toISOString();
    rec.lastDurationMs = Date.now() - startedAt;
    rec.successCount += 1;
    return result;
  } catch (err) {
    rec.lastErrorAt = new Date().toISOString();
    rec.lastErrorMessage = String((err as Error)?.message ?? err).slice(0, 200);
    rec.lastDurationMs = Date.now() - startedAt;
    rec.errorCount += 1;
    throw err;
  }
}

/** Returns a snapshot of all registered cron records. */
export function getCronHealth(): CronRecord[] {
  return Array.from(records.values()).map((r) => ({ ...r }));
}

/** Test helper — wipes the registry between cases. */
export function _resetCronHealth(): void {
  records.clear();
}
