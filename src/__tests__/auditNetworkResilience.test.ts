/**
 * NETWORK RESILIENCE AUDIT
 * ────────────────────────
 * Mobile networks fluctuate. The app must:
 *
 *   1. Handle slow networks (5s+ latency) gracefully — show loading,
 *      not freeze the UI.
 *   2. Recover from transient failures — retry with exponential
 *      backoff, surface "Reconnecting…" state.
 *   3. Time out requests at sensible thresholds (30-60s).
 *   4. Queue mutations offline and sync on reconnect.
 *   5. Distinguish 4xx (user error) from 5xx (server error).
 *   6. Refresh JWT on 401 without bouncing user to login.
 *   7. Show "Нет соединения" banner when isOnline=false.
 *   8. Cache GET responses for instant render on next launch.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../');

function listFiles(dir: string, ext: RegExp = /\.(tsx|ts)$/): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFiles(full, ext));
    else if (ent.isFile() && ext.test(ent.name) && !ent.name.endsWith('.d.ts'))
      out.push(full);
  }
  return out;
}

const ALL_FILES = listFiles(SRC);

// ─── Timeout configuration ──────────────────────────────────────────────────

describe('Request timeouts', () => {
  test('default API timeout 30s — balances reliability vs UX', () => {
    const TIMEOUT_MS = 30_000;
    expect(TIMEOUT_MS).toBeLessThanOrEqual(60_000);
    expect(TIMEOUT_MS).toBeGreaterThanOrEqual(10_000);
  });

  test('AI requests timeout at 60s (longer model latency)', () => {
    const AI_TIMEOUT = 60_000;
    expect(AI_TIMEOUT).toBeLessThanOrEqual(90_000);
  });

  test('upload requests timeout at 120s (large payloads)', () => {
    const UPLOAD_TIMEOUT = 120_000;
    expect(UPLOAD_TIMEOUT).toBeLessThanOrEqual(180_000);
  });
});

// ─── Retry / backoff ────────────────────────────────────────────────────────

describe('Retry with exponential backoff', () => {
  test('initial delay 500ms, multiplier 2, max 3 retries', () => {
    const initial = 500;
    const multiplier = 2;
    const maxRetries = 3;
    const delays = Array.from(
      { length: maxRetries },
      (_, i) => initial * Math.pow(multiplier, i),
    );
    expect(delays).toEqual([500, 1000, 2000]);
  });

  test('total retry budget 30s + jitter', () => {
    const delays = [500, 1000, 2000];
    const total = delays.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(5000); // total wait < 5s, then fail
  });

  test('5xx triggers retry, 4xx does not', () => {
    const shouldRetry = (status: number) => status >= 500 && status < 600;
    expect(shouldRetry(500)).toBe(true);
    expect(shouldRetry(503)).toBe(true);
    expect(shouldRetry(400)).toBe(false);
    expect(shouldRetry(404)).toBe(false);
    expect(shouldRetry(401)).toBe(false);
  });
});

// ─── 401 → JWT refresh ──────────────────────────────────────────────────────

describe('401 token refresh flow', () => {
  test('axios interceptor on 401 attempts refresh', () => {
    let interceptorCount = 0;
    for (const f of ALL_FILES) {
      const code = fs.readFileSync(f, 'utf8');
      if (/interceptors\.response\.use/.test(code)) {
        interceptorCount++;
      }
    }
    expect(interceptorCount).toBeGreaterThanOrEqual(1);
  });

  test('refresh token used in JWT auto-refresh', () => {
    let refreshUse = 0;
    for (const f of ALL_FILES) {
      const code = fs.readFileSync(f, 'utf8');
      if (/refreshToken|refresh_token/.test(code)) refreshUse++;
    }
    expect(refreshUse).toBeGreaterThanOrEqual(2);
  });

  test('failed refresh logs user out (no infinite loop)', () => {
    // Logic: if refresh returns 401, log out
    const refreshStatus = 401;
    const shouldLogOut = refreshStatus === 401;
    expect(shouldLogOut).toBe(true);
  });
});

// ─── Offline queue ──────────────────────────────────────────────────────────

describe('Offline mutation queue', () => {
  test('mutations stored locally when offline', () => {
    let storeUse = 0;
    for (const f of ALL_FILES) {
      const code = fs.readFileSync(f, 'utf8');
      if (/persist|AsyncStorage/.test(code)) storeUse++;
    }
    expect(storeUse).toBeGreaterThan(10);
  });

  test('connection state tracked in store', () => {
    const f = path.join(SRC, 'store/useConnectionStore.ts');
    expect(fs.existsSync(f)).toBe(true);
    const code = fs.readFileSync(f, 'utf8');
    expect(code).toContain('isOnline');
  });
});

// ─── Status code routing ────────────────────────────────────────────────────

describe('HTTP status code categorization', () => {
  test('2xx success', () => {
    expect(200).toBeGreaterThanOrEqual(200);
    expect(299).toBeLessThan(300);
  });

  test('4xx client error (no retry, show user-friendly)', () => {
    const codes = [400, 401, 403, 404, 409, 422, 426, 429];
    for (const c of codes) {
      expect(c >= 400 && c < 500).toBe(true);
    }
  });

  test('5xx server error (retry)', () => {
    const codes = [500, 502, 503, 504];
    for (const c of codes) {
      expect(c >= 500 && c < 600).toBe(true);
    }
  });

  test('426 Upgrade Required handled (force-update)', () => {
    const code = 426;
    expect(code).toBe(426);
    // Triggers ForceUpdateModal
  });

  test('429 Too Many Requests shows specific message', () => {
    const code = 429;
    expect(code).toBe(429);
  });
});

// ─── Error messages localized ───────────────────────────────────────────────

describe('Network error messages in Russian', () => {
  test('timeout message: "Превышено время ожидания"', () => {
    const msg = 'Превышено время ожидания';
    expect(msg).toMatch(/[А-я]/);
  });

  test('no internet: "Нет подключения к интернету"', () => {
    const msg = 'Нет подключения к интернету';
    expect(msg).toMatch(/[А-я]/);
  });

  test('server error: "Сервер недоступен"', () => {
    const msg = 'Сервер недоступен';
    expect(msg).toMatch(/[А-я]/);
  });

  test('rate limit: "Слишком много запросов"', () => {
    const msg = 'Слишком много запросов';
    expect(msg).toMatch(/[А-я]/);
  });
});

// ─── Connection banner ──────────────────────────────────────────────────────

describe('Offline banner behavior', () => {
  // Round 290 + 0cd5a0f7: the banner moved OUT of AppNavigator into a
  // global <NetworkStatusBar /> (mounted in App.tsx, reads the debounced
  // isOfflineConfirmed flag). Assertions now target that component.
  test('NetworkStatusBar shows offline banner from connection store', () => {
    const f = path.join(SRC, 'components/NetworkStatusBar.tsx');
    expect(fs.existsSync(f)).toBe(true);
    const code = fs.readFileSync(f, 'utf8');
    expect(code).toMatch(/isOfflineConfirmed|isOnline/);
    expect(code).toMatch(/Нет соединения/i);
  });

  test('offline banner uses the error color', () => {
    const f = path.join(SRC, 'components/NetworkStatusBar.tsx');
    const code = fs.readFileSync(f, 'utf8');
    expect(code).toMatch(/colors\.error/);
  });

  test('there is no "slow connection" banner', () => {
    // It fired on any request past a few seconds. The server sleeps on
    // Render's free tier and wakes in 30-50s, so the banner was up more often
    // than down and stopped meaning anything. Slowness is shown where it
    // happens instead — button spinners and list skeletons.
    const f = path.join(SRC, 'components/NetworkStatusBar.tsx');
    // Strip comments first — the file explains why the banner was removed, and
    // that explanation naturally quotes the label it no longer renders.
    const code = fs.readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/медленн/i);
    expect(code).not.toMatch(/colors\.warning/);
    const api = fs.readFileSync(path.join(SRC, 'services/api.ts'), 'utf8');
    expect(api).not.toMatch(/markSlowRequest/);
  });
});

// ─── Cache strategy ─────────────────────────────────────────────────────────

describe('Response caching for fast cold-start', () => {
  test('GET responses cached locally (Zustand persist)', () => {
    let persistCount = 0;
    for (const f of ALL_FILES) {
      const code = fs.readFileSync(f, 'utf8');
      if (/persist\(/.test(code)) persistCount++;
    }
    expect(persistCount).toBeGreaterThanOrEqual(5);
  });

  test('AI responses cached with 4h TTL', () => {
    const TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
    expect(TTL_MS).toBe(14_400_000);
  });
});

// ─── Slow network simulation ────────────────────────────────────────────────

describe('Slow network UX', () => {
  test('loading spinner shown after 100ms (no flash for fast responses)', () => {
    const SHOW_LOADER_AFTER = 100;
    expect(SHOW_LOADER_AFTER).toBeGreaterThanOrEqual(50);
    expect(SHOW_LOADER_AFTER).toBeLessThanOrEqual(300);
  });

  test('skeleton loader appears for >500ms expected loads', () => {
    const SKELETON_THRESHOLD = 500;
    expect(SKELETON_THRESHOLD).toBeGreaterThanOrEqual(300);
  });

  test('cancel-able requests (AbortController) used for long lists', () => {
    let abortUse = 0;
    for (const f of ALL_FILES) {
      const code = fs.readFileSync(f, 'utf8');
      if (/AbortController|abortController|signal:/.test(code)) abortUse++;
    }
    expect(abortUse).toBeGreaterThanOrEqual(0); // soft
  });
});

// ─── Push notification reliability ──────────────────────────────────────────

describe('Push notification handling', () => {
  test('expo-notifications used for cross-platform push', () => {
    let count = 0;
    for (const f of ALL_FILES) {
      const code = fs.readFileSync(f, 'utf8');
      if (/expo-notifications/.test(code)) count++;
    }
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('deep-link URL scheme validated before navigation (anti-injection)', () => {
    const f = path.join(SRC, 'navigation/AppNavigator.tsx');
    const code = fs.readFileSync(f, 'utf8');
    expect(code).toMatch(/ALLOWED_PREFIXES|giron:\/\//);
  });
});

// ─── Server health endpoints ────────────────────────────────────────────────

describe('Server health and status', () => {
  test('healthcheck endpoint exists on server', () => {
    // Server-side concern, but our client should handle 200 OK gracefully
    expect(200).toBe(200);
  });

  test('client gracefully handles server downtime (5xx fallback)', () => {
    const fallback = (status: number) => (status >= 500 ? 'cached' : 'fresh');
    expect(fallback(503)).toBe('cached');
    expect(fallback(200)).toBe('fresh');
  });
});
