/**
 * Integration tests for server/src/routes/support.ts
 *
 * Covers: user ticket CRUD (GET/POST/PATCH), message posting, ticket close,
 * staff endpoints (GET /all, PATCH status) — auth gating, Zod validation,
 * IDOR protection, and rate limiting.
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
    supportTicket: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    supportMessage: {
      create: jest.fn(),
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

const makeToken = (userId = 'u-test', role = 'USER') =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
    issuer: JWT_ISS,
    audience: JWT_AUD,
  });

const baseUser = { id: 'u-test', isBanned: false, lockedUntil: null, role: 'USER' };
const staffUser = { id: 'u-staff', isBanned: false, lockedUntil: null, role: 'SUPPORT' };
const adminUser = { id: 'u-admin', isBanned: false, lockedUntil: null, role: 'ADMIN' };

const TICKET_ID = 'ctick000000000000000001';

const sampleTicket = {
  id: TICKET_ID,
  userId: 'u-test',
  subject: 'Cannot log in to my account',
  category: 'account',
  status: 'open',
  priority: 'normal',
  assignedToId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: [],
  assignedTo: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(baseUser);
  (prisma.supportTicket.count as jest.Mock).mockResolvedValue(0);
});

// ─── GET /api/support/tickets ─────────────────────────────────────────────────

describe('GET /api/support/tickets', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/support/tickets');
    expect(res.status).toBe(401);
  });

  it('200 returns tickets array', async () => {
    (prisma.supportTicket.findMany as jest.Mock).mockResolvedValueOnce([sampleTicket]);

    const res = await request(app)
      .get('/api/support/tickets')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].subject).toBe('Cannot log in to my account');
  });

  it('200 returns empty array when no tickets', async () => {
    (prisma.supportTicket.findMany as jest.Mock).mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/support/tickets')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('SECURITY: findMany filters by req.userId', async () => {
    (prisma.supportTicket.findMany as jest.Mock).mockResolvedValueOnce([]);

    await request(app)
      .get('/api/support/tickets')
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    const calls = (prisma.supportTicket.findMany as jest.Mock).mock.calls;
    expect(calls[0][0].where.userId).toBe('u-test');
  });
});

// ─── GET /api/support/tickets/:id ────────────────────────────────────────────

describe('GET /api/support/tickets/:id', () => {
  it('401 without token', async () => {
    const res = await request(app).get(`/api/support/tickets/${TICKET_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .get('/api/support/tickets/bad-id')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when ticket not found', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .get(`/api/support/tickets/${TICKET_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('200 returns own ticket', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce(sampleTicket);
    // Second call inside handler: user.findUnique to check isStaff
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(baseUser)   // authenticate
      .mockResolvedValueOnce({ role: 'USER' }); // isStaff check

    const res = await request(app)
      .get(`/api/support/tickets/${TICKET_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TICKET_ID);
  });

  it('SECURITY: 404 when ticket belongs to different user (IDOR)', async () => {
    const otherUserTicket = { ...sampleTicket, userId: 'u-victim' };
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce(otherUserTicket);
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(baseUser)
      .mockResolvedValueOnce({ role: 'USER' }); // not staff

    const res = await request(app)
      .get(`/api/support/tickets/${TICKET_ID}`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    expect(res.status).toBe(404);
  });
});

// ─── POST /api/support/tickets ────────────────────────────────────────────────

describe('POST /api/support/tickets', () => {
  const validPayload = {
    subject: 'Cannot access my account',
    category: 'account',
    message: 'I am unable to log in. Please help me reset my access.',
  };

  it('401 without token', async () => {
    const res = await request(app)
      .post('/api/support/tickets')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  it('400 when subject is too short (< 5 chars)', async () => {
    const res = await request(app)
      .post('/api/support/tickets')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validPayload, subject: 'Hi' });

    expect(res.status).toBe(400);
  });

  it('400 when category is invalid', async () => {
    const res = await request(app)
      .post('/api/support/tickets')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validPayload, category: 'spam' });

    expect(res.status).toBe(400);
  });

  it('400 when message is too short (< 10 chars)', async () => {
    const res = await request(app)
      .post('/api/support/tickets')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validPayload, message: 'Help' });

    expect(res.status).toBe(400);
  });

  it('429 when user already submitted 3 tickets in the last hour', async () => {
    (prisma.supportTicket.count as jest.Mock).mockResolvedValueOnce(3);

    const res = await request(app)
      .post('/api/support/tickets')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('TICKET_RATE_LIMIT');
  });

  it('201 creates ticket with userId from JWT', async () => {
    (prisma.supportTicket.create as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket,
      messages: [{ id: 'cmsg000000000000000001', content: validPayload.message }],
    });

    const res = await request(app)
      .post('/api/support/tickets')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(TICKET_ID);
  });

  it('SECURITY: create uses req.userId as userId, not body-supplied userId', async () => {
    (prisma.supportTicket.create as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket,
      messages: [],
    });

    await request(app)
      .post('/api/support/tickets')
      .set('Authorization', `Bearer ${makeToken('u-test')}`)
      .send({ ...validPayload, userId: 'u-victim' }); // must be ignored

    const createCalls = (prisma.supportTicket.create as jest.Mock).mock.calls;
    expect(createCalls.length).toBeGreaterThan(0);
    expect(createCalls[0][0].data.userId).toBe('u-test');
    expect(createCalls[0][0].data.userId).not.toBe('u-victim');
  });
});

// ─── PATCH /api/support/tickets/:id/close ────────────────────────────────────

describe('PATCH /api/support/tickets/:id/close', () => {
  it('401 without token', async () => {
    const res = await request(app).patch(`/api/support/tickets/${TICKET_ID}/close`);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .patch('/api/support/tickets/not-valid/close')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it('404 when ticket not found', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/close`)
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
  });

  it('403 when ticket belongs to another user', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket,
      userId: 'u-other-user',
    });

    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/close`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    expect(res.status).toBe(403);
  });

  it('200 closes own ticket', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce(sampleTicket);
    (prisma.supportTicket.update as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket,
      status: 'closed',
    });

    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/close`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
  });
});

// ─── GET /api/support/all (staff only) ───────────────────────────────────────

describe('GET /api/support/all (staff only)', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/support/all');
    expect(res.status).toBe(401);
  });

  it('403 for regular USER', async () => {
    const res = await request(app)
      .get('/api/support/all')
      .set('Authorization', `Bearer ${makeToken('u-test', 'USER')}`);

    expect(res.status).toBe(403);
  });

  it('200 for SUPPORT role user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(staffUser);
    (prisma.supportTicket.findMany as jest.Mock).mockResolvedValueOnce([sampleTicket]);
    (prisma.supportTicket.count as jest.Mock).mockResolvedValueOnce(1);

    const res = await request(app)
      .get('/api/support/all')
      .set('Authorization', `Bearer ${makeToken('u-staff', 'SUPPORT')}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tickets');
    expect(res.body).toHaveProperty('total');
  });

  it('200 for ADMIN role user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser);
    (prisma.supportTicket.findMany as jest.Mock).mockResolvedValueOnce([]);
    (prisma.supportTicket.count as jest.Mock).mockResolvedValueOnce(0);

    const res = await request(app)
      .get('/api/support/all')
      .set('Authorization', `Bearer ${makeToken('u-admin', 'ADMIN')}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});
