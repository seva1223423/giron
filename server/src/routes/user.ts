import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import crypto from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { getSubStatus } from '../utils/subscriptionCheck';

/** Free plan: max body measurement entries returned */
const FREE_MEASUREMENTS_LIMIT = 5;
import { normalizePhone } from '../services/smsService';
import { sendPushToUser } from '../services/pushService';
import { sendPasswordChangedAlert } from '../services/emailService';

const JWT_ISS = 'irongym-api';
const JWT_AUD = 'irongym-app';

/** CUID v1 format: starts with 'c', ~25 chars, alphanumeric */
const CUID_RE = /^c[a-z0-9]{20,30}$/;
const isValidId = (id: string | string[]) => CUID_RE.test(String(id));

/** Prevent TOTP replay attacks: check if code was recently used, then record it. Returns true if replay detected. */
async function isTotpReplay(userId: string, code: string): Promise<boolean> {
  // TOTP window=1 means codes are valid for up to 90 seconds (prev + current + next period)
  const windowMs = 90 * 1000;
  const since = new Date(Date.now() - windowMs);
  const existing = await prisma.usedTotpCode.findFirst({
    where: { userId, code, usedAt: { gte: since } },
    select: { id: true },
  });
  if (existing) return true;
  // Record this code as used
  await prisma.usedTotpCode.create({ data: { userId, code } });
  return false;
}

/** Issue new access + refresh tokens after revoking all old sessions for the user */
async function reissueTokens(userId: string, req: AuthRequest): Promise<{ token: string; refreshToken: string }> {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '15m', issuer: JWT_ISS, audience: JWT_AUD });
  const rawRefresh = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '30d', issuer: JWT_ISS, audience: JWT_AUD });
  const ip = (req as any).ip ?? null;
  const userAgent = req.headers['user-agent'] ?? null;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { token: rawRefresh, userId, expiresAt, ip, userAgent } });
  return { token, refreshToken: rawRefresh };
}

const router = Router();

const MAX_OTP_ATTEMPTS = 5;

const strongPassword = z
  .string()
  .min(8, 'Пароль минимум 8 символов')
  .refine((p) => /[A-Z]/.test(p), { message: 'Пароль должен содержать хотя бы одну заглавную букву' })
  .refine((p) => /[a-z]/.test(p), { message: 'Пароль должен содержать хотя бы одну строчную букву' })
  .refine((p) => /[0-9]/.test(p), { message: 'Пароль должен содержать хотя бы одну цифру' });

const weightSchema = z.object({
  weightKg: z.number().min(20, 'Вес не может быть менее 20 кг').max(400, 'Вес не может быть более 400 кг'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата должна быть в формате YYYY-MM-DD').refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z')), 'Некорректная дата'),
});

// Get profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { healthRestrictions: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const { passwordHash, googleId, vkId, yandexId, totpSecret, totpBackupCodes, adminNote, banReason, loginAttempts, lockedUntil, ...safeProfile } = user as any;
    res.json({
      ...safeProfile,
      hasGoogle: !!googleId,
      hasVk: !!vkId,
      hasYandex: !!yandexId,
    });
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
      avatarUrl: z.string().url('Некорректный URL').max(2048).refine((u) => u.startsWith('https://'), 'URL должен использовать HTTPS').optional(),
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

    const { passwordHash, googleId, vkId: _vk, yandexId, totpSecret, totpBackupCodes, adminNote: _an, banReason: _br, loginAttempts: _la, lockedUntil: _lu, ...safeProfile } = user as any;
    res.json({ ...safeProfile, hasGoogle: !!googleId, hasVk: !!_vk, hasYandex: !!yandexId });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Пользователь не найден' });
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
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z')), 'Некорректная дата'),
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
    // Free plan: cap at FREE_MEASUREMENTS_LIMIT — prevents paywall bypass via direct API call
    const { isPaid } = await getSubStatus(req.userId!);
    const take = isPaid ? 60 : FREE_MEASUREMENTS_LIMIT;
    const records = await prisma.bodyMeasurement.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take,
    });
    res.json(records);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения замеров' });
  }
});

router.delete('/measurements/:date', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params as { date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Некорректная дата. Формат: YYYY-MM-DD' });
    }
    const deleted = await prisma.bodyMeasurement.deleteMany({
      where: { userId: req.userId!, date: new Date(date) },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Замер не найден' });
    res.json({ success: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления замера' });
  }
});

// ── Sleep entries ─────────────────────────────────────────────────────────────

const sleepSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !isNaN(Date.parse(d + 'T00:00:00Z')), 'Некорректная дата'),
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
    const dateParam = req.params.date as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return res.status(400).json({ error: 'Некорректный формат даты. Используйте YYYY-MM-DD' });
    }
    const deleted = await prisma.sleepEntry.deleteMany({
      where: { userId: req.userId!, date: dateParam },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Запись сна не найдена' });
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
    ).refine((v) => Object.keys(v).length <= 7, 'Не более 7 дней');

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
    take: PASSWORD_HISTORY_DEPTH + 10,
  });
  const toDelete = all.slice(PASSWORD_HISTORY_DEPTH + 2);
  if (toDelete.length > 0) {
    await prisma.passwordHistory.deleteMany({ where: { id: { in: toDelete.map((r) => r.id) } } });
  }
}

// ── Change password ───────────────────────────────────────────────────────────

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword, totpCode } = z.object({
      currentPassword: z.string().min(1, 'Введите текущий пароль'),
      newPassword: strongPassword,
      totpCode: z.string().length(6).optional(),
    }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { passwordHash: true, email: true, emailVerified: true, totpEnabled: true, totpSecret: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    // Social-only users don't have a password — they're creating one for the first time
    if (user.passwordHash) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Неверный текущий пароль', code: 'WRONG_CURRENT_PASSWORD' });
      }
    }

    // If 2FA is enabled, also require TOTP code
    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        return res.status(400).json({ error: 'Введите код из аутентификатора', code: 'TOTP_REQUIRED' });
      }
      const totp = new TOTP({ secret: Secret.fromBase32(user.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 });
      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        return res.status(401).json({ error: 'Неверный код 2FA', code: 'INVALID_TOTP' });
      }
      if (await isTotpReplay(req.userId!, totpCode)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    }

    // Check password history
    if (await checkPasswordHistory(req.userId!, newPassword)) {
      return res.status(400).json({ error: `Нельзя использовать один из последних ${PASSWORD_HISTORY_DEPTH} паролей`, code: 'PASSWORD_REUSED' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId! }, data: { passwordHash: newHash } });
    await recordPasswordHistory(req.userId!, newHash);

    // Revoke all refresh tokens and trusted devices (security reset after password change)
    await Promise.all([
      prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.userId! } }),
    ]);

    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'PASSWORD_CHANGE', details: 'method=change_password' } });

    // Send email security alert for password change
    const ip = (req as any).ip ?? 'unknown';
    if (user.email && user.emailVerified) {
      sendPasswordChangedAlert(user.email, ip, new Date()).catch(() => {});
    }
    sendPushToUser(req.userId!, {
      title: 'Пароль изменён',
      body: 'Пароль вашего аккаунта был изменён. Если это не вы — обратитесь в поддержку.',
      data: { url: 'irongym://profile/security' },
    }).catch(() => {});

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
      select: { id: true, action: true, ip: true, userAgent: true, createdAt: true, details: true },
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
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ip: true },
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
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const session = await prisma.refreshToken.findUnique({ where: { id }, select: { userId: true } });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }
    await prisma.refreshToken.update({ where: { id }, data: { revoked: true } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Сессия не найдена' });
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

// ── Trusted devices ───────────────────────────────────────────────────────────

/** GET /user/trusted-devices — list active trusted devices */
router.get('/trusted-devices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const devices = await prisma.trustedDevice.findMany({
      where: { userId: req.userId!, expiresAt: { gte: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ip: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json(devices);
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения устройств' });
  }
});

/** DELETE /user/trusted-devices/:id — revoke a specific trusted device */
router.delete('/trusted-devices/:id', authenticate, async (req: AuthRequest, res: Response) => {
  if (!isValidId(req.params.id)) return res.status(400).json({ error: 'Некорректный ID' });
  try {
    const { id } = req.params as { id: string };
    const device = await prisma.trustedDevice.findUnique({ where: { id }, select: { userId: true } });
    if (!device || device.userId !== req.userId) {
      return res.status(404).json({ error: 'Устройство не найдено' });
    }
    await prisma.trustedDevice.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Устройство не найдено' });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления устройства' });
  }
});

/** DELETE /user/trusted-devices — revoke all trusted devices */
router.delete('/trusted-devices', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.trustedDevice.deleteMany({ where: { userId: req.userId! } });
    res.json({ ok: true });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка удаления устройств' });
  }
});

// ── Two-factor authentication (TOTP) ─────────────────────────────────────────

const APP_NAME = 'Iron Gym';

/** GET /user/2fa/status — returns current 2FA state */
router.get('/2fa/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpEnabled: true, totpSecret: true },
    });
    res.json({ enabled: user?.totpEnabled ?? false, setupPending: !!(user?.totpSecret && !user.totpEnabled) });
  } catch (e) {
    logger.error(e);
    res.status(500).json({ error: 'Ошибка получения статуса 2FA' });
  }
});

/** POST /user/2fa/setup — generate TOTP secret, return QR code (2FA not enabled until verified) */
router.post('/2fa/setup', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { email: true, totpEnabled: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    if (user.totpEnabled) {
      return res.status(400).json({ error: 'Двухфакторная аутентификация уже включена', code: 'TOTP_ALREADY_ENABLED' });
    }

    const secret = new Secret();
    const totp = new TOTP({
      issuer: APP_NAME,
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const otpauthUri = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, { width: 256, margin: 2 });

    // Store secret (unconfirmed — not enabled yet)
    await prisma.user.update({
      where: { id: req.userId! },
      data: { totpSecret: secret.base32, totpEnabled: false },
    });

    res.json({
      secret: secret.base32,
      otpauthUri,
      qrCodeDataUrl,
      instructions: 'Отсканируйте QR-код в Google Authenticator или Яндекс.Ключ, затем введите 6-значный код для подтверждения.',
    });
  } catch (e) {
    logger.error('POST /user/2fa/setup:', e);
    res.status(500).json({ error: 'Ошибка настройки 2FA' });
  }
});

/** POST /user/2fa/enable — verify TOTP code and enable 2FA */
router.post('/2fa/enable', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!user?.totpSecret) {
      return res.status(400).json({ error: 'Сначала настройте 2FA', code: 'TOTP_NOT_SETUP' });
    }
    if (user.totpEnabled) {
      return res.status(400).json({ error: 'Двухфакторная аутентификация уже включена', code: 'TOTP_ALREADY_ENABLED' });
    }

    const totp = new TOTP({ secret: Secret.fromBase32(user.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 });
    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return res.status(400).json({ error: 'Неверный код. Проверьте время на устройстве.', code: 'INVALID_TOTP' });
    }
    if (await isTotpReplay(req.userId!, code)) {
      return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
    }

    // Generate 8 single-use backup codes
    const plainCodes: string[] = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(), // 8-char hex codes like "A3F7B2D1"
    );
    const backupCodeEntries = plainCodes.map((code) => ({
      hash: crypto.createHash('sha256').update(code).digest('hex'),
      used: false,
    }));

    await prisma.user.update({
      where: { id: req.userId! },
      data: { totpEnabled: true, totpBackupCodes: JSON.stringify(backupCodeEntries) },
    });
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOTP_ENABLED' } });

    sendPushToUser(req.userId!, {
      title: 'Двухфакторная аутентификация включена',
      body: 'Ваш аккаунт теперь защищён 2FA. Если это не вы — немедленно смените пароль.',
      data: { url: 'irongym://profile/security' },
    }).catch(() => {});

    // Return plaintext backup codes only once — user must save them
    res.json({ ok: true, backupCodes: plainCodes });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/2fa/enable:', e);
    res.status(500).json({ error: 'Ошибка включения 2FA' });
  }
});

/** DELETE /user/2fa — disable 2FA (requires current TOTP code or password for social-only) */
router.delete('/2fa', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { code, password } = z.object({
      code: z.string().length(6).optional(),
      password: z.string().optional(),
    }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpSecret: true, totpEnabled: true, passwordHash: true },
    });
    if (!user?.totpEnabled) {
      return res.status(400).json({ error: '2FA не включена', code: 'TOTP_NOT_ENABLED' });
    }

    // Verify via TOTP code OR password (whichever is provided)
    let verified = false;
    if (code && user.totpSecret) {
      const totp = new TOTP({ secret: Secret.fromBase32(user.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 });
      verified = totp.validate({ token: code, window: 1 }) !== null;
      if (verified && await isTotpReplay(req.userId!, code)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    } else if (password && user.passwordHash) {
      verified = await bcrypt.compare(password, user.passwordHash);
    }

    if (!verified) {
      return res.status(401).json({ error: 'Неверный код или пароль', code: 'VERIFICATION_FAILED' });
    }

    await prisma.user.update({ where: { id: req.userId! }, data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null } });
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOTP_DISABLED' } });

    res.json({ ok: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('DELETE /user/2fa:', e);
    res.status(500).json({ error: 'Ошибка отключения 2FA' });
  }
});

/** POST /user/2fa/backup-codes — regenerate backup codes (requires current TOTP code) */
router.post('/2fa/backup-codes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpSecret: true, totpEnabled: true },
    });
    if (!user?.totpEnabled || !user.totpSecret) {
      return res.status(400).json({ error: '2FA не включена', code: 'TOTP_NOT_ENABLED' });
    }

    const totp = new TOTP({ secret: Secret.fromBase32(user.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 });
    if (totp.validate({ token: code, window: 1 }) === null) {
      return res.status(401).json({ error: 'Неверный код', code: 'INVALID_TOTP' });
    }
    if (await isTotpReplay(req.userId!, code)) {
      return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
    }

    const plainCodes: string[] = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(),
    );
    const backupCodeEntries = plainCodes.map((c) => ({
      hash: crypto.createHash('sha256').update(c).digest('hex'),
      used: false,
    }));

    await prisma.user.update({ where: { id: req.userId! }, data: { totpBackupCodes: JSON.stringify(backupCodeEntries) } });
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOTP_ENABLED', details: 'backup_codes_regenerated' } });

    res.json({ ok: true, backupCodes: plainCodes });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/2fa/backup-codes:', e);
    res.status(500).json({ error: 'Ошибка регенерации резервных кодов' });
  }
});

// ── Change email ──────────────────────────────────────────────────────────────

/**
 * POST /user/change-email — update email address with OTP verification.
 * Client must first call POST /auth/send-otp with { email: newEmail, purpose: 'email-change' }.
 */
router.post('/change-email', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { email: newEmail, code, totpCode } = z.object({
      email: z.string().email('Некорректный email'),
      code: z.string().length(6, 'Код должен быть 6 цифр'),
      totpCode: z.string().length(6).optional(),
    }).parse(req.body);

    // If 2FA is enabled, require TOTP before allowing email change
    const userFor2fa = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpEnabled: true, totpSecret: true },
    });
    if (userFor2fa?.totpEnabled && userFor2fa.totpSecret) {
      if (!totpCode) {
        return res.status(400).json({ error: 'Введите код из аутентификатора', code: 'TOTP_REQUIRED' });
      }
      const totp = new TOTP({ secret: Secret.fromBase32(userFor2fa.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 });
      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        return res.status(401).json({ error: 'Неверный код 2FA', code: 'INVALID_TOTP' });
      }
      if (await isTotpReplay(req.userId!, totpCode)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    }

    // Find active OTP for new email (purpose: email-change) — validate BEFORE checking availability
    // to prevent email enumeration (attacker can't distinguish 409 from 400 without a valid OTP)
    const activeOtp = await prisma.otpCode.findFirst({
      where: { email: newEmail, purpose: 'email-change', used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeOtp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }
    // Atomic increment with limit guard — prevents concurrent requests from bypassing the attempt cap
    const incResult = await prisma.otpCode.updateMany({
      where: { id: activeOtp.id, attempts: { lt: MAX_OTP_ATTEMPTS }, used: false },
      data: { attempts: { increment: 1 } },
    });
    if (incResult.count === 0) {
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', code: 'OTP_BRUTEFORCE' });
    }
    if (activeOtp.code !== code) {
      const attemptsLeft = MAX_OTP_ATTEMPTS - activeOtp.attempts - 1;
      return res.status(400).json({ error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.', code: 'INVALID_OTP' });
    }
    await prisma.otpCode.updateMany({ where: { id: activeOtp.id }, data: { used: true } });

    // Check email isn't already taken by another user (after OTP validation)
    const existing = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
    if (existing && existing.id !== req.userId) {
      return res.status(409).json({ error: 'Этот email уже используется', code: 'EMAIL_TAKEN' });
    }

    // Update email, revoke all sessions + trusted devices, issue new tokens for the current device
    await prisma.user.update({
      where: { id: req.userId! },
      data: { email: newEmail, emailVerified: true },
    });
    await Promise.all([
      prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.userId! } }),
    ]);
    const { token: newToken, refreshToken: newRefreshToken } = await reissueTokens(req.userId!, req);

    const ip = (req as any).ip ?? null;
    await prisma.securityEvent.create({
      data: { userId: req.userId!, action: 'EMAIL_CHANGED', ip, details: `email=${newEmail}` },
    });

    sendPushToUser(req.userId!, {
      title: 'Email аккаунта изменён',
      body: `К аккаунту привязан новый email. Другие устройства были отключены.`,
      data: { url: 'irongym://profile/security' },
    }).catch(() => {});

    res.json({ ok: true, email: newEmail, emailVerified: true, token: newToken, refreshToken: newRefreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    if (e?.code === 'P2002') return res.status(409).json({ error: 'Этот email уже используется', code: 'EMAIL_TAKEN' });
    logger.error('POST /user/change-email:', e);
    res.status(500).json({ error: 'Ошибка смены email' });
  }
});

// ── Change phone ──────────────────────────────────────────────────────────────

/**
 * POST /user/change-phone — update phone number.
 * Requires a valid OTP sent to the new phone via POST /auth/send-otp (purpose: 'phone-change').
 */
router.post('/change-phone', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { phone: rawPhone, code, totpCode } = z.object({
      phone: z.string().min(10, 'Введите номер телефона'),
      code: z.string().length(6, 'Код должен быть 6 цифр'),
      totpCode: z.string().length(6).optional(),
    }).parse(req.body);

    const phone = normalizePhone(rawPhone);

    // If 2FA is enabled, require TOTP before allowing phone change
    const userFor2fa = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { totpEnabled: true, totpSecret: true },
    });
    if (userFor2fa?.totpEnabled && userFor2fa.totpSecret) {
      if (!totpCode) {
        return res.status(400).json({ error: 'Введите код из аутентификатора', code: 'TOTP_REQUIRED' });
      }
      const totp = new TOTP({ secret: Secret.fromBase32(userFor2fa.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 });
      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        return res.status(401).json({ error: 'Неверный код 2FA', code: 'INVALID_TOTP' });
      }
      if (await isTotpReplay(req.userId!, totpCode)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
    }

    // Find active OTP for this phone — validate BEFORE checking availability
    // to prevent phone enumeration (attacker can't distinguish 409 from 400 without a valid OTP)
    const activeOtp = await prisma.otpCode.findFirst({
      where: { phone, purpose: 'phone-change', used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeOtp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }
    // Atomic increment with limit guard — prevents concurrent requests from bypassing the attempt cap
    const incResult = await prisma.otpCode.updateMany({
      where: { id: activeOtp.id, attempts: { lt: MAX_OTP_ATTEMPTS }, used: false },
      data: { attempts: { increment: 1 } },
    });
    if (incResult.count === 0) {
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', code: 'OTP_BRUTEFORCE' });
    }
    if (activeOtp.code !== code) {
      const attemptsLeft = MAX_OTP_ATTEMPTS - activeOtp.attempts - 1;
      return res.status(400).json({ error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.', code: 'INVALID_OTP' });
    }
    await prisma.otpCode.updateMany({ where: { id: activeOtp.id }, data: { used: true } });

    // Check phone isn't already used by another user (after OTP validation)
    const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (existing && existing.id !== req.userId) {
      return res.status(409).json({ error: 'Этот номер телефона уже используется', code: 'PHONE_TAKEN' });
    }

    // Update phone number, revoke all sessions + trusted devices, issue new tokens for the current device
    await prisma.user.update({
      where: { id: req.userId! },
      data: { phone, phoneVerified: true },
    });
    await Promise.all([
      prisma.refreshToken.updateMany({ where: { userId: req.userId!, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: req.userId! } }),
    ]);
    const { token: newToken, refreshToken: newRefreshToken } = await reissueTokens(req.userId!, req);

    const ip = (req as any).ip ?? null;
    await prisma.securityEvent.create({
      data: { userId: req.userId!, action: 'PHONE_CHANGED', ip, details: `phone=${phone}` },
    });

    sendPushToUser(req.userId!, {
      title: 'Номер телефона изменён',
      body: `К аккаунту привязан новый номер. Другие устройства были отключены.`,
      data: { url: 'irongym://profile/security' },
    }).catch(() => {});

    res.json({ ok: true, phone, phoneVerified: true, token: newToken, refreshToken: newRefreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    if (e?.code === 'P2002') return res.status(409).json({ error: 'Этот номер уже используется', code: 'PHONE_TAKEN' });
    logger.error('POST /user/change-phone:', e);
    res.status(500).json({ error: 'Ошибка смены номера телефона' });
  }
});

// ── Linked accounts ───────────────────────────────────────────────────────────

/**
 * DELETE /user/linked-accounts/:provider — unlink a social provider from the account.
 * Safety: user must have either a password or another linked provider to log in after unlinking.
 */
router.delete('/linked-accounts/:provider', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const provider = z.enum(['yandex', 'vk', 'google']).parse(req.params.provider);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { passwordHash: true, googleId: true, vkId: true, yandexId: true },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

    const fieldMap: Record<typeof provider, keyof typeof user> = {
      yandex: 'yandexId',
      vk: 'vkId',
      google: 'googleId',
    };

    if (!user[fieldMap[provider]]) {
      return res.status(400).json({ error: `Аккаунт ${provider} не привязан`, code: 'NOT_LINKED' });
    }

    // Ensure user won't lose all login methods
    const otherProviders = (['google', 'vk', 'yandex'] as const)
      .filter((p) => p !== provider)
      .filter((p) => !!user[fieldMap[p]]);
    if (!user.passwordHash && otherProviders.length === 0) {
      return res.status(400).json({
        error: 'Нельзя отвязать единственный способ входа. Сначала установите пароль.',
        code: 'LAST_LOGIN_METHOD',
      });
    }

    await prisma.user.update({
      where: { id: req.userId! },
      data: { [fieldMap[provider]]: null },
    });

    const ip = (req as any).ip ?? null;
    await prisma.securityEvent.create({
      data: { userId: req.userId!, action: 'ACCOUNT_UPDATED', ip, details: `unlinked:${provider}` },
    });

    res.json({ ok: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Неверный провайдер' });
    logger.error('DELETE /user/linked-accounts/:provider:', e);
    res.status(500).json({ error: 'Ошибка отвязки аккаунта' });
  }
});

// ── Delete account ────────────────────────────────────────────────────────────

/**
 * DELETE /user/account — permanently delete the authenticated user's account.
 * Requires password confirmation (or skip if social-only with no password).
 * If 2FA is enabled, also requires a valid TOTP code.
 */
router.delete('/account', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { password, totpCode } = z.object({
      password: z.string().optional(),
      totpCode: z.string().length(6).optional(),
    }).parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { passwordHash: true, email: true, totpEnabled: true, totpSecret: true },
    });
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

    // If 2FA is enabled, require TOTP code
    if (user.totpEnabled && user.totpSecret) {
      if (!totpCode) {
        return res.status(400).json({ error: 'Введите код из аутентификатора для подтверждения', code: 'TOTP_REQUIRED' });
      }
      const totp = new TOTP({ secret: Secret.fromBase32(user.totpSecret), algorithm: 'SHA1', digits: 6, period: 30 });
      if (totp.validate({ token: totpCode, window: 1 }) === null) {
        return res.status(401).json({ error: 'Неверный код 2FA', code: 'INVALID_TOTP' });
      }
      if (await isTotpReplay(req.userId!, totpCode)) {
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
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
