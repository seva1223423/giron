/**
 * Over-The-Air (OTA) update bootstrap (OTA-01).
 *
 * Wraps `expo-updates` so the rest of the app can trigger an "is there a
 * new bundle?" check on launch / on resume from background, and apply it
 * with a single function call. Designed to be no-op friendly:
 *   - In Expo Go (where Updates.isEnabled === false), every function is a
 *     graceful no-op.
 *   - On builds that don't bundle expo-updates (e.g. pre-OTA APKs that
 *     reach this code via OTA itself — chicken/egg), the dynamic require
 *     fails silently and the rest of the app keeps working.
 *
 * Update flow:
 *   1. App.tsx calls `checkAndApplyUpdate({ silent: true })` on mount.
 *   2. If a new bundle is available we download it in background (cached
 *      to disk by expo-updates).
 *   3. On the *next* app start the new bundle loads automatically.
 *      We deliberately don't reload mid-session — context-aware screens
 *      (mid-workout, AI chat with unsaved input) would lose state.
 *   4. `applyDownloadedNow()` is exposed for the rare "user explicitly
 *      tapped Update Now" flow and reloads immediately.
 *
 * Channel selection happens at build time via eas.json (channel:
 * "production" / "preview" / "development"). The runtime never picks the
 * channel — that's a build artefact.
 */

import { addBreadcrumb, reportError } from '../utils/errorReporter';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UpdatesModule = any;

let updates: UpdatesModule | null = null;
let probed = false;

/** Lazy-load expo-updates so this module is safe to import in Expo Go and
 *  in test environments where the native module isn't linked. */
function tryLoadUpdates(): UpdatesModule | null {
  if (probed) return updates;
  probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    updates = require('expo-updates');
    return updates;
  } catch {
    // Module not available — Expo Go, tests, or pre-bundled APK. No-op
    // path lets the rest of the app keep functioning.
    return null;
  }
}

interface CheckOptions {
  /** When true, suppresses any UI-facing logging — used for the silent
   *  on-launch check. False for explicit user-triggered "Check now"
   *  taps so we can surface failures. */
  silent?: boolean;
}

interface CheckResult {
  /** false in dev / Expo Go / when expo-updates not bundled. */
  enabled: boolean;
  /** true if a new bundle was found and downloaded into the cache. The app
   *  will pick it up on the next launch (or via applyDownloadedNow). */
  downloaded: boolean;
  /** Human-readable status for the optional "Check for updates" settings
   *  screen — never auto-displayed. */
  message: string;
}

/**
 * Check the EAS Update server for a newer bundle on the build's channel.
 * Downloads it into the cache when available. Idempotent — multiple
 * concurrent calls coalesce inside expo-updates internals.
 */
export async function checkAndApplyUpdate(
  opts: CheckOptions = {},
): Promise<CheckResult> {
  const u = tryLoadUpdates();
  if (!u || !u.isEnabled) {
    return { enabled: false, downloaded: false, message: 'OTA disabled (dev / Expo Go)' };
  }

  try {
    addBreadcrumb('ota:check-start', undefined, 'info');
    const check = await u.checkForUpdateAsync();
    if (!check.isAvailable) {
      addBreadcrumb('ota:no-update', undefined, 'info');
      return { enabled: true, downloaded: false, message: 'Уже последняя версия' };
    }

    addBreadcrumb('ota:downloading', { manifestId: check.manifest?.id }, 'info');
    await u.fetchUpdateAsync();
    addBreadcrumb('ota:downloaded', undefined, 'info');

    return {
      enabled: true,
      downloaded: true,
      message: 'Обновление загружено — применится при следующем запуске',
    };
  } catch (err) {
    if (!opts.silent) {
      reportError(err, { tags: { origin: 'ota-check' } });
    }
    return {
      enabled: true,
      downloaded: false,
      message: `Не удалось проверить обновления: ${(err as Error).message}`,
    };
  }
}

/**
 * Force-reload the JS bundle right now. Use only after a user-initiated
 * "Apply update" tap — never silently mid-session, as it discards the
 * current screen state (active workout, chat input, etc.).
 */
export async function applyDownloadedNow(): Promise<void> {
  const u = tryLoadUpdates();
  if (!u || !u.isEnabled) return;
  try {
    await u.reloadAsync();
  } catch (err) {
    reportError(err, { tags: { origin: 'ota-reload' } });
  }
}

/**
 * The runtime version baked into this binary — used by the server-side
 * version gate to decide whether the client is too old to talk to the
 * current API. Returns the value of `runtimeVersion` from the manifest,
 * or '0.0.0' in dev (where the version gate should never reject).
 */
export function getRuntimeVersion(): string {
  const u = tryLoadUpdates();
  if (!u) return '0.0.0';
  // expo-updates exposes the runtime version as a top-level constant when
  // the build was produced with EAS. Fall back to the manifest field
  // for older Expo SDK versions.
  return (u.runtimeVersion as string) ?? (u.manifest?.runtimeVersion as string) ?? '0.0.0';
}
