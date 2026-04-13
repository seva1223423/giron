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
import { sendPushToUser } from '../services/pushService';

const router = Router();

// ── Security event logger ─────────────────────────────────────────────────────

async function logSecurityEvent(
  action: string,
  userId?: string | null,
  req?: Request,
  details?: string,
): Promise<void> {
  try {
    const ip = req
      ? ((req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? (req as any).ip ?? null)
      : null;
    const userAgent = req ? ((req.headers['user-agent'] as string | undefined) ?? null) : null;
    await prisma.securityEvent.create({ data: { userId: userId ?? null, action, ip, userAgent, details: details ?? null } });
  } catch { /* non-critical — never throw */ }
}

const MAX_OTP_ATTEMPTS = 5;

const GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID_WEB,
  process.env.GOOGLE_CLIENT_ID_IOS,
  process.env.GOOGLE_CLIENT_ID_ANDROID,
].filter(Boolean) as string[];

const googleClient = new OAuth2Client();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Dummy hash for timing-safe login (prevents user enumeration via response time)
const DUMMY_HASH = '$2b$12$invalidhashfortimingsafety.........................................';

async function timingSafeLogin(): Promise<void> {
  // Consume roughly the same time as a real bcrypt.compare regardless of user existence
  await bcrypt.compare('dummy', DUMMY_HASH).catch(() => {});
}

async function signTokens(userId: string, req?: Request) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  const rawRefresh = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '30d' });
  const ip = req
    ? ((req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? (req as any).ip ?? null)
    : null;
  const userAgent = req ? ((req.headers['user-agent'] as string | undefined) ?? null) : null;
  await prisma.refreshToken.create({
    data: {
      token: rawRefresh,
      userId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ip,
      userAgent,
    },
  });
  return { token, refreshToken: rawRefresh };
}

function safeUser(user: any) {
  const { passwordHash, googleId, vkId, ...rest } = user;
  return rest;
}

// ── Email verification helper ─────────────────────────────────────────────────

// ── Password history helpers ──────────────────────────────────────────────────

const PASSWORD_HISTORY_DEPTH = 3;

async function checkPasswordHistory(userId: string, newPassword: string): Promise<boolean> {
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

// ── Email verification helper ─────────────────────────────────────────────────

async function sendEmailVerificationOtp(email: string): Promise<void> {
  // Skip internal/placeholder addresses (VK users without real email)
  if (email.endsWith('@irongym.internal')) return;
  // Invalidate old unused codes
  await prisma.otpCode.updateMany({ where: { email, purpose: 'email-verify', used: false }, data: { used: true } });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await prisma.otpCode.create({ data: { email, code, purpose: 'email-verify', expiresAt } });
  await sendOtpEmail(email, code);
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Некорректный email'),
  password: z.string().min(8, 'Пароль минимум 8 символов'),
  firstName: z.string().min(1, 'Введите имя').max(100, 'Имя слишком длинное'),
  lastName: z.string().max(100, 'Фамилия слишком длинная').optional(),
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

    const { token, refreshToken } = await signTokens(user.id, req);

    // Send email verification OTP (non-blocking — don't fail registration if email fails)
    sendEmailVerificationOtp(user.email).catch((e) => logger.warn('Email verification send failed:', e.message));

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
      await timingSafeLogin(); // constant-time response to prevent email enumeration
      return res.status(401).json({ error: 'Неверный email или пароль', code: 'INVALID_CREDENTIALS' });
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
      await logSecurityEvent(shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAIL', user.id, req, `email=${data.email} attempts=${attempts}`);
      const attemptsLeft = Math.max(0, MAX_LOGIN_ATTEMPTS - attempts);
      return res.status(401).json({
        error: shouldLock
          ? `Слишком много попыток. Аккаунт заблокирован на ${LOCKOUT_MINUTES} мин.`
          : `Неверный email или пароль. Осталось попыток: ${attemptsLeft}`,
        code: 'INVALID_CREDENTIALS',
        attemptsLeft,
      });
    }

    // Reset lockout on success
    if (user.loginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({ where: { id: user.id }, data: { loginAttempts: 0, lockedUntil: null } });
    }

    const currentIp = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? (req as any).ip ?? null;
    await logSecurityEvent('LOGIN_SUCCESS', user.id, req, `email=${data.email}`);

    // Suspicious login: check if IP differs from most recent successful login
    if (currentIp) {
      const lastLogin = await prisma.securityEvent.findFirst({
        where: { userId: user.id, action: 'LOGIN_SUCCESS' },
        orderBy: { createdAt: 'desc' },
        skip: 1, // skip the one we just created
        select: { ip: true },
      });
      if (lastLogin?.ip && lastLogin.ip !== currentIp) {
        // Log suspicious login event and send push notification
        logSecurityEvent('SUSPICIOUS_LOGIN', user.id, req, `prev_ip=${lastLogin.ip} new_ip=${currentIp}`);
        sendPushToUser(user.id, {
          title: 'Новый вход в аккаунт',
          body: `Вход с нового IP-адреса: ${currentIp}. Если это не вы — смените пароль.`,
          data: { url: 'irongym://profile/security' },
        }).catch(() => {});
      }
    }

    const { token, refreshToken } = await signTokens(user.id, req);
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
    const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
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

    const { token, refreshToken } = await signTokens(user!.id, req);
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
    const { accessToken, userId: claimedVkUserId, email: vkEmail } = z.object({
      accessToken: z.string().min(1),
      userId: z.number().int().positive(),
      email: z.string().email().optional(),
    }).parse(req.body);

    if (!process.env.VK_APP_ID) {
      return res.status(503).json({ error: 'VK OAuth не настроен на сервере' });
    }

    let vkUser: any;
    try {
      // Omit user_ids to get the token owner's own profile — prevents user ID spoofing
      const params = new URLSearchParams({
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

    // Verify token owner matches the claimed userId
    if (vkUser.id !== claimedVkUserId) {
      logger.warn(`VK auth mismatch: claimed=${claimedVkUserId} actual=${vkUser.id} ip=${(req as any).ip}`);
      return res.status(401).json({ error: 'Токен VK не совпадает с указанным пользователем' });
    }

    const vkId = String(vkUser.id);
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

    const { token, refreshToken } = await signTokens(user!.id, req);
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

    const user = await prisma.user.findUnique({ where: { phone }, include: { healthRestrictions: true } });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь с таким номером не найден', code: 'PHONE_NOT_FOUND' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'BANNED', reason: user.banReason });
    }

    await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true, loginAttempts: 0, lockedUntil: null } });

    await logSecurityEvent('LOGIN_SUCCESS', user.id, req, `phone=${phone} method=sms_otp`);
    const { token, refreshToken } = await signTokens(user.id, req);
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
      purpose: z.enum(['register', 'login', 'phone-login', 'phone-reset', 'email-verify', 'phone-change']).default('register'),
    }).refine((d) => d.phone || d.email, { message: 'Укажите телефон или email' }).parse(req.body);

    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;

    // For phone-login and phone-reset: check that phone is registered
    if ((purpose === 'phone-login' || purpose === 'phone-reset') && phone) {
      const exists = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (!exists) {
        return res.status(404).json({ error: 'Пользователь с таким номером не найден', code: 'PHONE_NOT_FOUND' });
      }
    }

    // For 'register' and 'phone-change': check that phone is NOT already taken to avoid wasting SMS
    if ((purpose === 'register' || purpose === 'phone-change') && phone) {
      const taken = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
      if (taken) {
        return res.status(409).json({ error: 'Этот номер телефона уже зарегистрирован', code: 'PHONE_TAKEN' });
      }
    }

    // Cooldown: enforce 60-second minimum between OTP resend requests
    const cooldownSince = new Date(Date.now() - 60 * 1000);
    const recentOtp = await prisma.otpCode.findFirst({
      where: {
        ...(phone ? { phone } : { email }),
        purpose,
        createdAt: { gte: cooldownSince },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (recentOtp) {
      const secondsLeft = Math.ceil((recentOtp.createdAt.getTime() + 60 * 1000 - Date.now()) / 1000);
      return res.status(429).json({
        error: `Подождите ${secondsLeft} сек. перед повторной отправкой кода`,
        code: 'OTP_COOLDOWN',
        secondsLeft,
      });
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
      purpose: z.enum(['register', 'login', 'phone-login', 'phone-reset', 'email-verify', 'phone-change']).default('register'),
    }).parse(req.body);

    const phone = rawPhone ? normalizePhone(rawPhone) : undefined;

    // Find any active OTP for this phone/email+purpose (even wrong code) for brute-force check
    const activeOtp = await prisma.otpCode.findFirst({
      where: {
        ...(phone ? { phone } : { email }),
        purpose, used: false, expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeOtp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', valid: false });
    }

    if (activeOtp.attempts >= MAX_OTP_ATTEMPTS) {
      await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { used: true } });
      await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=${purpose} phone=${phone ?? ''} email=${email ?? ''}`);
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', valid: false });
    }

    if (activeOtp.code !== code) {
      await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { attempts: { increment: 1 } } });
      const attemptsLeft = MAX_OTP_ATTEMPTS - activeOtp.attempts - 1;
      return res.status(400).json({
        error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.',
        valid: false,
      });
    }

    // Correct code
    // For 'register', 'phone-reset', 'phone-change': leave OTP intact — dedicated endpoints will consume it
    // For all other purposes: mark used now
    if (purpose !== 'register' && purpose !== 'phone-reset' && purpose !== 'phone-change') {
      await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { used: true } });
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
    const { token, refreshToken: newRefreshToken } = await signTokens(payload.userId, req);
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
      password: z.string().min(8, 'Пароль минимум 8 символов'),
    }).parse(req.body);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Ссылка недействительна или истекла' });
    }

    if (await checkPasswordHistory(resetToken.userId, password)) {
      return res.status(400).json({ error: `Нельзя использовать один из последних ${PASSWORD_HISTORY_DEPTH} паролей`, code: 'PASSWORD_REUSED' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
    ]);
    await recordPasswordHistory(resetToken.userId, passwordHash);
    await logSecurityEvent('PASSWORD_CHANGE', resetToken.userId, req, 'method=email_reset');

    res.json({ message: 'Пароль успешно изменён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors[0].message });
    }
    logger.error(e);
    res.status(500).json({ error: 'Ошибка сброса пароля' });
  }
});

// ── Email verification ────────────────────────────────────────────────────────

/** POST /auth/verify-email — verify email with 6-digit OTP */
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { email, code } = z.object({
      email: z.string().email(),
      code: z.string().length(6),
    }).parse(req.body);

    // Find the active OTP for brute-force check
    const activeOtp = await prisma.otpCode.findFirst({
      where: { email, purpose: 'email-verify', used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!activeOtp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', valid: false });
    }

    if (activeOtp.attempts >= MAX_OTP_ATTEMPTS) {
      await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { used: true } });
      await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=email-verify email=${email}`);
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', valid: false });
    }

    if (activeOtp.code !== code) {
      await prisma.otpCode.update({ where: { id: activeOtp.id }, data: { attempts: { increment: 1 } } });
      const attemptsLeft = MAX_OTP_ATTEMPTS - activeOtp.attempts - 1;
      return res.status(400).json({
        error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.',
        valid: false,
      });
    }

    await prisma.$transaction([
      prisma.otpCode.update({ where: { id: activeOtp.id }, data: { used: true } }),
      prisma.user.updateMany({ where: { email, emailVerified: false }, data: { emailVerified: true } }),
    ]);

    // Look up userId for security log
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    await logSecurityEvent('EMAIL_VERIFIED', user?.id, req, `email=${email}`);

    res.json({ valid: true, emailVerified: true, message: 'Email подтверждён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    res.status(500).json({ error: 'Ошибка подтверждения' });
  }
});

/** POST /auth/resend-verification — resend email verification OTP */
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);

    if (email.endsWith('@irongym.internal')) {
      return res.status(400).json({ error: 'Email verification не поддерживается для этого аккаунта' });
    }
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
    if (!user) return res.json({ message: 'Если такой email зарегистрирован, письмо отправлено' });
    if (user.emailVerified) return res.json({ message: 'Email уже подтверждён' });

    // Rate limit: max 3 per hour
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await prisma.otpCode.count({ where: { email, purpose: 'email-verify', createdAt: { gte: since } } });
    if (recentCount >= 3) {
      return res.status(429).json({ error: 'Слишком много запросов. Попробуйте через час.' });
    }

    await sendEmailVerificationOtp(email);
    res.json({ message: 'Код подтверждения отправлен на ' + email });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/resend-verification:', e);
    res.status(500).json({ error: 'Не удалось отправить письмо' });
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
      password: z.string().min(8, 'Пароль минимум 8 символов'),
    }).parse(req.body);

    const phone = normalizePhone(rawPhone);

    const otp = await prisma.otpCode.findFirst({
      where: { phone, code, purpose: 'phone-reset', used: false, expiresAt: { gte: new Date() } },
    });

    if (!otp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });
    }

    if (await checkPasswordHistory(user.id, password)) {
      return res.status(400).json({ error: `Нельзя использовать один из последних ${PASSWORD_HISTORY_DEPTH} паролей`, code: 'PASSWORD_REUSED' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, loginAttempts: 0, lockedUntil: null } }),
      prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } }),
      // Revoke all active refresh tokens (security: force re-login)
      prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
    ]);
    await recordPasswordHistory(user.id, passwordHash);

    await logSecurityEvent('PASSWORD_CHANGE', user.id, req, 'method=phone_reset');
    res.json({ message: 'Пароль успешно изменён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/reset-password-by-phone:', e);
    res.status(500).json({ error: 'Ошибка сброса пароля' });
  }
});

export { router as authRouter };
