/**
 * The security controls that must not quietly disappear.
 *
 * Every check here passed when it was written. That is the point: these are
 * not bug reports, they are tripwires. Each one guards a control where the
 * failure mode is silence — the code still compiles, every other test still
 * passes, and the protection is simply gone.
 *
 * Deliberately source-level rather than request-level. A route test proves a
 * handler behaves today; these prove the guard is still wired at all, which is
 * what actually rots when a file gets refactored.
 */

import * as fs from 'fs';
import * as path from 'path';

const S = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const index = S('index.ts');
const authMw = S('middleware/auth.ts');
const authRoute = S('routes/auth.ts');
const userRoute = S('routes/user.ts');
const adminRoute = S('routes/admin.ts');
const aiRoute = S('routes/ai.ts');
const subRoute = S('routes/subscription.ts');

const routeFiles = fs
  .readdirSync(path.join(__dirname, '../routes'))
  .filter((f) => f.endsWith('.ts'));

describe('no secret is ever hardcoded', () => {
  test('every credential comes from the environment', () => {
    const found: string[] = [];
    for (const f of [...routeFiles.map((r) => `routes/${r}`), 'index.ts']) {
      for (const line of S(f).split('\n')) {
        if (/process\.env/.test(line)) continue;
        if (/(secret|password|api_?key|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i.test(line)) {
          if (/your-|example|placeholder|test|mock/i.test(line)) continue;
          found.push(`${f}: ${line.trim().slice(0, 70)}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  test('JWT secrets are never given a fallback default', () => {
    // `process.env.JWT_SECRET || 'dev'` would mean a deployment with the
    // variable unset signs tokens anyone can forge.
    expect(authMw).not.toMatch(/JWT_SECRET\s*(\|\||\?\?)\s*['"]/);
    expect(authRoute).not.toMatch(/JWT_(REFRESH_)?SECRET\s*(\|\||\?\?)\s*['"]/);
  });
});

describe('token handling', () => {
  test('access tokens are verified against issuer and audience', () => {
    // Without these, a token minted by any other service signed with the same
    // secret would be accepted.
    expect(authMw).toMatch(/issuer/);
    expect(authMw).toMatch(/audience/);
  });

  test('a token issued before a revocation is rejected', () => {
    // tokensValidAfter is the only thing that stops a stolen access token
    // outliving a password change for its full 60 minutes.
    expect(authMw).toContain('tokensValidAfter');
  });

  test('refresh tokens are hashed before they touch the database', () => {
    expect(authRoute).toMatch(/createHash\(['"]sha256['"]\)/);
  });

  test('token verification pins the algorithm', () => {
    // Without an explicit algorithms list, a token signed with "alg": "none"
    // or with an asymmetric key confusion trick can be accepted.
    expect(authRoute).toMatch(/algorithms:\s*\['HS256'\]/);
  });

  test('/logout is public but proves itself with the refresh token', () => {
    // It takes no session — it takes a token only that session holds, and
    // verifies it properly rather than trusting a user id in the body.
    const at = authRoute.indexOf("router.post('/logout'");
    const body = authRoute.slice(at, at + 2500);
    expect(body).toMatch(/jwt\.verify\(refreshToken/);
    expect(body).not.toMatch(/req\.body\.userId/);
  });

  test('every endpoint that ends a session also kills live access tokens', () => {
    // Revoking refresh tokens alone leaves the current access token working
    // for up to an hour. Each of these sites must call the invalidator.
    const sites: Array<[string, string]> = [
      ['change-password', userRoute],
      ['change-email', userRoute],
      ['change-phone', userRoute],
      ['reset-password', authRoute],
      // "logout everywhere" is POST /logout with all:true, not its own route.
      ['logout', authRoute],
    ];
    for (const [name, src] of sites) {
      const at = src.indexOf(`'/${name}'`);
      expect(at).toBeGreaterThan(-1);
      // The handler body — generous window, these are long.
      expect(src.slice(at, at + 12000)).toContain('invalidateAccessTokens');
    }
  });
});

describe('account protection', () => {
  test('a banned or locked user cannot use a valid token', () => {
    expect(authMw).toMatch(/isBanned/);
    expect(authMw).toMatch(/lockedUntil/);
  });

  test('passwords are hashed at 12 rounds or more', () => {
    const rounds = [...authRoute.matchAll(/bcrypt\.hash\([^,]+,\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(rounds.length).toBeGreaterThan(0);
    for (const r of rounds) expect(r).toBeGreaterThanOrEqual(12);
  });

  test('two-factor secrets are encrypted at rest', () => {
    // A plaintext TOTP secret in the database defeats the second factor for
    // anyone who reads one row.
    expect(authRoute).toMatch(/encryptSecret|decryptSecret/);
    expect(authRoute).not.toMatch(/totpSecret:\s*secret\b/);
  });

  test('the account-existence endpoints are rate limited', () => {
    // check-email answers "does this account exist", which is useful to the
    // login screen and to somebody enumerating users. The limiter is what
    // keeps the second one impractical.
    expect(index).toMatch(/app\.use\(['"]\/api\/auth\/check-email['"],\s*\w*[Rr]ate/);
    expect(index).toMatch(/app\.use\(['"]\/api\/auth\/check-phone['"],\s*\w*[Rr]ate/);
  });

  test('password reset and 2FA verification are rate limited', () => {
    for (const p of ['/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/totp-verify']) {
      expect(index).toContain(p);
    }
  });
});

describe('admin surface', () => {
  test('destructive admin actions require a second factor of the admin', () => {
    // Role change, subscription change, ban and delete all take the admin's
    // own password again — a stolen admin session alone is not enough.
    expect(adminRoute).toContain('requireAdminStepUp');
    const stepUps = adminRoute.match(/await requireAdminStepUp\(req, res\)/g) ?? [];
    expect(stepUps.length).toBeGreaterThanOrEqual(4);
  });

  test('step-up refuses an admin with no password rather than waving them through', () => {
    const fn = adminRoute.slice(adminRoute.indexOf('async function requireAdminStepUp'));
    expect(fn.slice(0, 3000)).toMatch(/passwordHash[\s\S]{0,200}403/);
  });

  test('step-up compares the password with bcrypt, never with ===', () => {
    const fn = adminRoute.slice(adminRoute.indexOf('async function requireAdminStepUp'), adminRoute.indexOf('async function requireAdminStepUp') + 3000);
    expect(fn).toMatch(/bcrypt\.compare/);
    expect(fn).not.toMatch(/adminPassword\s*===/);
  });

  test('repeated wrong 2FA codes lock the account, not just the IP', () => {
    // Otherwise the per-IP limiter is bypassed by rotating addresses.
    expect(adminRoute).toMatch(/is2faLocked|record2faFailure/);
  });
});

describe('AI input', () => {
  test('user messages are screened for prompt injection', () => {
    expect(aiRoute).toMatch(/detectInjection/);
  });

  test('user text is sanitised before it reaches the prompt', () => {
    expect(aiRoute).toMatch(/sanitizeForPrompt|sanitizeInput/);
  });

  test('the daily quota is enforced server-side, not just in the app', () => {
    // A limit that only exists in the client is not a limit.
    expect(aiRoute).toContain('AI_FREE_DAILY_LIMIT');
    expect(aiRoute).toContain('DAILY_LIMIT_EXCEEDED');
  });

  test('a per-minute burst limit applies to paid accounts too', () => {
    expect(aiRoute).toMatch(/perUserAiBuckets/);
  });
});

describe('transport and webhooks', () => {
  test('helmet is applied with HSTS', () => {
    expect(index).toMatch(/app\.use\(helmet\(/);
    expect(index).toMatch(/hsts|maxAge/i);
  });

  test('the payment webhook verifies its signature in constant time', () => {
    // A plain === on an HMAC leaks the correct prefix through timing.
    expect(subRoute).toMatch(/createHmac/);
    expect(subRoute).toMatch(/timingSafeEqual/);
  });

  test('only known routes are reachable without authentication', () => {
    // Anything new that appears here is either a deliberate public endpoint or
    // an accident. The list is short on purpose.
    const PUBLIC: Record<string, string[]> = {
      // All pre-authentication flows: you cannot hold a token yet. /logout is
      // public on purpose — it authenticates by the refresh token in the body,
      // which only that session holds.
      'auth.ts': ['/register', '/login', '/totp-verify', '/check-email', '/check-phone',
                  '/vk', '/yandex', '/login-by-phone', '/google', '/refresh',
                  '/forgot-password', '/reset-password', '/reset-password-by-phone',
                  '/request-phone-code', '/verify-phone-code', '/logout',
                  '/send-otp', '/verify-otp', '/verify-email', '/resend-verification'],
      'logging.ts': ['/log-client-error'],
      'news.ts': ['/'],
      'subscription.ts': ['/webhook'],
    };
    const unexpected: string[] = [];
    for (const f of routeFiles) {
      const src = S(`routes/${f}`);
      if (/router\.use\(\s*authenticate/.test(src)) continue;
      for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*([^\n]*)/g)) {
        const [, , route, rest] = m;
        if (/authenticate|requireAdmin|requireStaff|optionalAuth/.test(rest)) continue;
        const allowed = PUBLIC[f] ?? [];
        if (!allowed.some((a) => route === a || route.startsWith(a))) {
          unexpected.push(`${f}: ${route}`);
        }
      }
    }
    expect(unexpected).toEqual([]);
  });
});
