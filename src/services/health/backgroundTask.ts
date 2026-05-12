/**
 * Background health sync — TaskManager + expo-background-fetch wrapper.
 *
 * Registered once at app boot from App.tsx. The OS wakes us roughly
 * every 12-24h (the actual cadence is decided by the OS based on
 * battery / app usage patterns; we ask for 12h as the minimum).
 *
 * The task is a thin wrapper around `healthSyncService.syncNow()` —
 * the orchestrator already knows how to no-op when permissions are
 * absent and how to dedupe via the server's `skipDuplicates`.
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { healthSyncService } from './healthSyncService';

export const HEALTH_SYNC_TASK = 'health-sync-daily';

TaskManager.defineTask(HEALTH_SYNC_TASK, async () => {
  try {
    const result = await healthSyncService.syncNow();
    if (!result.ok) return BackgroundFetch.BackgroundFetchResult.Failed;
    const total = result.ingested.cardio + result.ingested.sleep + result.ingested.samples;
    return total > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Idempotent registration — safe to call on every app boot. The OS
 * silently ignores duplicate registrations of the same task name.
 */
export async function registerHealthBackgroundTask(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    // Status enum: Restricted (1) / Denied (2) / Available (3). Skip
    // registration when the OS won't run us anyway.
    if (status !== BackgroundFetch.BackgroundFetchStatus.Available) return;
    await BackgroundFetch.registerTaskAsync(HEALTH_SYNC_TASK, {
      minimumInterval: 12 * 60 * 60, // 12h, OS may schedule less often
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Background fetch is best-effort: foreground pulls still work.
  }
}
