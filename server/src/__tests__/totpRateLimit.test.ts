/**
 * Regression pin for the TOTP brute-force rate limiter.
 *
 * The 2FA code is a 6-digit number — 10^6 = 1,000,000 possible codes.
 * Without rate limiting an attacker with the user's primary password
 * could brute-force a TOTP in minutes. The mitigation is 5 attempts
 * per 5-minute window per IP, with a structured 429 + code
 * 'TOTP_RATE_LIMIT' so the client can show a friendly message.
 *
 * Static-grep style: the test reads server/src/index.ts as text and
 * asserts the rate-limit config + mount points. Why static instead of
 * a real burst-into-supertest test:
 *   - auth.test.ts mocks `express-rate-limit` to a no-op for normal
 *     testing, so a runtime burst test would need its own module setup
 *     (test pollution risk).
 *   - This file documents the contract — windowMs, max, code — in a
 *     single place a reviewer can scan. If anyone changes the values,
 *     this test forces an explicit update.
 */

import * as fs from 'fs';
import * as path from 'path';

const INDEX_SRC = fs.readFileSync(
  path.resolve(__dirname, '..', 'index.ts'),
  'utf8',
);

// ─── Rate limiter config ─────────────────────────────────────────────────────

describe('TOTP rate limiter — config pin', () => {
  test('totpRateLimiter is defined with windowMs=5min and max=5', () => {
    // Extract the totpRateLimiter block: `const totpRateLimiter = rateLimit({...});`
    const block = INDEX_SRC.match(/const\s+totpRateLimiter\s*=\s*rateLimit\(\{([\s\S]*?)\}\)/);
    expect(block).not.toBeNull();
    const body = block![1];

    // windowMs MUST be 5*60*1000 (5 minutes). If anyone bumps to 60s
    // ("hey it's annoying users") or drops to 24h ("permanent lockout
    // forever") this test catches it.
    expect(body).toMatch(/windowMs\s*:\s*5\s*\*\s*60\s*\*\s*1000/);

    // max MUST be 5. A reviewer wanting a different threshold has to
    // update this pin too — forces the security tradeoff to surface.
    expect(body).toMatch(/max\s*:\s*5\b/);
  });

  test('totpRateLimiter responds with structured TOTP_RATE_LIMIT code', () => {
    const block = INDEX_SRC.match(/const\s+totpRateLimiter\s*=\s*rateLimit\(\{([\s\S]*?)\}\)/);
    expect(block).not.toBeNull();
    // The client uses res.body.code === 'TOTP_RATE_LIMIT' to show the
    // "Подождите 5 минут" toast instead of the generic 429 message.
    expect(block![1]).toMatch(/code\s*:\s*['"]TOTP_RATE_LIMIT['"]/);
  });
});

// ─── Mount points ────────────────────────────────────────────────────────────

describe('TOTP rate limiter — applied to all 2FA endpoints', () => {
  test('mounted on /api/auth/totp-verify (the 2FA login step)', () => {
    // app.use('/api/auth/totp-verify', totpRateLimiter);
    expect(INDEX_SRC).toMatch(
      /app\.use\(\s*['"]\/api\/auth\/totp-verify['"]\s*,\s*totpRateLimiter\s*\)/,
    );
  });

  test('mounted on /api/user/2fa (TOTP enable/disable + code verify under user scope)', () => {
    // app.use('/api/user/2fa', totpRateLimiter);
    expect(INDEX_SRC).toMatch(
      /app\.use\(\s*['"]\/api\/user\/2fa['"]\s*,\s*totpRateLimiter\s*\)/,
    );
  });

  test('mounted on /api/user/account (DELETE — step-up reauth)', () => {
    // Audit 2026-05-13: DELETE /user/account accepts password + TOTP for
    // step-up reauth. Without per-endpoint limit, the generic 200/min
    // userRateLimiter would let an attacker brute-force the
    // WRONG_PASSWORD / INVALID_TOTP responses at ~200 attempts/min.
    expect(INDEX_SRC).toMatch(
      /app\.use\(\s*['"]\/api\/user\/account['"]\s*,\s*totpRateLimiter\s*\)/,
    );
  });

  test('mounted on /api/user/change-email (step-up reauth)', () => {
    expect(INDEX_SRC).toMatch(
      /app\.use\(\s*['"]\/api\/user\/change-email['"]\s*,\s*totpRateLimiter\s*\)/,
    );
  });

  test('mounted on /api/user/change-phone (step-up reauth)', () => {
    expect(INDEX_SRC).toMatch(
      /app\.use\(\s*['"]\/api\/user\/change-phone['"]\s*,\s*totpRateLimiter\s*\)/,
    );
  });

  test('mounted on /api/user/change-password (step-up reauth)', () => {
    // Audit 2026-05-29 (HIGH): /change-password accepts currentPassword as
    // step-up. Without this limiter, a stolen access token could brute-force
    // the password at ~200/min via the generic userRateLimiter → takeover.
    expect(INDEX_SRC).toMatch(
      /app\.use\(\s*['"]\/api\/user\/change-password['"]\s*,\s*totpRateLimiter\s*\)/,
    );
  });

  test('mounted on /api/user/linked-accounts (step-up reauth on link/unlink)', () => {
    // Audit 2026-05-29 (HIGH): POST/DELETE /linked-accounts/:provider accept
    // currentPassword/TOTP step-up — same brute-force surface as change-password.
    expect(INDEX_SRC).toMatch(
      /app\.use\(\s*['"]\/api\/user\/linked-accounts['"]\s*,\s*totpRateLimiter\s*\)/,
    );
  });

  test('NOT mounted only on /api/auth — would let /login/register bypass', () => {
    // Defensive: ensure the prefix isn't accidentally /api/auth (which
    // would apply the strict 5/5min limit to login + register too,
    // breaking onboarding).
    expect(INDEX_SRC).not.toMatch(
      /app\.use\(\s*['"]\/api\/auth['"]\s*,\s*totpRateLimiter\s*\)/,
    );
  });
});

// ─── Rate-limit family — totp must be the STRICTEST ──────────────────────────

describe('TOTP rate limiter — must be stricter than auth/user rate limiters', () => {
  function extractMax(name: string): number {
    const block = INDEX_SRC.match(
      new RegExp(`const\\s+${name}\\s*=\\s*rateLimit\\(\\{([\\s\\S]*?)\\}\\)`),
    );
    if (!block) throw new Error(`${name} not found in index.ts`);
    const maxMatch = block[1].match(/max\s*:\s*(\d+)/);
    if (!maxMatch) throw new Error(`${name} has no numeric max`);
    return parseInt(maxMatch[1], 10);
  }

  test('totpRateLimiter.max (5) < authRateLimiter.max', () => {
    expect(extractMax('totpRateLimiter')).toBeLessThan(extractMax('authRateLimiter'));
  });

  test('totpRateLimiter.max (5) < userRateLimiter.max', () => {
    expect(extractMax('totpRateLimiter')).toBeLessThan(extractMax('userRateLimiter'));
  });
});
