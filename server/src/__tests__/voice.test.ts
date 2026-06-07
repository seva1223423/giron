/**
 * Integration tests for POST /api/ai/voice — Yandex SpeechKit STT route.
 *
 * Covers the input-validation guard rails (size/format), Yandex error
 * passthrough, and happy-path flow. The audio converter and Yandex
 * client are fully mocked — the goal is to pin the route's contract
 * (status codes, body shape, code constants), not the integrations.
 */

// Step 1: rate-limit passthrough
jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

// Step 2: prisma mock — auth middleware reads user; /voice subscription
// gate reads subscription.
jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    subscription: { findUnique: jest.fn() },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../utils/errorReporter', () => ({
  reportError: jest.fn(),
  initSentry: jest.fn(),
  setUser: jest.fn(),
  clearUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  // index.ts mounts this as middleware; return a no-op handler.
  sentryErrorHandler: () => (_err: any, _req: any, _res: any, next: any) => next(_err),
}));

// Mock the heavy lifters so we don't spawn ffmpeg or hit Yandex.
const mockYandexTranscribe = jest.fn();
jest.mock('../services/yandexSpeechKit', () => ({
  yandexTranscribe: (...args: any[]) => mockYandexTranscribe(...args),
}));

const mockToLpcm16k = jest.fn();
jest.mock('../services/audioConverter', () => ({
  toLpcm16k: (...args: any[]) => mockToLpcm16k(...args),
}));

// External services not touched by /voice but loaded transitively.
jest.mock('../services/emailService', () => ({
  sendPasswordResetEmail: jest.fn(),
  sendOtpEmail: jest.fn(),
  sendNewLoginAlert: jest.fn(),
  sendPasswordChangedAlert: jest.fn(),
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
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';

const JWT_ISS = 'giron-api';
const JWT_AUD = 'giron-app';

const makeToken = (userId = 'u-voice-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

const mockUser = {
  id: 'u-voice-test',
  email: 'voice@test.com',
  role: 'USER',
  banned: false,
  isBanned: false,
  lockedUntil: null,
  passwordChangedAt: null,
};

const mockAdminUser = {
  id: 'u-voice-admin',
  email: 'admin@test.com',
  role: 'ADMIN',
  banned: false,
  isBanned: false,
  lockedUntil: null,
  passwordChangedAt: null,
};

// 1.4 MB base64 string — over the 2.5 MB cap by being trimmed/padded
// in tests; here just enough to be valid base64 (length > 100). The
// route decodes b64 → buffer; mockToLpcm16k receives the buffer.
const VALID_BASE64 = 'A'.repeat(2000); // 1500 bytes decoded — passes audio.min(100) AND buf.length > 1000.

beforeEach(() => {
  // mockReset (not clearAllMocks) — also drops queued mockResolvedValueOnce
  // entries that would otherwise bleed between tests. The admin-bypass
  // test queues a value that's never consumed (admin path skips the
  // lookup); without a reset, the next test pulls that stale value
  // instead of its own beforeEach default.
  (prisma.user.findUnique as jest.Mock).mockReset();
  (prisma.subscription.findUnique as jest.Mock).mockReset();
  mockToLpcm16k.mockReset();
  mockYandexTranscribe.mockReset();

  // Resolve user by the id supplied in the where clause so the admin
  // test can use a separate userId without polluting the regular test's
  // authUserCache entry.
  (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: any) => {
    if (where?.id === mockAdminUser.id) return Promise.resolve(mockAdminUser);
    return Promise.resolve(mockUser);
  });
  // Default subscription: active 'pro' — happy path satisfies the
  // /voice subscription gate. Tests that need free-user behaviour
  // override via mockResolvedValueOnce(null).
  (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
    plan: 'pro',
    status: 'active',
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  // Default conversion returns a non-trivial PCM buffer.
  mockToLpcm16k.mockResolvedValue(Buffer.alloc(2000));
  // Default Yandex returns a happy result.
  mockYandexTranscribe.mockResolvedValue({ ok: true, text: 'привет' });
});

describe('POST /api/ai/voice — authentication', () => {
  it('401 without token', async () => {
    const res = await request(app).post('/api/ai/voice').send({ audio: VALID_BASE64 });
    expect(res.status).toBe(401);
    expect(mockYandexTranscribe).not.toHaveBeenCalled();
    expect(mockToLpcm16k).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/voice — subscription gate', () => {
  it('402 VOICE_REQUIRES_PRO for free user (no subscription row)', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64 });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('VOICE_REQUIRES_PRO');
    expect(mockToLpcm16k).not.toHaveBeenCalled();
    expect(mockYandexTranscribe).not.toHaveBeenCalled();
  });

  it('402 for user with expired subscription', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      plan: 'pro',
      status: 'active',
      endDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
    });
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64 });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('VOICE_REQUIRES_PRO');
  });

  it('402 for free-plan user', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      plan: 'free',
      status: 'active',
      endDate: null,
    });
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64 });
    expect(res.status).toBe(402);
  });

  it('200 for ADMIN even without subscription — founder bypass', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken(mockAdminUser.id, 'ADMIN')}`)
      .send({ audio: VALID_BASE64 });
    expect(res.status).toBe(200);
    // Admin path doesn't query subscription at all — guard the bypass
    // by asserting we skipped the lookup (mock not called).
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('200 for active "trainer" plan', async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      plan: 'trainer',
      status: 'active',
      endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64 });
    expect(res.status).toBe(200);
  });

  it('200 for "cancelled" status if endDate is in the future (grace period)', async () => {
    // Cancelled subs keep access until the period they paid for ends —
    // matches the trainer.ts pattern.
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValueOnce({
      plan: 'pro',
      status: 'cancelled',
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64 });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/ai/voice — input validation', () => {
  it('400 when audio field is missing', async () => {
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});
    expect(res.status).toBe(400);
    expect(mockYandexTranscribe).not.toHaveBeenCalled();
  });

  it('400 when audio is too short (< 100 chars base64)', async () => {
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: 'AAA' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too short/i);
    expect(mockToLpcm16k).not.toHaveBeenCalled();
  });

  it('400 when decoded buffer is < 1000 bytes', async () => {
    // 200 chars of base64 = ~150 bytes binary, passes the b64-length
    // schema check but fails the post-decode size check.
    const tinyAudio = 'A'.repeat(200);
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: tinyAudio });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/коротк/i); // "слишком короткая"
    expect(mockToLpcm16k).not.toHaveBeenCalled();
  });

  it('400 when PCM output is < 1000 bytes (silent recording)', async () => {
    mockToLpcm16k.mockResolvedValueOnce(Buffer.alloc(500));
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/тих/i); // "тихая запись"
    expect(mockYandexTranscribe).not.toHaveBeenCalled();
  });
});

describe('POST /api/ai/voice — Yandex passthrough', () => {
  it('200 happy path returns transcribed text', async () => {
    mockYandexTranscribe.mockResolvedValueOnce({ ok: true, text: 'три подхода по десять' });
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64, mimeType: 'audio/m4a' });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('три подхода по десять');
    expect(mockToLpcm16k).toHaveBeenCalledTimes(1);
    expect(mockYandexTranscribe).toHaveBeenCalledTimes(1);
  });

  it('200 with empty text for genuine silence', async () => {
    // Yandex returns ok:true but empty text — client decides whether to
    // surface "ничего не распознал" UX.
    mockYandexTranscribe.mockResolvedValueOnce({ ok: true, text: '' });
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64 });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe('');
  });

  it('502 with STT_FAILED code on Yandex non-auth failure', async () => {
    mockYandexTranscribe.mockResolvedValueOnce({
      ok: false,
      status: 500,
      error: 'Yandex internal',
    });
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64 });
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('STT_FAILED');
    expect(res.body.error).toMatch(/yandex/i);
  });

  it('503 (not 401) when our Yandex API key is bad — hides server config from client', async () => {
    mockYandexTranscribe.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: 'Invalid API key',
    });
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: VALID_BASE64 });
    // 503 specifically — never expose 401 to the caller because that
    // would tell an attacker our backend's Yandex key is invalid.
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('STT_FAILED');
  });
});

describe('POST /api/ai/voice — input stripping', () => {
  it('strips data URL prefix before base64-decoding', async () => {
    const dataUrl = `data:audio/m4a;base64,${VALID_BASE64}`;
    const res = await request(app)
      .post('/api/ai/voice')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ audio: dataUrl });
    expect(res.status).toBe(200);
    // Verify the buffer handed to toLpcm16k matches the stripped form
    // (Buffer.from('AAAA...', 'base64') of just the payload).
    const handed = (mockToLpcm16k.mock.calls[0]?.[0] as Buffer);
    expect(handed).toBeInstanceOf(Buffer);
    expect(handed.length).toBeGreaterThan(1000);
  });
});
