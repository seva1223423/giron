/**
 * Tests for the trainer ↔ client invite flow (Product-01).
 *
 * Covers:
 *   POST /trainer/clients/:id/invite — trainer generates code
 *   POST /trainer/accept-invite       — client links their account
 *   DELETE /trainer/clients/:id/link  — trainer disconnects
 *
 * Non-obvious cases pinned here:
 *   - already-linked roster slot refuses re-invite (409 ALREADY_LINKED)
 *   - accepting a used code (409 INVITE_ALREADY_USED)
 *   - self-invite — a trainer cannot become their own client (400 SELF_INVITE)
 *   - composite-unique enforcement: one trainer cannot link same user twice
 *   - auth: any authenticated user (not just trainers) can accept an invite
 *   - IDOR: trainer-A cannot invite/disconnect trainer-B's client
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshToken: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    subscription: { findUnique: jest.fn().mockResolvedValue(null) },
    trainerClient: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    trainerSession: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';
import { prisma } from '../db';

const JWT_ISS = 'irongym-api';
const JWT_AUD = 'irongym-app';

const makeToken = (userId: string, role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

const trainerUser = { id: 'u-trainer', isBanned: false, lockedUntil: null, role: 'TRAINER' };
const clientUser = { id: 'u-client', isBanned: false, lockedUntil: null, role: 'USER' };

const CLIENT_ROW_ID = 'cclient00000000000000001';
const OTHER_TRAINER_ID = 'u-other-trainer';

beforeEach(() => {
  jest.clearAllMocks();
  // Default: caller is authenticated successfully as a trainer.
  (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }: any) => {
    if (where.id === 'u-trainer') return Promise.resolve(trainerUser);
    if (where.id === 'u-client') return Promise.resolve(clientUser);
    return Promise.resolve(null);
  });
});

// ── POST /trainer/clients/:id/invite ────────────────────────────────────────

describe('POST /trainer/clients/:id/invite', () => {
  test('trainer generates a 10-char alphanumeric code', async () => {
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      clientUserId: null,
    });
    // No collision on first try.
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.trainerClient.update as jest.Mock).mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/api/trainer/clients/${CLIENT_ROW_ID}/invite`)
      .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^[A-Z0-9]{10}$/);
    expect(prisma.trainerClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_ROW_ID },
        data: expect.objectContaining({
          inviteCode: res.body.code,
          invitedAt: expect.any(Date),
        }),
      }),
    );
  });

  test('refuses re-invite when client is already linked (409 ALREADY_LINKED)', async () => {
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      clientUserId: 'u-client', // already linked
    });

    const res = await request(app)
      .post(`/api/trainer/clients/${CLIENT_ROW_ID}/invite`)
      .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_LINKED');
    expect(prisma.trainerClient.update).not.toHaveBeenCalled();
  });

  test('404 when another trainer tries to invite for a roster slot they do not own (IDOR)', async () => {
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: OTHER_TRAINER_ID, // belongs to someone else
      clientUserId: null,
    });

    const res = await request(app)
      .post(`/api/trainer/clients/${CLIENT_ROW_ID}/invite`)
      .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`)
      .send({});

    expect(res.status).toBe(404);
  });

  test('400 for non-cuid client id (input validation)', async () => {
    const res = await request(app)
      .post('/api/trainer/clients/not-a-cuid/invite')
      .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('401 without auth token', async () => {
    const res = await request(app).post(`/api/trainer/clients/${CLIENT_ROW_ID}/invite`).send({});
    expect(res.status).toBe(401);
  });

  test('403 when caller is not a trainer', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(clientUser);
    const res = await request(app)
      .post(`/api/trainer/clients/${CLIENT_ROW_ID}/invite`)
      .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ── POST /trainer/accept-invite ─────────────────────────────────────────────

describe('POST /trainer/accept-invite', () => {
  const VALID_CODE = 'ABCDEF2345';

  test('regular user accepts valid code and gets linked', async () => {
    // Lookup by code returns unlinked row.
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      clientUserId: null,
      acceptedAt: null,
      name: 'Ivan Petrov',
    });
    // Composite-unique check: no existing link.
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.trainerClient.update as jest.Mock).mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      trainerClientId: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      displayName: 'Ivan Petrov',
    });
    expect(prisma.trainerClient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_ROW_ID },
        data: expect.objectContaining({
          clientUserId: 'u-client',
          acceptedAt: expect.any(Date),
        }),
      }),
    );
  });

  test('404 for unknown code (INVITE_NOT_FOUND)', async () => {
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('INVITE_NOT_FOUND');
  });

  test('409 for already-used code (INVITE_ALREADY_USED)', async () => {
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      clientUserId: 'u-someone-else',
      acceptedAt: new Date(),
      name: 'Ivan Petrov',
    });

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVITE_ALREADY_USED');
  });

  test('400 when trainer tries to accept their own code (SELF_INVITE)', async () => {
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      clientUserId: null,
      acceptedAt: null,
      name: 'Ivan Petrov',
    });

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_INVITE');
  });

  test('409 when user is already a client of this trainer (ALREADY_CLIENT)', async () => {
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      clientUserId: null,
      acceptedAt: null,
      name: 'Ivan Petrov',
    });
    // Composite-unique check: user is already linked to this trainer on another row.
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'other-row-id' });

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_CLIENT');
  });

  test('400 for malformed code (validation)', async () => {
    const cases = [
      { code: 'short' },            // too short
      { code: 'TOOLONGCODE12345' },  // too long
      { code: 'abcdef2345' },       // lowercase rejected
      { code: 'ABCDEF!@#$' },       // special chars
      { code: '' },                 // empty
      {},                           // missing field
    ];
    for (const body of cases) {
      const res = await request(app)
        .post('/api/trainer/accept-invite')
        .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`)
        .send(body);
      expect(res.status).toBe(400);
    }
  });

  test('401 without auth token', async () => {
    const res = await request(app).post('/api/trainer/accept-invite').send({ code: VALID_CODE });
    expect(res.status).toBe(401);
  });

  test('410 INVITE_EXPIRED when code older than 7 days', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      clientUserId: null,
      acceptedAt: null,
      name: 'Ivan Petrov',
      invitedAt: tenDaysAgo,
    });

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(410);
    expect(res.body.code).toBe('INVITE_EXPIRED');
  });

  test('accepts code generated just now (edge of TTL window)', async () => {
    // 6-day-old code should still work — TTL is 7 days exactly.
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      clientUserId: null,
      acceptedAt: null,
      name: 'Ivan Petrov',
      invitedAt: sixDaysAgo,
    });
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.trainerClient.update as jest.Mock).mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(200);
  });

  test('non-trainer users CAN accept (no trainer role required)', async () => {
    // The whole point: a regular user must be able to link themselves to a
    // trainer. The endpoint is auth'd but not gated on TRAINER role.
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce({
      id: CLIENT_ROW_ID,
      trainerId: 'u-trainer',
      clientUserId: null,
      acceptedAt: null,
      name: 'Ivan Petrov',
    });
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(null);
    (prisma.trainerClient.update as jest.Mock).mockResolvedValueOnce({});

    // Note: makeToken with role USER, not TRAINER.
    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(200);
  });
});

// ── DELETE /trainer/clients/:id/link ────────────────────────────────────────

describe('DELETE /trainer/clients/:id/link', () => {
  test('trainer disconnects a linked client', async () => {
    (prisma.trainerClient.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete(`/api/trainer/clients/${CLIENT_ROW_ID}/link`)
      .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(prisma.trainerClient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLIENT_ROW_ID, trainerId: 'u-trainer' },
        data: expect.objectContaining({
          clientUserId: null,
          acceptedAt: null,
          inviteCode: null,
          invitedAt: null,
        }),
      }),
    );
  });

  test('404 when client row does not belong to trainer (IDOR — updateMany returns 0)', async () => {
    (prisma.trainerClient.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete(`/api/trainer/clients/${CLIENT_ROW_ID}/link`)
      .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`);

    expect(res.status).toBe(404);
  });

  test('403 when caller is not a trainer', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValueOnce(clientUser);
    const res = await request(app)
      .delete(`/api/trainer/clients/${CLIENT_ROW_ID}/link`)
      .set('Authorization', `Bearer ${makeToken('u-client', 'USER')}`);
    expect(res.status).toBe(403);
  });

  test('400 for non-cuid id', async () => {
    const res = await request(app)
      .delete('/api/trainer/clients/not-a-cuid/link')
      .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`);
    expect(res.status).toBe(400);
  });
});

// ── Invite code quality ─────────────────────────────────────────────────────

describe('invite code properties', () => {
  test('generated codes avoid confusing glyphs (no I, O, 0, 1)', async () => {
    // Run the generator 100× through the endpoint and confirm every code
    // uses only the safe-subset alphabet. Cheap insurance against a future
    // refactor accidentally reintroducing a confusable char.
    (prisma.trainerClient.findUnique as jest.Mock).mockImplementation(({ where }: any) => {
      if (where.id === CLIENT_ROW_ID) {
        return Promise.resolve({ id: CLIENT_ROW_ID, trainerId: 'u-trainer', clientUserId: null });
      }
      return Promise.resolve(null); // no collisions
    });
    (prisma.trainerClient.update as jest.Mock).mockResolvedValue({});

    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const res = await request(app)
        .post(`/api/trainer/clients/${CLIENT_ROW_ID}/invite`)
        .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`)
        .send({});
      expect(res.status).toBe(200);
      const code = res.body.code as string;
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{6}[23456789]{4}$/);
      codes.add(code);
    }
    // 100 codes from a ~10^13 space — duplicates should be essentially
    // impossible. Loose bound: at least 95 unique out of 100.
    expect(codes.size).toBeGreaterThanOrEqual(95);
  });
});
