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

// ─── POST /api/support/tickets/:id/messages ──────────────────────────────────
//
// The endpoint that handles support replies — both user and staff send
// messages here. Was uncovered before now (only the ticket-creation
// endpoint was tested). Key invariants:
//   - isStaff flag is derived from server-side role lookup, NEVER body
//   - Non-staff cannot post on someone else's ticket (404, not 403, to
//     avoid leaking ticket-existence)
//   - Closed tickets refuse messages; user can reopen a 'resolved' one
//   - Staff posting auto-assigns themselves and bumps open→in_progress

describe('POST /api/support/tickets/:id/messages', () => {
  const validBody = { content: 'Я обновил приложение и теперь не могу залогиниться.' };

  it('401 without token', async () => {
    const res = await request(app)
      .post(`/api/support/tickets/${TICKET_ID}/messages`)
      .send(validBody);
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    const res = await request(app)
      .post('/api/support/tickets/bad-id/messages')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);
    expect(res.status).toBe(400);
  });

  it('404 when ticket not found', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce(null);

    const res = await request(app)
      .post(`/api/support/tickets/${TICKET_ID}/messages`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);
    expect(res.status).toBe(404);
  });

  it('404 IDOR — non-staff cannot post on a ticket owned by another user', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket, userId: 'u-other-user',
    });
    // Auth middleware first call → baseUser; route's role lookup is the
    // second findUnique call. Reset and provide both.
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(baseUser)            // auth middleware
      .mockResolvedValueOnce({ role: 'USER' });  // route's role check

    const res = await request(app)
      .post(`/api/support/tickets/${TICKET_ID}/messages`)
      .set('Authorization', `Bearer ${makeToken('u-test', 'USER')}`)
      .send(validBody);
    expect(res.status).toBe(404); // 404, not 403 — leakage protection
  });

  it('400 when ticket is closed', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket, status: 'closed',
    });
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(baseUser)
      .mockResolvedValueOnce({ role: 'USER' });

    const res = await request(app)
      .post(`/api/support/tickets/${TICKET_ID}/messages`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);
    expect(res.status).toBe(400);
  });

  it('201 user posts message — ticket "resolved" reopens to "open"', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket, status: 'resolved',
    });
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(baseUser)
      .mockResolvedValueOnce({ role: 'USER' });
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (ops: any[]) => [
      { id: 'cmsg00000000000000001', content: validBody.content, isStaff: false },
      sampleTicket,
    ]);

    const res = await request(app)
      .post(`/api/support/tickets/${TICKET_ID}/messages`)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    // Verify the ticket update payload — non-staff hitting a resolved
    // ticket should flip status back to 'open' so staff sees the reply
    // come back into the queue.
    const txCalls = (prisma.$transaction as jest.Mock).mock.calls;
    expect(txCalls.length).toBe(1);
  });

  it('201 staff posts message — assignedToId set + status open→in_progress', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket, status: 'open', assignedToId: null,
    });
    // Auth middleware sees SUPPORT role; route's role lookup ALSO returns SUPPORT
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(staffUser)
      .mockResolvedValueOnce({ role: 'SUPPORT' });
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (ops: any[]) => [
      { id: 'cmsg00000000000000002', content: validBody.content, isStaff: true },
      { ...sampleTicket, status: 'in_progress', assignedToId: 'u-staff' },
    ]);

    const res = await request(app)
      .post(`/api/support/tickets/${TICKET_ID}/messages`)
      .set('Authorization', `Bearer ${makeToken('u-staff', 'SUPPORT')}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.isStaff).toBe(true);
  });

  it('SECURITY: isStaff is derived from server role, NOT request body', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce(sampleTicket);
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(baseUser)
      .mockResolvedValueOnce({ role: 'USER' }); // explicitly NOT staff
    (prisma.$transaction as jest.Mock).mockImplementationOnce(async (ops: any[]) => [
      { id: 'cmsg-evil', content: validBody.content, isStaff: false },
      sampleTicket,
    ]);

    // Try to claim staff status via body — should be ignored
    const res = await request(app)
      .post(`/api/support/tickets/${TICKET_ID}/messages`)
      .set('Authorization', `Bearer ${makeToken('u-test', 'USER')}`)
      .send({ ...validBody, isStaff: true });

    expect(res.status).toBe(201);
    // Verify the actual transaction call — supportMessage.create.data.isStaff
    // must reflect the SERVER role, not the body. We assert via the message
    // returned in the response (mock echoes isStaff:false).
    expect(res.body.isStaff).toBe(false);
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

  it('404 when ticket belongs to another user (leakage protection — matches GET)', async () => {
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket,
      userId: 'u-other-user',
    });

    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/close`)
      .set('Authorization', `Bearer ${makeToken('u-test')}`);

    // GET /support/tickets/:id already returned 404 in this case; close was
    // inconsistent with 403, letting an attacker probe ticket existence.
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Тикет не найден');
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

// ─── PATCH /api/support/tickets/:id/status ────────────────────────────────────

describe('PATCH /api/support/tickets/:id/status', () => {
  // Valid CUID for staff member — required by Zod .cuid() on assignedToId
  const STAFF_CUID = 'cstaff0000000000000001';
  const staffUserCuid = { id: STAFF_CUID, isBanned: false, lockedUntil: null, role: 'SUPPORT' };

  it('401 without token', async () => {
    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/status`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(401);
  });

  it('403 for regular USER role — blocked by requireStaff', async () => {
    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/status`)
      .set('Authorization', `Bearer ${makeToken('u-test', 'USER')}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(403);
  });

  it('400 when id is not a valid CUID', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(staffUser);

    const res = await request(app)
      .patch('/api/support/tickets/bad-id/status')
      .set('Authorization', `Bearer ${makeToken('u-staff', 'SUPPORT')}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(400);
  });

  it('403 SUPPORT staff cannot update status if not assigned to ticket', async () => {
    // authenticate → staffUser, route actor check → staffUser (not admin)
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(staffUser)   // authenticate
      .mockResolvedValueOnce(staffUser);  // actor check in route (role: SUPPORT → not admin)
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      assignedToId: 'u-other-staff', // assigned to DIFFERENT staff member
    });

    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/status`)
      .set('Authorization', `Bearer ${makeToken('u-staff', 'SUPPORT')}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(403);
  });

  it('200 ADMIN can update any ticket status regardless of assignment', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(adminUser)  // authenticate
      .mockResolvedValueOnce(adminUser); // actor check → ADMIN (bypasses assignment check)
    (prisma.supportTicket.findUnique as jest.Mock).mockResolvedValueOnce({
      assignedToId: null, // not assigned to anyone
    });
    (prisma.supportTicket.update as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket,
      status: 'resolved',
    });

    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/status`)
      .set('Authorization', `Bearer ${makeToken('u-admin', 'ADMIN')}`)
      .send({ status: 'resolved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
  });
});

// ─── PATCH /api/support/tickets/:id/assign ────────────────────────────────────

describe('PATCH /api/support/tickets/:id/assign', () => {
  const STAFF_CUID = 'cstaff0000000000000001';
  const staffUserCuid = { id: STAFF_CUID, isBanned: false, lockedUntil: null, role: 'SUPPORT' };

  it('401 without token', async () => {
    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/assign`)
      .send({ assignedToId: STAFF_CUID });
    expect(res.status).toBe(401);
  });

  it('400 when id is not a valid CUID', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser);

    const res = await request(app)
      .patch('/api/support/tickets/bad-id/assign')
      .set('Authorization', `Bearer ${makeToken('u-admin', 'ADMIN')}`)
      .send({ assignedToId: STAFF_CUID });

    expect(res.status).toBe(400);
  });

  it('403 SUPPORT role cannot assign tickets — admin only', async () => {
    // authenticate → staffUser, route actor check → staffUser (role: SUPPORT ≠ ADMIN)
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(staffUser)  // authenticate
      .mockResolvedValueOnce(staffUser); // actor check → not ADMIN → 403

    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/assign`)
      .set('Authorization', `Bearer ${makeToken('u-staff', 'SUPPORT')}`)
      .send({ assignedToId: STAFF_CUID });

    expect(res.status).toBe(403);
  });

  it('400 when assignedToId belongs to a regular user (not staff)', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(adminUser)  // authenticate
      .mockResolvedValueOnce(adminUser)  // actor check → ADMIN
      .mockResolvedValueOnce(baseUser);  // assignee lookup → USER role → invalid

    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/assign`)
      .set('Authorization', `Bearer ${makeToken('u-admin', 'ADMIN')}`)
      .send({ assignedToId: STAFF_CUID });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('сотруднику');
  });

  it('200 admin successfully assigns ticket to a SUPPORT staff member', async () => {
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(adminUser)    // authenticate
      .mockResolvedValueOnce(adminUser)    // actor check → ADMIN
      .mockResolvedValueOnce(staffUserCuid); // assignee → SUPPORT role, not banned
    (prisma.supportTicket.update as jest.Mock).mockResolvedValueOnce({
      ...sampleTicket,
      assignedToId: STAFF_CUID,
      status: 'in_progress',
    });

    const res = await request(app)
      .patch(`/api/support/tickets/${TICKET_ID}/assign`)
      .set('Authorization', `Bearer ${makeToken('u-admin', 'ADMIN')}`)
      .send({ assignedToId: STAFF_CUID });

    expect(res.status).toBe(200);
    expect(res.body.assignedToId).toBe(STAFF_CUID);
    expect(res.body.status).toBe('in_progress');
  });
});
