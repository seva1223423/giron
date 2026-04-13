import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { sendPasswordResetEmail, sendOtpEmail } from '../services/emailService';
import { sendSmsOtp, normalizePhone } from '../services/smsService';

const router = Router();

const GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID_WEB,
  process.env.GOOGLE_CLIENT_ID_IOS,
  process.env.GOOGLE_CLIENT_ID_ANDROID,
].filter(Boolean) as string[];

const googleClient = new OAuth2Client();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

async function signTokens(userId: string) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  const rawRefresh = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '30d' });
  await prisma.refreshToken.create({
    data: { token: rawRefresh, userId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });
  return { token, refreshToken: rawRefresh };
}

function safeUser(user: any) {
  const { passwordHash, googleId, vkId, ...rest } = user;
  return rest;
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(6, 'Пароль минимум 6 символов'),
  firstName: z.string().min(1, 'Введите имя'),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  otpToken: z.string().optional(), // token returned by /auth/verify-otp
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ── Register ──────────────────────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    const phone = data.phone ? normalizePhone(data.phone) : undefined;

    // Validate OTP if phone provided
    let phoneVerified = false;
    if (phone && data.otpToken) {
      const otp = await prisma.otpCode.findFirst({
        where: { phone, code: data.otpToken, purpose: 'register', used: false, expiresAt: { gte: new Date() } },
      });
      if (otp) {
        await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
        phoneVerified = true;
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone,
        phoneVerified,
        emailVerified: false,
      },
    });

    const { token, refreshToken } = await signTokens(user.id);

    res.status(201).json({
      user: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: user.role, phone: user.phone, emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified, createdAt: user.createdAt,
      },
      token,
      refreshToken,
    });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors[0].message });
    }
    logger.error(e);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// ── Login ────────────────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { healthRestrictions: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Аккаунт с таким email не найден', code: 'EMAIL_NOT_FOUND' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'BANNED', reason: user.banReason });
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({
        error: `Аккаунт временно заблокирован. Попробуйте через ${minutesLeft} мин.`,
        code: 'ACCOUNT_LOCKED',
        lockedUntil: user.lockedUntil,
      });
    }

    // Social-only user
    if (!user.passwordHash) {
      return res.status(401).json({
        error: 'Этот аккаунт создан через соцсеть. Войдите через Google или VK.',
        code: 'SOCIAL_ONLY',
      });
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      const attempts = user.loginAttempts + 1;
      const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginAttempts: attempts,
          ...(shouldLock ? { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) } : {}),
        },
      });
      const attemptsLeft = Math.max(0, MAX_LOGIN_ATTEMPTS - attempts);
      return res.status(401).json({
        error: shouldLock
          ? `Слишком много попыток. Аккаунт заблокирован на ${LOCKOUT_MINUTES} мин.`
          : `Неверный пароль. Осталось попыток: ${attemptsLeft}`,
        code: 'WRONG_PASSWORD',
        attemptsLeft,
      });
    }

    // Reset lockout on success
    if (user.loginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { loginAttempts: 0, lockedUntil: null } });
    }

    const { token, refreshToken } = await signTokens(user.id);
    const { passwordHash, googleId, vkId, ...userWithoutSecrets } = user as any;
    res.json({ user: userWithoutSecrets, token, refreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors[0].message });
    }
    logger.error(e);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// ── Check email ───────────────────────────────────────────────────────────────

/** POST /auth/check-email — returns auth methods available for an email */
router.post('/check-email', async (req: Request, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, googleId: true, passwordHash: true, vkId: true },
    });
    if (!user) return res.json({ exists: false });
    res.json({
      exists: true,
      hasPassword: !!user.passwordHash,
      hasGoogle: !!user.googleId,
      hasVk: !!(user as any).vkId,
    });
  } catch {
    res.json({ exists: false });
  }
});

/** POST /auth/check-phone — check if phone is registered */
router.post('/check-phone', async (req: Request, res: Response) => {
  try {
    const { phone: rawPhone } = z.object({ phone: z.string().min(10) }).parse(req.body);
    const phone = normalizePhone(rawPhone);
    const user = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
    res.json({ exists: !!user, phone });
  } catch {
    res.json({ exists: false });
  }
});

// ── Google Auth ───────────────────────────────────────────────────────────────

/** POST /auth/google — verify Google ID token, find or create user */
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken } = z.object({ idToken: z.string().min(1) }).parse(req.body);

    if (GOOGLE_CLIENT_IDS.length === 0) {
      return res.status(503).json({ error: 'Google OAuth не настроен на сервере' });
    }

    let payload: any;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_IDS,
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'Недействительный Google токен' });
    }

    if (!payload?.sub || !payload?.email) {
      return res.status(401).json({ error: 'Не удалось получить данные из Google' });
    }

    const googleId = payload.sub as string;
    const email = payload.email as string;
    const firstName = (payload.given_name as string) || (payload.name as string)?.split(' ')[0] || 'Пользователь';
    const lastName = (payload.family_name as string) || undefined;
    const avatarUrl = (payload.picture as string) || undefined;

    // Find by googleId or email
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
      include: { healthRestrictions: true },
    });

    if (user) {
      // Link google if not linked yet
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId, emailVerified: true, avatarUrl: avatarUrl || user.avatarUrl || undefined },
          include: { healthRestrictions: true },
        }) as any;
      }
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          firstName,
          lastName,
          avatarUrl,
          emailVerified: true,
          // passwordHash is null — Google-only user
        },
        include: { healthRestrictions: true },
      }) as any;
    }

    if (user!.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'BANNED', reason: user!.banReason });
    }

    const { token, refreshToken } = await signTokens(user!.id);
    res.json({ user: safeUser(user), token, refreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/google:', e);
    res.status(500).json({ error: 'Ошибка авторизации через Google' });
  }
});

// ── VK Auth ───────────────────────────────────────────────────────────────────

router.post('/vk', async (req: Request, res: Response) => {
  try {
    const { accessToken, userId: vkUserId, email: vkEmail } = z.object({
      accessToken: z.string().min(1),
      userId: z.number().int().positive(),
      email: z.string().email().optional(),
    }).parse(req.body);

    if (!process.env.VK_APP_ID) {
      return res.status(503).json({ error: 'VK OAuth не настроен на сервере' });
    }

    let vkUser: any;
    try {
      const params = new URLSearchParams({
        user_ids: String(vkUserId),
        fields: 'photo_200',
        access_token: accessToken,
        v: '5.199',
      });
      const resp = await fetch(`https://api.vk.com/method/users.get?${params}`);
      const data = await resp.json() as any;
      if (data.error) throw new Error(data.error.error_msg);
      vkUser = data.response?.[0];
    } catch (e: any) {
      return res.status(401).json({ error: 'Не удалось получить данные из VK: ' + e.message });
    }

    if (!vkUser) return res.status(401).json({ error: 'Пользователь VK не найден' });

    const vkId = String(vkUserId);
    const firstName = vkUser.first_name || 'Пользователь';
    const lastName = vkUser.last_name || undefined;
    const avatarUrl = vkUser.photo_200 || undefined;

    let user = await prisma.user.findFirst({
      where: { OR: [{ vkId }, ...(vkEmail ? [{ email: vkEmail }] : [])] },
      include: { healthRestrictions: true },
    });

    if (user) {
      if (!user.vkId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { vkId, avatarUrl: avatarUrl || user.avatarUrl || undefined },
          include: { healthRestrictions: true },
        }) as any;
      }
    } else {
      const email = vkEmail || `vk_${vkId}@irongym.internal`;
      user = await prisma.user.create({
        data: { email, vkId, firstName, lastName, avatarUrl, emailVerified: !!vkEmail },
        include: { healthRestrictions: true },
      }) as any;
    }

    if (user!.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'BANNED', reason: user!.banReason });
    }

    const { token, refreshToken } = await signTokens(user!.id);
    res.json({ user: safeUser(user), token, refreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/vk:', e);
    res.status(500).json({ error: 'Ошибка авторизации через VK' });
  }
});

// ── Login by phone (OTP) ──────────────────────────────────────────────────────

router.post('/login-by-phone', async (req: Request, res: Response) => {
  try {
    const { phone: rawPhone, code } = z.object({
      phone: z.string().min(10, 'Введите номер телефона'),
      code: z.string().length(6, 'Код должен быть 6 цифр'),
    }).parse(req.body);

    const phone = normalizePhone(rawPhone);

    const otp = await prisma.otpCode.findFirst({
      where: { phone, code, purpose: 'phone-login', used: false, expiresAt: { gte: new Date() } },
    });

    if (!otp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }

    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });

    const user = await prisma.user.findFirst({ where: { phone }, include: { healthRestrictions: true } });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь с таким номером не найден', code: 'PHONE_NOT_FOUND' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'BANNED', reason: user.banReason });
    }

    await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true, loginAttempts: 0, lockedUntil: null } });

    const { token, refreshToken } = await signTokens(user.id);
    const { passwordHash, googleId, vkId, ...rest } = user as any;
    res.json({ user: rest, token, refreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error(e);
    res.status(500).json({ error: 'Ошибка входа по телефону' });
  }
});

// ── OTP — send code ───────────────────────────────────────────────────────────

/** POST /auth/send-otp — send 6-digit OTP via SMS (phone) or email */
router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone: rawPhone, email, purpose } = z.object({
      phone: z.string().optional(),
      email: z.string().email().optional(),
      purpose: z.enum(['register', 'login', 'phone-login', 'phone-reset']).default('register'),
    }).refine((d) => d.phone || d.email, { message: 'Укажите телефон или email' }).parse(req.body);

    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;

    // For phone-login and phone-reset: check that phone is registered
    if ((purpose === 'phone-login' || purpose === 'phone-reset') && phone) {
      const exists = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
      if (!exists) {
        return res.status(404).json({ error: 'Пользователь с таким номером не найден', code: 'PHONE_NOT_FOUND' });
      }
    }

    // Rate limit: max 3 active OTPs in last 10 minutes per phone/email
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const recentCount = await prisma.otpCode.count({
      where: {
        OR: [
          phone ? { phone } : {},
          email ? { email } : {},
        ],
        createdAt: { gte: since },
        used: false,
      },
    });
    if (recentCount >= 3) {
      return res.status(429).json({ error: 'Слишком много запросов. Подождите 10 минут.' });
    }

    // Invalidate old unused codes
    if (phone) {
      await prisma.otpCode.updateMany({ where: { phone, purpose, used: false }, data: { used: true } });
    } else {
      await prisma.otpCode.updateMany({ where: { email, purpose, used: false }, data: { used: true } });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.otpCode.create({
      data: { phone, email, code, purpose, expiresAt },
    });

    if (phone) {
      await sendSmsOtp(phone, code);
    } else {
      await sendOtpEmail(email!, code);
    }

    res.json({ message: phone ? `Код отправлен на ${phone}` : `Код отправлен на ${email}` });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/send-otp:', e);
    res.status(500).json({ error: 'Не удалось отправить код' });
  }
});

// ── OTP — verify code ─────────────────────────────────────────────────────────

/** POST /auth/verify-otp — verify OTP. For 'register' purpose, keeps OTP alive for /register to consume. */
router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone: rawPhone, email, code, purpose } = z.object({
      phone: z.string().optional(),
      email: z.string().email().optional(),
      code: z.string().length(6),
      purpose: z.enum(['register', 'login', 'phone-login', 'phone-reset']).default('register'),
    }).parse(req.body);

    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;

    const otp = await prisma.otpCode.findFirst({
      where: {
        ...(phone ? { phone } : { email }),
        code, purpose, used: false, expiresAt: { gte: new Date() },
      },
    });

    if (!otp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', valid: false });
    }

    // For 'register' and 'phone-reset': leave OTP intact — dedicated endpoints will consume it
    // For all other purposes: mark used now
    if (purpose !== 'register' && purpose !== 'phone-reset') {
      await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
    }

    res.json({ valid: true, message: 'Код подтверждён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    res.status(500).json({ error: 'Ошибка проверки кода' });
  }
});

// ── Refresh token ─────────────────────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token обязателен' });

    let payload: { userId: string };
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { userId: string };
    } catch {
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }

    // Check DB: token must exist and not be revoked
    const dbToken = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!dbToken || dbToken.revoked || dbToken.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Refresh token отозван или истёк' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, isBanned: true } });
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    if (user.isBanned) return res.status(403).json({ error: 'Аккаунт заблокирован' });

    // Rotate: revoke old token, issue new
    await prisma.refreshToken.update({ where: { id: dbToken.id }, data: { revoked: true } });
    const { token, refreshToken: newRefreshToken } = await signTokens(payload.userId);
    res.json({ token, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Недействительный refresh token' });
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.updateMany({ where: { token: refreshToken, revoked: false }, data: { revoked: true } });
    }
    res.json({ message: 'Выход выполнен' });
  } catch {
    res.json({ message: 'Выход выполнен' });
  }
});

// ── Forgot password ───────────────────────────────────────────────────────────

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.json({ message: 'Если такой email зарегистрирован, письмо отправлено' });
    }

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    await sendPasswordResetEmail(email, token);

    res.json({ message: 'Если такой email зарегистрирован, письмо отправлено' });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: 'Некорректный email' });
    }
    logger.error(e);
    res.status(500).json({ error: 'Ошибка отправки письма' });
  }
});

// ── Reset password ────────────────────────────────────────────────────────────

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = z.object({
      token: z.string().min(1),
      password: z.string().min(6, 'Пароль минимум 6 символов'),
    }).parse(req.body);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Ссылка недействительна или истекла' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    res.json({ message: 'Пароль успешно изменён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors[0].message });
    }
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сброса пароля' });
  }
});

// ── Reset password by phone (OTP) ────────────────────────────────────────────

/**
 * POST /auth/reset-password-by-phone
 * Verify a 'phone-reset' OTP and set a new password.
 */
router.post('/reset-password-by-phone', async (req: Request, res: Response) => {
  try {
    const { phone: rawPhone, code, password } = z.object({
      phone: z.string().min(10, 'Введите номер телефона'),
      code: z.string().length(6, 'Код должен быть 6 цифр'),
      password: z.string().min(6, 'Пароль минимум 6 символов'),
    }).parse(req.body);

    const phone = normalizePhone(rawPhone);

    const otp = await prisma.otpCode.findFirst({
      where: { phone, code, purpose: 'phone-reset', used: false, expiresAt: { gte: new Date() } },
    });

    if (!otp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }

    const user = await prisma.user.findFirst({ where: { phone } });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, loginAttempts: 0, lockedUntil: null } }),
      prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } }),
      // Revoke all active refresh tokens (security: force re-login)
      prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
    ]);

    res.json({ message: 'Пароль успешно изменён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/reset-password-by-phone:', e);
    res.status(500).json({ error: 'Ошибка сброса пароля' });
  }
});

export { router as authRouter };
