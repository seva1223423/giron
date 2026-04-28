import { Router, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

// Middleware: check that user has trainer role or active trainer subscription.
// authenticate already re-fetches the user row for ban/lock checks and sets req.userRole,
// so we reuse it here to avoid a redundant DB round-trip.
async function requireTrainerRole(req: AuthRequest, res: Response, next: Function) {
  try {
    // Fast-path: role already set by authenticate middleware
    if (req.userRole === 'TRAINER') { next(); return; }

    // Check if an active trainer subscription grants access (must not be expired)
    const sub = await prisma.subscription.findUnique({ where: { userId: req.userId! } });
    const isTrainer = sub?.plan === 'trainer' && (sub?.status === 'active' || sub?.status === 'cancelled') && (!sub.endDate || sub.endDate >= new Date());
    if (!isTrainer) {
      return res.status(403).json({ error: 'Доступ только для тренеров' });
    }
    next();
  } catch {
    return res.status(500).json({ error: 'Ошибка проверки прав' });
  }
}

const CUID_RE = /^c[a-z0-9]{20,30}$/;
const isValidId = (id: string | string[]) => CUID_RE.test(String(id));

const addClientSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  age: z.number().int().finite().min(5).max(120).optional(),
  goal: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  assignedProgram: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  emoji: z.string().max(10).optional(),
});

const updateClientSchema = addClientSchema.partial().extend({
  totalWorkouts: z.number().int().finite().min(0).max(100000).optional(),
  lastVisit: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lastVisit должен быть в формате YYYY-MM-DD').optional(),
});

// Get all clients for current trainer
router.get('/clients', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  try {
    const clients = await prisma.trainerClient.findMany({
      where: { trainerId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    res.json(clients);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения клиентов' });
  }
});

// Add client
router.post('/clients', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = addClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const client = await prisma.trainerClient.create({
      data: {
        ...parsed.data,
        trainerId: req.userId!,
      },
    });
    res.status(201).json(client);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка добавления клиента' });
  }
});

// Update client
router.patch('/clients/:id', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const parsed = updateClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const data: Record<string, any> = { ...parsed.data };

    const { count, ...rest } = await prisma.$transaction(async (tx) => {
      const result = await tx.trainerClient.updateMany({
        where: { id: req.params.id as string, trainerId: req.userId! },
        data,
      });
      if (result.count === 0) return { count: 0 };
      const row = await tx.trainerClient.findUnique({ where: { id: req.params.id as string } });
      return { count: result.count, row };
    });
    if (count === 0) return res.status(404).json({ error: 'Клиент не найден' });
    const updated = (rest as any).row;
    res.json(updated);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления клиента' });
  }
});

// Delete client
router.delete('/clients/:id', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const deleted = await prisma.trainerClient.deleteMany({
      where: { id: req.params.id as string, trainerId: req.userId! } as any,
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Клиент не найден' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления клиента' });
  }
});

// ── Sessions ─────────────────────────────────────────────────────────────────

const sessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1).max(200),
  durationMinutes: z.number().int().finite().min(1).max(600),
  volumeKg: z.number().finite().min(0).max(100000).optional(),
  notes: z.string().max(1000).optional(),
});

/** GET /trainer/sessions/:clientId — list sessions for a client */
router.get('/sessions/:clientId', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.clientId)) return res.status(400).json({ error: 'Некорректный ID клиента' });
  try {
    // Verify trainer owns this client
    const client = await prisma.trainerClient.findFirst({
      where: { id: req.params.clientId as string, trainerId: req.userId! },
    });
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });

    const sessions = await prisma.trainerSession.findMany({
      where: { clientId: req.params.clientId as string, client: { trainerId: req.userId! } },
      orderBy: { date: 'desc' },
      take: 365,
    });
    res.json(sessions);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения тренировок' });
  }
});

/** POST /trainer/sessions/:clientId — log a session */
router.post('/sessions/:clientId', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.clientId)) return res.status(400).json({ error: 'Некорректный ID клиента' });
  try {
    const client = await prisma.trainerClient.findFirst({
      where: { id: req.params.clientId as string, trainerId: req.userId! },
    });
    if (!client) return res.status(404).json({ error: 'Клиент не найден' });

    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const [session] = await prisma.$transaction([
      prisma.trainerSession.create({
        data: { clientId: req.params.clientId as string, ...parsed.data },
      }),
      prisma.trainerClient.updateMany({
        where: { id: req.params.clientId as string, trainerId: req.userId! },
        data: {
          totalWorkouts: { increment: 1 },
          lastVisit: parsed.data.date,
        },
      }),
    ]);

    res.status(201).json(session);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка записи тренировки' });
  }
});

/** DELETE /trainer/sessions/:id — remove a session */
router.delete('/sessions/:id', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    // Find session and verify ownership via client
    const session = await prisma.trainerSession.findUnique({
      where: { id: req.params.id as string },
      include: { client: { select: { trainerId: true } } },
    });
    if (!session || session.client.trainerId !== req.userId) {
      return res.status(404).json({ error: 'Тренировка не найдена' });
    }

    // Atomic: delete session + recount to keep totalWorkouts accurate
    // Re-verify ownership inside transaction to guard against TOCTOU if client is reassigned concurrently
    const deleted = await prisma.$transaction(async (tx) => {
      const { count } = await tx.trainerSession.deleteMany({
        where: { id: req.params.id as string, client: { trainerId: req.userId! } },
      });
      if (count === 0) return false;
      const sessionCount = await tx.trainerSession.count({ where: { clientId: session.clientId } });
      await tx.trainerClient.update({
        where: { id: session.clientId },
        data: { totalWorkouts: sessionCount },
      });
      return true;
    });

    if (!deleted) return res.status(404).json({ error: 'Тренировка не найдена' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления тренировки' });
  }
});

// ── B2B Dashboard Phase 1: Invite linkage ───────────────────────────────────
// A trainer generates a short random code on their side, the client enters
// it in their own app to link accounts. This is the foundation for every
// richer B2B feature (shared progress, assigned programs, coach chat).

/** Codes older than this at accept-time are refused. 7 days balances client
 *  convenience (vacation-length window) vs "I forgot I sent it 3 months
 *  ago" stale-invite risk. Server-side check uses invitedAt timestamp so
 *  no cron job is needed — codes naturally invalidate. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Generate a 10-char code: 6 chars alphabet (no O/0/I/1 confusion) +
 *  4 numeric. Short enough to dictate verbally, entropy ~10^13 so
 *  collision on UNIQUE retry is negligible at our scale. */
function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
  const digits = '23456789';                    // no 0, 1
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  for (let i = 0; i < 4; i++) {
    out += digits[crypto.randomInt(digits.length)];
  }
  return out;
}

/**
 * POST /trainer/clients/:id/invite
 * Trainer generates (or regenerates) an invite code for one of their roster
 * rows. If the row is already linked to a user (acceptedAt set), refuse —
 * re-linking must go through a disconnect flow first.
 *
 * Response: { code, expiresAt? } — code stays valid until accepted or
 * regenerated. No expiry yet (TODO: add 7-day window once we have cron).
 */
router.post('/clients/:id/invite', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const client = await prisma.trainerClient.findUnique({
      where: { id: req.params.id as string },
      select: { id: true, trainerId: true, clientUserId: true },
    });
    if (!client || client.trainerId !== req.userId) {
      return res.status(404).json({ error: 'Клиент не найден' });
    }
    if (client.clientUserId) {
      return res.status(409).json({ error: 'Клиент уже привязан к учётной записи', code: 'ALREADY_LINKED' });
    }

    // Retry on unique collision — extremely unlikely (~10^13 space) but
    // cheap insurance. Bail after 5 tries to avoid a pathological loop
    // if somehow the RNG got stuck.
    let code = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateInviteCode();
      const collision = await prisma.trainerClient.findUnique({ where: { inviteCode: candidate }, select: { id: true } });
      if (!collision) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return res.status(500).json({ error: 'Не удалось сгенерировать код, повторите' });
    }

    await prisma.trainerClient.update({
      where: { id: client.id },
      data: { inviteCode: code, invitedAt: new Date() },
    });
    res.json({ code });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка генерации приглашения' });
  }
});

const acceptInviteSchema = z.object({
  code: z.string().min(10).max(10).regex(/^[A-Z0-9]+$/, 'Код состоит только из букв и цифр'),
});

/**
 * POST /trainer/accept-invite
 * A regular authenticated user enters a code they received from a trainer.
 * On success, the TrainerClient row is linked to their user id and marked
 * as accepted. The trainer can now see their roster populated.
 *
 * Auth'd as the CLIENT (any authenticated user), NOT through requireTrainerRole —
 * clients don't need a trainer sub to accept an invite.
 */
router.post('/accept-invite', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректный код', details: parsed.error.flatten() });

    const { code } = parsed.data;
    const client = await prisma.trainerClient.findUnique({
      where: { inviteCode: code },
      select: { id: true, trainerId: true, clientUserId: true, acceptedAt: true, name: true, invitedAt: true },
    });
    if (!client) return res.status(404).json({ error: 'Код не найден или больше не действителен', code: 'INVITE_NOT_FOUND' });
    if (client.acceptedAt || client.clientUserId) {
      return res.status(409).json({ error: 'Этот код уже был использован', code: 'INVITE_ALREADY_USED' });
    }
    // Expiry check — deliberately no DB TTL because Postgres cron extensions
    // aren't portable across Neon / Yandex / Render. Lazy check at
    // accept-time is free and sufficient.
    if (client.invitedAt && Date.now() - client.invitedAt.getTime() > INVITE_TTL_MS) {
      return res.status(410).json({ error: 'Срок действия кода истёк. Попроси тренера сгенерировать новый.', code: 'INVITE_EXPIRED' });
    }

    // Refuse self-invite: a trainer cannot become their own client. Would
    // break the unique[trainerId, clientUserId] silently since trainerId
    // always equals req.userId in that case.
    if (client.trainerId === req.userId) {
      return res.status(400).json({ error: 'Нельзя принять собственное приглашение', code: 'SELF_INVITE' });
    }

    // Enforce unique[trainerId, clientUserId] — one trainer cannot have the
    // same user twice. Prisma will throw P2002 on the composite unique; we
    // check upfront for a friendlier error.
    const existingLink = await prisma.trainerClient.findFirst({
      where: { trainerId: client.trainerId, clientUserId: req.userId! },
      select: { id: true },
    });
    if (existingLink) {
      return res.status(409).json({ error: 'Вы уже клиент этого тренера', code: 'ALREADY_CLIENT' });
    }

    // Sec audit 2026-04: HIGH-12. Atomic conditional consume — prevents the
    // TOCTOU race where two concurrent accept-invite calls with the same
    // code both pass the in-memory `acceptedAt || clientUserId` check at
    // line 326 and both run unconditional update, with the second
    // overwriting the first (silent un-link of the legitimate client).
    const { count } = await prisma.trainerClient.updateMany({
      where: { id: client.id, acceptedAt: null, clientUserId: null },
      data: {
        clientUserId: req.userId!,
        acceptedAt: new Date(),
        // Burn the code so it can't be re-accepted by someone else. Keep
        // the value (don't null it) so the trainer dashboard can still
        // show "invited → accepted" audit trail.
      },
    });
    if (count === 0) {
      return res.status(409).json({ error: 'Этот код уже был использован', code: 'INVITE_ALREADY_USED' });
    }

    res.json({
      success: true,
      trainerClientId: client.id,
      trainerId: client.trainerId,
      displayName: client.name,
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка принятия приглашения' });
  }
});

/**
 * GET /trainer/my-trainers
 * Client-side counterpart to GET /trainer/clients — lists every trainer
 * the current user is linked to. Used by the client UI's "My trainers"
 * screen and right after a successful POST /accept-invite to refresh
 * local state.
 *
 * Returns a slim shape (trainerClientId + trainer profile basics +
 * acceptance date) — explicitly NOT the trainer's whole roster, since
 * that would leak other clients' data.
 *
 * Auth: any authenticated user. NOT gated on TRAINER role — the whole
 * point is letting non-trainer users see who's coaching them.
 */
router.get('/my-trainers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const links = await prisma.trainerClient.findMany({
      where: { clientUserId: req.userId!, acceptedAt: { not: null } },
      orderBy: { acceptedAt: 'desc' },
      take: 50, // hard cap — a normal user has 1-3 trainers, never 50
      select: {
        id: true,
        acceptedAt: true,
        trainer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });
    res.json({
      trainers: links.map((link) => ({
        trainerClientId: link.id,
        acceptedAt: link.acceptedAt,
        trainerId: link.trainer.id,
        firstName: link.trainer.firstName,
        lastName: link.trainer.lastName,
        avatarUrl: link.trainer.avatarUrl,
      })),
    });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка загрузки тренеров' });
  }
});

/**
 * DELETE /trainer/my-trainers/:trainerClientId
 * Client-initiated disconnect — the user wants to leave their trainer
 * without asking the trainer to do it from their side. The row goes
 * back to the unlinked state (clientUserId/acceptedAt cleared) so the
 * trainer's roster shows them as "no longer linked" but historical
 * notes are preserved.
 *
 * Auth: any authenticated user, but verifies clientUserId === req.userId
 * before clearing — prevents one user disconnecting another user's
 * relationship via the trainerClientId.
 */
router.delete('/my-trainers/:trainerClientId', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.trainerClientId)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { count } = await prisma.trainerClient.updateMany({
      where: { id: req.params.trainerClientId as string, clientUserId: req.userId! },
      data: { clientUserId: null, acceptedAt: null, inviteCode: null, invitedAt: null },
    });
    if (count === 0) return res.status(404).json({ error: 'Связь с тренером не найдена' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка отвязки' });
  }
});

/**
 * DELETE /trainer/clients/:id/link
 * Trainer disconnects a linked user. The TrainerClient row remains (keeps
 * history of notes, sessions) but clientUserId / acceptedAt are cleared so
 * the trainer can re-invite a new user to the same roster slot.
 */
router.delete('/clients/:id/link', authenticate, requireTrainerRole as any, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { count } = await prisma.trainerClient.updateMany({
      where: { id: req.params.id as string, trainerId: req.userId! },
      data: { clientUserId: null, acceptedAt: null, inviteCode: null, invitedAt: null },
    });
    if (count === 0) return res.status(404).json({ error: 'Клиент не найден' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка отвязки' });
  }
});

export { router as trainerRouter };
