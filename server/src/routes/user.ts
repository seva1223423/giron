import { Router, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { normalizePhone } from '../services/smsService';
import { sendPushToUser } from '../services/pushService';

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

    await prisma.user.update({ where: { id: req.userId! }, data: { totpEnabled: true } });
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOTP_ENABLED' } });

    sendPushToUser(req.userId!, {
      title: 'Двухфакторная аутентификация включена',
      body: 'Ваш аккаунт теперь защищён 2FA. Если это не вы — немедленно смените пароль.',
      data: { url: 'irongym://profile/security' },
    }).catch(() => {});

    res.json({ ok: true });
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
    } else if (password && user.passwordHash) {
      verified = await bcrypt.compare(password, user.passwordHash);
    }

    if (!verified) {
      return res.status(401).json({ error: 'Неверный код или пароль', code: 'VERIFICATION_FAILED' });
    }

    await prisma.user.update({ where: { id: req.userId! }, data: { totpEnabled: false, totpSecret: null } });
    await prisma.securityEvent.create({ data: { userId: req.userId!, action: 'TOTP_DISABLED' } });

    res.json({ ok: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('DELETE /user/2fa:', e);
    res.status(500).json({ error: 'Ошибка отключения 2FA' });
  }
});

// ── Change phone ──────────────────────────────────────────────────────────────

/**
 * POST /user/change-phone — update phone number.
 * Requires a valid OTP sent to the new phone via POST /auth/send-otp (purpose: 'phone-change').
 */
router.post('/change-phone', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { phone: rawPhone, code } = z.object({
      phone: z.string().min(10, 'Введите номер телефона'),
      code: z.string().length(6, 'Код должен быть 6 цифр'),
    }).parse(req.body);

    const phone = normalizePhone(rawPhone);

    // Check phone isn't already used by another user
    const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (existing && existing.id !== req.userId) {
      return res.status(409).json({ error: 'Этот номер телефона уже используется', code: 'PHONE_TAKEN' });
    }

    // Find active OTP for this phone
    const activeOtp = await prisma.otpCode.findFirst({
      where: { phone, purpose: 'phone-change', used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!activeOtp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }
    if (activeOtp.code !== code) {
      await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { attempts: { increment: 1 } } });
      return res.status(400).json({ error: 'Неверный код подтверждения', code: 'INVALID_OTP' });
    }
    await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { used: true } });

    // Update phone number
    await prisma.user.update({
      where: { id: req.userId! },
      data: { phone, phoneVerified: true },
    });

    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? (req as any).ip ?? null;
    await prisma.securityEvent.create({
      data: { userId: req.userId!, action: 'PHONE_CHANGED', ip, details: `phone=${phone}` },
    });

    sendPushToUser(req.userId!, {
      title: 'Номер телефона изменён',
      body: `К аккаунту привязан новый номер. Если это не вы — смените пароль.`,
      data: { url: 'irongym://profile/security' },
    }).catch(() => {});

    res.json({ ok: true, phone, phoneVerified: true });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /user/change-phone:', e);
    res.status(500).json({ error: 'Ошибка смены номера телефона' });
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
