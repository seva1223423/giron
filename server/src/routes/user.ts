import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

const weightSchema = z.object({
  weightKg: z.number().min(20, 'Вес не может быть менее 20 кг').max(400, 'Вес не может быть более 400 кг'),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Некорректная дата'),
});

// Get profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { healthRestrictions: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { passwordHash, ...profile } = user;
    res.json(profile);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения профиля' });
  }
});

// Update profile
router.patch('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const allowedFields = [
      'firstName', 'lastName', 'dateOfBirth', 'gender',
      'heightCm', 'weightKg', 'goal', 'fitnessLevel',
      'trainingExperienceYears', 'avatarUrl',
    ];

    const profileUpdateSchema = z.object({
      firstName: z.string().min(1).max(100).optional(),
      lastName: z.string().max(100).optional(),
      dateOfBirth: z.string().refine((d) => !isNaN(Date.parse(d)), 'Некорректная дата').optional(),
      gender: z.string().transform(v => v.toUpperCase()).pipe(z.enum(['MALE', 'FEMALE'])).optional(),
      heightCm: z.number().min(50).max(300).optional(),
      weightKg: z.number().min(20).max(400).optional(),
      goal: z.string().transform(v => v.toUpperCase()).pipe(
        z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'STRENGTH', 'ENDURANCE', 'FLEXIBILITY', 'GENERAL_FITNESS'])
      ).optional(),
      fitnessLevel: z.string().transform(v => v.toUpperCase()).pipe(
        z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'])
      ).optional(),
      trainingExperienceYears: z.number().min(0).max(80).optional(),
      avatarUrl: z.string().url('Некорректный URL').max(2048).optional(),
    });

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    }

    const data: Record<string, any> = { ...parsed.data };

    if (data.dateOfBirth) {
      data.dateOfBirth = new Date(data.dateOfBirth);
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data,
      include: { healthRestrictions: true },
    });

    const { passwordHash, ...profile } = user;
    res.json(profile);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка обновления профиля' });
  }
});

// Add body weight
router.post('/weight', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = weightSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });

    const { weightKg, date } = parsed.data;
    const record = await prisma.bodyWeight.upsert({
      where: {
        userId_date: {
          userId: req.userId!,
          date: new Date(date),
        },
      },
      update: { weightKg },
      create: {
        userId: req.userId!,
        weightKg,
        date: new Date(date),
      },
    });
    res.json(record);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения веса' });
  }
});

// Get weight history
router.get('/weight', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const records = await prisma.bodyWeight.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take: 90,
    });
    res.json(records);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения веса' });
  }
});

// ── Body measurements ──────────────────────────────────────────────────��──────

const measurementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  chest: z.number().min(0).max(300).optional().nullable(),
  waist: z.number().min(0).max(300).optional().nullable(),
  hips: z.number().min(0).max(300).optional().nullable(),
  bicep: z.number().min(0).max(100).optional().nullable(),
  thigh: z.number().min(0).max(200).optional().nullable(),
  calf: z.number().min(0).max(100).optional().nullable(),
  neck: z.number().min(0).max(100).optional().nullable(),
});

router.post('/measurements', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = measurementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { date, ...fields } = parsed.data;
    const record = await prisma.bodyMeasurement.upsert({
      where: { userId_date: { userId: req.userId!, date: new Date(date) } },
      update: fields,
      create: { userId: req.userId!, date: new Date(date), ...fields },
    });
    res.json(record);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения замеров' });
  }
});

router.get('/measurements', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const records = await prisma.bodyMeasurement.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take: 60,
    });
    res.json(records);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения замеров' });
  }
});

// ── Sleep entries ─────────────────────────────────────────────────────────────

const sleepSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bedtime: z.string().regex(/^\d{2}:\d{2}$/),
  wakeTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationHours: z.number().min(0).max(24),
  quality: z.number().int().min(1).max(5).optional().nullable(),
});

router.post('/sleep', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = sleepSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
    const { date, bedtime, wakeTime, durationHours, quality } = parsed.data;
    const entry = await prisma.sleepEntry.upsert({
      where: { userId_date: { userId: req.userId!, date } },
      update: { bedtime, wakeTime, durationHours, quality },
      create: { userId: req.userId!, date, bedtime, wakeTime, durationHours, quality },
    });
    res.json(entry);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения сна' });
  }
});

router.delete('/sleep/:date', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.sleepEntry.deleteMany({
      where: { userId: req.userId!, date: req.params.date as string },
    });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления записи сна' });
  }
});

router.get('/sleep', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const entries = await prisma.sleepEntry.findMany({
      where: { userId: req.userId! },
      orderBy: { date: 'desc' },
      take: 90,
    });
    res.json(entries);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения данных сна' });
  }
});

// ── Weekly Plan ───────────────────────────────────────────────────────────────
router.get('/week-plan', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { weekPlan: true } });
    res.json(user?.weekPlan ?? {});
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения недельного плана' });
  }
});

router.put('/week-plan', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Validate: week plan is a map of day (0-6) to array of workout name strings (max 10 chars each)
    const weekPlanSchema = z.record(
      z.string().regex(/^[0-6]$/, 'Ключ должен быть числом 0-6'),
      z.array(z.string().max(100)).max(20),
    ).max(7);

    const parsed = weekPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректный формат недельного плана' });
    }
    await prisma.user.update({ where: { id: req.userId! }, data: { weekPlan: parsed.data } });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сохранения недельного плана' });
  }
});

const PASSWORD_HISTORY_DEPTH = 3;

async function checkPasswordHistory(userId: string, newPassword: string): Promise<boolean> {
  // Returns true if newPassword was recently used (reuse detected)
  const recent = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_HISTORY_DEPTH,
    select: { passwordHash: true },
  });
  for (const entry of recent) {
    if (await bcrypt.compare(newPassword, entry.passwordHash)) return true;
  }
  return false;
}

async function recordPasswordHistory(userId: string, hash: string): Promise<void> {
  await prisma.passwordHistory.create({ data: { userId, passwordHash: hash } });
  // Prune: keep only last PASSWORD_HISTORY_DEPTH+2 entries
  const all = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const toDelete = all.slice(PASSWORD_HISTORY_DEPTH + 2);
  if (toDelete.length > 0) {
    await prisma.passwordHistory.deleteMany({ where: { id: { in: toDelete.map((r) => r.id) } } });
  }
}

// ── Change password ───────────────────────────────────────────────────────────

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1, 'Введите текущий пароль'),
      newPassword: z.string().min(8, 'Новый пароль минимум 8 символов'),
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { passwordHash: true } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // Social-only users don't have a password — they're creating one for the first time
    if (user.passwordHash) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Неверный текущий пароль', code: 'WRONG_CURRENT_PASSWORD' });
      }
    }

    // Check password history
    if (await checkPasswordHistory(req.userId!, newPassword)) {
      return res.status(400).json({ error: `Нельзя использовать один из последних ${PASSWORD_HISTORY_DEPTH} паролей`, code: 'PASSWORD_REUSED' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId! }, data: { passwordHash: newHash } });
    await recordPasswordHistory(req.userId!, newHash);

    // Revoke all refresh tokens except the current session (force other devices to re-login)
    await prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } });

    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'PASSWORD_CHANGE', details: 'method=change_password' } });

    res.json({ message: 'Пароль успешно изменён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/change-password:', e);
    res.status(500).json({ error: 'Ошибка изменения пароля' });
  }
});

// ── Push tokens ──────────────────────────────────────────────────────────────

/** POST /user/push-token — register or update Expo push token for this device */
router.post('/push-token', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = z.object({ token: z.string().min(1).max(200) }).parse(req.body);
    // Upsert: if this token already exists for another user (device transfer), reassign it
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: req.userId!, updatedAt: new Date() },
      create: { token, userId: req.userId! },
    });
    res.json({ ok: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/push-token:', e);
    res.status(500).json({ error: 'Ошибка регистрации токена' });
  }
});

/** DELETE /user/push-token — remove push token on logout */
router.delete('/push-token', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    await prisma.pushToken.deleteMany({ where: { token, userId: req.userId! } });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

// ── Security events (user's own log) ─────────────────────────────────────────

/** GET /user/security-events — last 30 security events for the authenticated user */
router.get('/security-events', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const events = await prisma.securityEvent.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, action: true, ip: true, createdAt: true },
    });
    res.json(events);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка загрузки событий безопасности' });
  }
});

// ── Has password ──────────────────────────────────────────────────────────────

/** GET /user/has-password — returns whether the authenticated user has a password set */
router.get('/has-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { passwordHash: true } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ hasPassword: !!user.passwordHash });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// ── Sessions (refresh tokens) ─────────────────────────────────────────────────

/** GET /user/sessions — list active sessions for the authenticated user */
router.get('/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const sessions = await prisma.refreshToken.findMany({
      where: { userId: req.userId!, revoked: false, expiresAt: { gte: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(sessions);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения сессий' });
  }
});

/** DELETE /user/sessions/:id — revoke a specific session */
router.delete('/sessions/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const session = await prisma.refreshToken.findUnique({ where: { id }, select: { userId: true } });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    await prisma.refreshToken.update({ where: { id }, data: { revoked: true } });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка отзыва сессии' });
  }
});

/** DELETE /user/sessions — revoke all sessions (logout everywhere) */
router.delete('/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } });
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOKEN_REVOKED', details: 'all_sessions' } });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка выхода из всех устройств' });
  }
});

// ── Delete account ────────────────────────────────────────────────────────────

/**
 * DELETE /user/account — permanently delete the authenticated user's account.
 * Requires password confirmation (or skip if social-only with no password).
 */
router.delete('/account', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { password } = z.object({
      password: z.string().optional(),
    }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { passwordHash: true, email: true } });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // If user has a password, they must provide it to confirm deletion
    if (user.passwordHash) {
      if (!password) {
        return res.status(400).json({ error: 'Введите пароль для подтверждения удаления', code: 'PASSWORD_REQUIRED' });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Неверный пароль', code: 'WRONG_PASSWORD' });
      }
    }

    // Log before deletion (userId will be gone after cascade delete)
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'ACCOUNT_DELETED', details: `email=${user.email}` } });

    // Cascade delete: Prisma schema has onDelete: Cascade on all user relations
    await prisma.user.delete({ where: { id: req.userId! } });

    res.json({ message: 'Аккаунт удалён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('DELETE /user/account:', e);
    res.status(500).json({ error: 'Ошибка удаления аккаунта' });
  }
});

export { router as userRouter };
