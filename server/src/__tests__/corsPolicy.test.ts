/**
 * CORS policy regression tests.
 *
 * The server in src/index.ts:86-97 allows:
 *   - no-origin requests (mobile apps, server-to-server, Postman)
 *   - http://localhost*, http://127.0.0.1*, exp:// (dev only — NODE_ENV !== 'production')
 *   - origins matching the ALLOWED_ORIGINS env list
 * Anything else triggers `callback(new Error('Not allowed by CORS'))`.
 *
 * These tests pin the contract so a future "let's just open CORS to *"
 * one-liner refactor doesn't silently expose every authenticated endpoint
 * to credential-bearing cross-site requests from any origin.
 *
 * Test surface: /health/live — no auth, no DB, just exits the middleware
 * chain. CORS happens at the middleware level, so the route is irrelevant.
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

// ─── No-Origin requests (mobile / server-to-server) ──────────────────────────

describe('CORS — no-Origin requests pass through', () => {
  test('GET without Origin header succeeds (mobile app, Postman, S2S)', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
    // Without Origin, cors() doesn't emit an Access-Control-Allow-Origin
    // header — but the request itself completes.
    expect(res.body.status).toBe('ok');
  });
});

// ─── Dev-only origins ────────────────────────────────────────────────────────

describe('CORS — dev-only origin allowlist (non-production)', () => {
  // NODE_ENV is 'test' in this run (set by jest), which means the
  // "not production" branch of the cors() callback fires for localhost / exp.
  test('Origin: http://localhost:3000 is allowed', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  test('Origin: http://localhost:8081 (Expo Metro default) is allowed', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'http://localhost:8081');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  test('Origin: http://127.0.0.1:3000 is allowed', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'http://127.0.0.1:3000');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
  });

  test('Origin: exp:// (Expo deep link) is allowed', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'exp://192.168.1.10:8081');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('exp://192.168.1.10:8081');
  });
});

// ─── Cross-origin requests from unknown sites ────────────────────────────────

describe('CORS — disallowed origins are rejected', () => {
  test('Origin: https://evil.attacker.com is rejected', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'https://evil.attacker.com');
    // The cors() callback invokes `callback(new Error('Not allowed by CORS'))`.
    // A dedicated error middleware (index.ts) turns that into a quiet 403 —
    // no Sentry/Telegram page — with no Access-Control-Allow-Origin header.
    // The key assertions: rejected status, and no ACAO echo for the foreign
    // origin (so the browser blocks the response regardless).
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('Origin: http://localhost-evil.attacker.com is rejected (substring trap)', async () => {
    // If anyone "simplifies" the localhost check to .includes('localhost'),
    // this attacker-controlled subdomain would slip through. The current
    // check uses .startsWith('http://localhost') which is safe.
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'http://localhost-evil.attacker.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('Origin: https://giron.app.evil.com is rejected (subdomain trap)', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'https://giron.app.evil.com');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// ─── Wildcard regression — must NEVER appear on credentialed responses ───────

describe('CORS — never echoes wildcard with credentials', () => {
  test('Access-Control-Allow-Origin is NEVER "*"', async () => {
    // cors({credentials:true}) + Access-Control-Allow-Origin: * is a known
    // CORS misconfiguration (browsers refuse credentialed wildcard, but
    // a server that emits it indicates a critical config regression).
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  test('credentials:true is reflected on allowed cross-origin response', async () => {
    const res = await request(app)
      .get('/health/live')
      .set('Origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
