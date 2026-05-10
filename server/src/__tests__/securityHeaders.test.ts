/**
 * Regression test for HTTP security headers applied by helmet.
 *
 * The server mounts helmet() in src/index.ts with an explicit CSP:
 *   default-src 'none' / frame-ancestors 'none' / base-uri 'none' /
 *   form-action 'none'
 * Plus all the default helmet headers (X-Frame-Options, X-Content-Type-
 * Options, Strict-Transport-Security, Referrer-Policy, etc.).
 *
 * If anyone:
 *   - removes app.use(helmet({...})) from index.ts, or
 *   - relaxes the CSP to allow inline scripts / wildcards, or
 *   - upgrades helmet to a version whose defaults regress,
 * these assertions go red on the next CI run.
 *
 * The /health/live endpoint is the cheapest target — it never touches
 * the DB and doesn't need authentication, so it isolates the response
 * to ONLY the middleware chain.
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    refreshToken: { findMany: jest.fn().mockResolvedValue([]) },
    securityEvent: { create: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendOtpEmail: jest.fn(),
  sendNewLoginAlert: jest.fn(),
  sendPasswordChangedAlert: jest.fn().mockResolvedValue(undefined),
  sendEmailChangedAlert: jest.fn().mockResolvedValue(undefined),
  sendAccountDeletedAlert: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn(),
  normalizePhone: jest.fn((p: string) => p),
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/newsRefreshService', () => ({
  startNewsRefreshScheduler: jest.fn(),
}));

import request from 'supertest';
import app from '../index';

// ─── Helmet CSP — the explicit per-app config ────────────────────────────────

describe('HTTP security headers — CSP (explicit config in index.ts)', () => {
  test('Content-Security-Policy header is present', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  test('CSP locks default-src to none (no off-origin fetches by default)', async () => {
    const res = await request(app).get('/health/live');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).toMatch(/default-src\s+'none'/);
  });

  test('CSP locks frame-ancestors to none (clickjacking protection)', async () => {
    const res = await request(app).get('/health/live');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).toMatch(/frame-ancestors\s+'none'/);
  });

  test('CSP locks base-uri to none (anti base-tag injection)', async () => {
    const res = await request(app).get('/health/live');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).toMatch(/base-uri\s+'none'/);
  });

  test('CSP locks form-action to none (no off-origin form submits)', async () => {
    const res = await request(app).get('/health/live');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).toMatch(/form-action\s+'none'/);
  });

  test('CSP never allows unsafe-eval (anywhere)', async () => {
    const res = await request(app).get('/health/live');
    const csp = res.headers['content-security-policy'] || '';
    expect(csp).not.toMatch(/'unsafe-eval'/);
  });

  test('CSP script-src does NOT allow unsafe-inline (XSS hardening)', async () => {
    // helmet's default has `style-src 'unsafe-inline'` which is fine for an
    // API that never renders HTML — but `script-src 'unsafe-inline'` would
    // disable our main XSS protection. Pin that it's NOT in the script-src
    // directive specifically.
    const res = await request(app).get('/health/live');
    const csp = res.headers['content-security-policy'] || '';
    // Extract `script-src ...` segment up to next `;`
    const match = csp.match(/script-src[^;]*/);
    expect(match).not.toBeNull();
    expect(match![0]).not.toMatch(/'unsafe-inline'/);
  });
});

// ─── Helmet defaults — applied automatically ─────────────────────────────────

describe('HTTP security headers — helmet defaults', () => {
  test('X-Content-Type-Options: nosniff (block MIME sniffing)', async () => {
    const res = await request(app).get('/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('X-Frame-Options is set (defence-in-depth alongside CSP frame-ancestors)', async () => {
    const res = await request(app).get('/health/live');
    const val = res.headers['x-frame-options'];
    expect(val).toBeDefined();
    expect(val.toUpperCase()).toMatch(/^(DENY|SAMEORIGIN)$/);
  });

  test('Strict-Transport-Security is set (HSTS — force HTTPS)', async () => {
    const res = await request(app).get('/health/live');
    expect(res.headers['strict-transport-security']).toBeDefined();
    // helmet default: max-age=15552000 (180d), includeSubDomains
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });

  test('Referrer-Policy is set (control Referer leakage)', async () => {
    const res = await request(app).get('/health/live');
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  test('X-DNS-Prefetch-Control is off', async () => {
    const res = await request(app).get('/health/live');
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });
});

// ─── Information disclosure — server must not advertise its tech ─────────────

describe('HTTP security headers — info disclosure', () => {
  test('X-Powered-By is NOT present (helmet hides Express signature)', async () => {
    const res = await request(app).get('/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

// ─── Permissions-Policy / Cross-Origin-* — accepted defaults ─────────────────

describe('HTTP security headers — cross-origin & permissions', () => {
  test('Cross-Origin-Resource-Policy is set (helmet default same-origin)', async () => {
    const res = await request(app).get('/health/live');
    expect(res.headers['cross-origin-resource-policy']).toBeDefined();
  });
});
