/**
 * Integration tests for server/src/routes/trainer.ts
 *
 * Covers: GET/POST/PATCH/DELETE /clients — auth gating, trainer-role
 * enforcement, input validation, and IDOR protection via trainerId filter.
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
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
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

const makeToken = (userId = 'u-trainer', role = 'TRAINER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

// Trainer user — role TRAINER bypasses subscription check via fast-path
const trainerUser = { id: 'u-trainer', isBanned: false, lockedUntil: null, role: 'TRAINER' };
// Regular user — will get 403 on trainer routes
const regularUser = { id: 'u-regular', isBanned: false, lockedUntil: null, role: 'USER' };

const CLIENT_ID = 'cclient00000000000000001';
const SESSION_ID = 'csession0000000000000001';

const sampleClient = {
  id: CLIENT_ID,
  trainerId: 'u-trainer',
  name: 'Ivan Petrov',
  phone: '+79001234567',
  age: 28,
  goal: 'Похудение',
  level: 'Начинающий',
  notes: null,
  totalWorkouts: 5,
  lastVisit: '2026-04-20',
  createdAt: new Date().toISOString(),
};

const sampleSession = {
  id: SESSION_ID,
  clientId: CLIENT_ID,
  date: '2026-04-22',
  name: 'Жим лёжа',
  durationMinutes: 60,
  volumeKg: 3000,
  notes: null,
  client: { trainerId: 'u-trainer' },
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(trainerUser);
});

// ─── GET /api/trainer/clients ─────────────────────────────────────────────────

describe('GET /api/trainer/clients', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/trainer/clients');
    expect(res.status).toBe(401);
  });

  it('403 for regular USER (no trainer role, no trainer subscription)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);

    expect(res.status).toBe(403);
  });

  it('200 for TRAINER role user', async () => {
    (prisma.trainerClient.findMany as jest.Mock).mockResolvedValueOnce([sampleClient]);

    const res = await request(app)
      .get('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Ivan Petrov');
  });

  it('200 via trainer subscription (not TRAINER role, but active trainer plan)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: 'trainer',
      status: 'active',
      endDate: new Date(Date.now() + 86_400_000), // valid
    });
    (prisma.trainerClient.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`);

    expect(res.status).toBe(200);
  });

  it('SECURITY: findMany filters by req.userId (trainerId)', async () => {
    (prisma.trainerClient.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`);

    const calls = (prisma.trainerClient.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.trainerId).toBe('u-trainer');
  });
});

// ─── POST /api/trainer/clients ────────────────────────────────────────────────

describe('POST /api/trainer/clients', () => {
  const validPayload = { name: 'Anna Ivanova', age: 30, goal: 'Набор массы', level: 'Средний' };

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/trainer/clients')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it('403 for non-trainer user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send(validPayload);

    expect(res.status).toBe(403);
  });

  it('400 when name is empty', async () => {
    const res = await request(app)
      .post('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: '', age: 25 });

    expect(res.status).toBe(400);
  });

  it('201 creates client with trainerId from JWT', async () => {
    (prisma.trainerClient.create as jest.Mock).mockResolvedValueOnce(sampleClient);

    const res = await request(app)
      .post('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(CLIENT_ID);
  });

  it('SECURITY: create uses req.userId as trainerId, not body-supplied trainerId', async () => {
    (prisma.trainerClient.create as jest.Mock).mockResolvedValueOnce(sampleClient);

    await request(app)
      .post('/api/trainer/clients')
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`)
      .send({ ...validPayload, trainerId: 'u-victim-trainer' }); // must be ignored

    const createCalls = (prisma.trainerClient.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
    expect(createCalls[0][0].data.trainerId).toBe('u-trainer');
    expect(createCalls[0][0].data.trainerId).not.toBe('u-victim-trainer');
  });
});

// ─── DELETE /api/trainer/clients/:id ─────────────────────────────────────────

describe('DELETE /api/trainer/clients/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).delete(`/api/trainer/clients/${CLIENT_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .delete('/api/trainer/clients/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when client not found or belongs to different trainer', async () => {
    (prisma.trainerClient.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .delete(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('200 deletes client and returns success', async () => {
    (prisma.trainerClient.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .delete(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('SECURITY: deleteMany includes trainerId filter — IDOR protection', async () => {
    (prisma.trainerClient.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    await request(app)
      .delete(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`);

    const calls = (prisma.trainerClient.deleteMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.trainerId).toBe('u-trainer');
    expect(calls[0][0].where.id).toBe(CLIENT_ID);
  });
});

// ─── PATCH /api/trainer/clients/:id ──────────────────────────────────────────

describe('PATCH /api/trainer/clients/:id', () => {
  const updatedClient = { ...sampleClient, name: 'Ivan Updated', goal: 'Набор массы' };

  it('401 without token', async () => {
    const res = await request(app).patch(`/api/trainer/clients/${CLIENT_ID}`).send({ name: 'X' });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .patch('/api/trainer/clients/not-a-cuid')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'X' });
    expect(res.status).toBe(400);
  });

  it('400 when lastVisit format is invalid', async () => {
    const res = await request(app)
      .patch(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ lastVisit: '22-04-2026' }); // wrong format
    expect(res.status).toBe(400);
  });

  it('404 when client not found or belongs to different trainer', async () => {
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => {
      const tx = {
        trainerClient: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findUnique: jest.fn(),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .patch(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });

  it('200 returns updated client data', async () => {
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => {
      const tx = {
        trainerClient: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue(updatedClient),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .patch(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Ivan Updated', goal: 'Набор массы' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ivan Updated');
  });

  it('SECURITY: updateMany scopes by trainerId — IDOR protection', async () => {
    let capturedWhere: any = null;
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => {
      const tx = {
        trainerClient: {
          updateMany: jest.fn().mockImplementation(({ where }: any) => {
            capturedWhere = where;
            return Promise.resolve({ count: 1 });
          }),
          findUnique: jest.fn().mockResolvedValue(updatedClient),
        },
      };
      return fn(tx);
    });

    await request(app)
      .patch(`/api/trainer/clients/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`)
      .send({ name: 'Test' });

    expect(capturedWhere.trainerId).toBe('u-trainer');
    expect(capturedWhere.id).toBe(CLIENT_ID);
  });
});

// ─── GET /api/trainer/sessions/:clientId ─────────────────────────────────────

describe('GET /api/trainer/sessions/:clientId', () => {
  it('401 without token', async () => {
    const res = await request(app).get(`/api/trainer/sessions/${CLIENT_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when clientId is not a valid CUID', async () => {
    const res = await request(app)
      .get('/api/trainer/sessions/bad-cuid')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when client does not belong to this trainer', async () => {
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/trainer/sessions/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('200 returns sessions for owned client', async () => {
    const { client: _client, ...sessionWithoutClient } = sampleSession;
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(sampleClient);
    (prisma.trainerSession.findMany as jest.Mock).mockResolvedValueOnce([sessionWithoutClient]);

    const res = await request(app)
      .get(`/api/trainer/sessions/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(SESSION_ID);
  });

  it('SECURITY: findFirst filters by trainerId before returning sessions', async () => {
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(sampleClient);
    (prisma.trainerSession.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get(`/api/trainer/sessions/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`);

    const findFirstCalls = (prisma.trainerClient.findFirst as jest.Mock).mock.calls;
    expect(findFirstCalls[0][0].where.trainerId).toBe('u-trainer');
    expect(findFirstCalls[0][0].where.id).toBe(CLIENT_ID);
  });
});

// ─── POST /api/trainer/sessions/:clientId ────────────────────────────────────

describe('POST /api/trainer/sessions/:clientId', () => {
  const validSession = {
    date: '2026-04-22',
    name: 'Жим лёжа',
    durationMinutes: 60,
    volumeKg: 3000,
  };

  it('401 without token', async () => {
    const res = await request(app)
      .post(`/api/trainer/sessions/${CLIENT_ID}`)
      .send(validSession);
    expect(res.status).toBe(401);
  });

  it('400 when clientId is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/trainer/sessions/bad-cuid')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validSession);
    expect(res.status).toBe(400);
  });

  it('404 when client does not belong to this trainer', async () => {
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/trainer/sessions/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validSession);
    expect(res.status).toBe(404);
  });

  it('400 when required session fields are missing', async () => {
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(sampleClient);

    const res = await request(app)
      .post(`/api/trainer/sessions/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Missing date and duration' });
    expect(res.status).toBe(400);
  });

  it('201 creates session and increments totalWorkouts', async () => {
    const { client: _c, ...sessionRow } = sampleSession;
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(sampleClient);
    (prisma.trainerSession.create as jest.Mock).mockResolvedValueOnce(sessionRow);
    (prisma.trainerClient.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    (prisma.$transaction as jest.Mock).mockResolvedValueOnce([sessionRow, { count: 1 }]);

    const res = await request(app)
      .post(`/api/trainer/sessions/${CLIENT_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validSession);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(SESSION_ID);
  });
});

// ─── DELETE /api/trainer/sessions/:id ────────────────────────────────────────

describe('DELETE /api/trainer/sessions/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).delete(`/api/trainer/sessions/${SESSION_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when session id is not a valid CUID', async () => {
    const res = await request(app)
      .delete('/api/trainer/sessions/not-a-cuid')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when session does not exist', async () => {
    (prisma.trainerSession.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .delete(`/api/trainer/sessions/${SESSION_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });

  it('404 when session belongs to a different trainer', async () => {
    (prisma.trainerSession.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleSession,
      client: { trainerId: 'u-other-trainer' }, // not this trainer
    });

    const res = await request(app)
      .delete(`/api/trainer/sessions/${SESSION_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`);
    expect(res.status).toBe(404);
  });

  it('200 deletes session and recalculates totalWorkouts atomically', async () => {
    (prisma.trainerSession.findUnique as jest.Mock).mockResolvedValueOnce(sampleSession);
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => {
      const tx = {
        trainerSession: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          count: jest.fn().mockResolvedValue(4),
        },
        trainerClient: {
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    const res = await request(app)
      .delete(`/api/trainer/sessions/${SESSION_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('SECURITY: session ownership verified before delete via client.trainerId', async () => {
    (prisma.trainerSession.findUnique as jest.Mock).mockResolvedValueOnce(sampleSession);
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) => {
      const tx = {
        trainerSession: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          count: jest.fn().mockResolvedValue(4),
        },
        trainerClient: { update: jest.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    });

    await request(app)
      .delete(`/api/trainer/sessions/${SESSION_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-trainer')}`);

    const calls = (prisma.trainerSession.findUnique as jest.Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // Route uses findUnique with include client.trainerId — verifies ownership before deleting
    expect(calls[0][0].include.client.select.trainerId).toBe(true);
  });
});

// ─── POST /api/trainer/accept-invite ──────────────────────────────────────────
//
// Security-critical: an invite code accepts ONE client per code, links it to
// the calling user, and grants the trainer access to the client's data. Bugs
// here could silently un-link a legitimate client (TOCTOU race), accept an
// expired code, or let a trainer become their own client.

describe('POST /api/trainer/accept-invite', () => {
  const VALID_CODE = 'ABC1234567';
  const TRAINER_CLIENT_ID = 'cinvite00000000000000001';

  const makeInvitedClient = (overrides: Record<string, unknown> = {}) => ({
    id: TRAINER_CLIENT_ID,
    trainerId: 'u-other-trainer',
    clientUserId: null,
    acceptedAt: null,
    name: 'Pending Client',
    invitedAt: new Date(),
    ...overrides,
  });

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .send({ code: VALID_CODE });
    expect(res.status).toBe(401);
  });

  it('400 when code is malformed (too short)', async () => {
    // Auth middleware needs to pass — return regularUser
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send({ code: 'TOO_SHORT' });
    expect(res.status).toBe(400);
  });

  it('400 when code contains lowercase letters', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send({ code: 'abc1234567' });
    expect(res.status).toBe(400);
  });

  it('404 when code is not found in DB', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send({ code: VALID_CODE });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('INVITE_NOT_FOUND');
  });

  it('409 when invite has already been accepted', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce(
      makeInvitedClient({ acceptedAt: new Date(), clientUserId: 'u-someone-else' }),
    );

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send({ code: VALID_CODE });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVITE_ALREADY_USED');
  });

  it('410 when invite is expired (>7 days old)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce(
      makeInvitedClient({ invitedAt: eightDaysAgo }),
    );

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send({ code: VALID_CODE });
    expect(res.status).toBe(410);
    expect(res.body.code).toBe('INVITE_EXPIRED');
  });

  it('400 SELF_INVITE — trainer cannot become their own client', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(trainerUser);
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce(
      makeInvitedClient({ trainerId: 'u-trainer' }), // matches the JWT subject
    );

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-trainer', 'TRAINER')}`)
      .send({ code: VALID_CODE });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SELF_INVITE');
  });

  it('409 ALREADY_CLIENT — user already linked to this trainer via different invite', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce(makeInvitedClient());
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce({ id: 'existing-link' });

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send({ code: VALID_CODE });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_CLIENT');
  });

  it('200 success — atomic updateMany consumes the code', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce(makeInvitedClient());
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(null); // no existing link
    (prisma.trainerClient.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send({ code: VALID_CODE });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.trainerClientId).toBe(TRAINER_CLIENT_ID);

    // SECURITY: Verify the atomic update used the gate (acceptedAt: null,
    // clientUserId: null) — without those filters, two concurrent
    // accept-invite calls would both run unconditional updates and the
    // second would silently un-link the first acceptor (HIGH-12).
    const updateCalls = (prisma.trainerClient.updateMany as jest.Mock).mock.calls;
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][0].where).toEqual(
      expect.objectContaining({ acceptedAt: null, clientUserId: null }),
    );
  });

  it('409 TOCTOU race — updateMany count=0 means another caller won the race', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(regularUser);
    (prisma.trainerClient.findUnique as jest.Mock).mockResolvedValueOnce(makeInvitedClient());
    (prisma.trainerClient.findFirst as jest.Mock).mockResolvedValueOnce(null);
    // Concurrent caller already accepted — atomic update finds nothing to update
    (prisma.trainerClient.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    const res = await request(app)
      .post('/api/trainer/accept-invite')
      .set('Authorization', `Bearer ${makeToken('u-regular', 'USER')}`)
      .send({ code: VALID_CODE });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVITE_ALREADY_USED');
  });
});
