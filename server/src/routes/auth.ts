import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { TOTP, Secret } from 'otpauth';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { sendPasswordResetEmail, sendOtpEmail, sendNewLoginAlert, sendPasswordChangedAlert } from '../services/emailService';
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
    // Use req.ip which respects Express trust-proxy setting (TRUST_PROXY env var).
    // Do NOT fall back to raw X-Forwarded-For — it's attacker-controlled without trust proxy.
    const ip = req ? ((req as any).ip ?? null) : null;
    const userAgent = req ? ((req.headers['user-agent'] as string | undefined) ?? null) : null;
    await prisma.securityEvent.create({ data: { userId: userId ?? null, action, ip, userAgent, details: details ?? null } });
  } catch { /* non-critical — never throw */ }
}

const MAX_OTP_ATTEMPTS = 5;

/** Prevent TOTP replay: check if code was used within the validity window, then record it. Returns true if replay. */
async function isTotpReplay(userId: string, code: string): Promise<boolean> {
  const since = new Date(Date.now() - 90 * 1000); // window=1 → ±1 period = 90s
  const existing = await prisma.usedTotpCode.findFirst({
    where: { userId, code, usedAt: { gte: since } },
    select: { id: true },
  });
  if (existing) return true;
  await prisma.usedTotpCode.create({ data: { userId, code } });
  return false;
}

const GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID_WEB,
  process.env.GOOGLE_CLIENT_ID_IOS,
  process.env.GOOGLE_CLIENT_ID_ANDROID,
].filter(Boolean) as string[];

const googleClient = new OAuth2Client();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// Dummy hash for timing-safe login (prevents user enumeration via response time).
// Pre-generated with bcrypt.hashSync('__dummy__', 12) — must be a valid bcrypt hash so
// bcryptjs actually runs the full Blowfish key schedule instead of fast-failing on invalid chars.
const DUMMY_HASH = '$2a$12$NsgJ3XkMf98y7VvWVpIChOMWoTvXNOWNpZA9Zp5TDQ0ZMfepGoPn2';

async function timingSafeLogin(): Promise<void> {
  // Always perform a real bcrypt comparison to consume the same time as a valid password check
  await bcrypt.compare('__dummy__', DUMMY_HASH).catch(() => {});
}

/** Check if login IP/device differs from last known — sends push + logs SUSPICIOUS_LOGIN if so */
async function checkSuspiciousLogin(userId: string, req: Request, userEmail?: string | null, emailVerified?: boolean): Promise<void> {
  const currentIp = (req as any).ip ?? null;
  const currentUa = req.headers['user-agent'] ?? null;
  try {
    const lastLogin = await prisma.securityEvent.findFirst({
      where: { userId, action: 'LOGIN_SUCCESS' },
      orderBy: { createdAt: 'desc' },
      skip: 1,
      select: { ip: true, userAgent: true },
    });
    if (!lastLogin) return; // first ever login — no alert
    const isNewIp = currentIp && lastLogin.ip && lastLogin.ip !== currentIp;
    const isNewDevice = currentUa && lastLogin.userAgent && lastLogin.userAgent !== currentUa;
    if (isNewIp || isNewDevice) {
      logSecurityEvent('SUSPICIOUS_LOGIN', userId, req, `prev_ip=${lastLogin.ip} new_ip=${currentIp}`);
      const alertMsg = isNewIp
        ? `Вход с нового IP-адреса: ${currentIp}. Если это не вы — смените пароль.`
        : `Вход с нового устройства. Если это не вы — смените пароль.`;
      sendPushToUser(userId, {
        title: 'Новый вход в аккаунт',
        body: alertMsg,
        data: { url: 'irongym://profile/security' },
      }).catch(() => {});
      if (userEmail && emailVerified && currentIp) {
        sendNewLoginAlert(userEmail, currentIp, currentUa, new Date()).catch(() => {});
      }
    }
  } catch {
    // non-critical — don't fail the login
  }
}

const JWT_ISS = 'irongym-api';
const JWT_AUD = 'irongym-app';

const MAX_SESSIONS_PER_USER = 10;

async function signTokens(userId: string, req?: Request) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '15m', issuer: JWT_ISS, audience: JWT_AUD });
  const rawRefresh = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '30d', issuer: JWT_ISS, audience: JWT_AUD });
  const ip = req ? ((req as any).ip ?? null) : null;
  const userAgent = req ? ((req.headers['user-agent'] as string | undefined) ?? null) : null;

  // Enforce max sessions per user: revoke oldest active sessions if limit exceeded
  const activeSessions = await prisma.refreshToken.findMany({
    where: { userId, revoked: false, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
    take: MAX_SESSIONS_PER_USER + 5,
  });
  if (activeSessions.length >= MAX_SESSIONS_PER_USER) {
    const toRevoke = activeSessions.slice(0, activeSessions.length - MAX_SESSIONS_PER_USER + 1);
    await prisma.refreshToken.updateMany({
      where: { id: { in: toRevoke.map((s) => s.id) } },
      data: { revoked: true },
    });
  }

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
  const { passwordHash, googleId, vkId, yandexId, totpSecret, totpBackupCodes, ...rest } = user;
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
    take: PASSWORD_HISTORY_DEPTH + 10,
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

const strongPassword = z
  .string()
  .min(8, 'Пароль минимум 8 символов')
  .refine((p) => /[A-Z]/.test(p), { message: 'Пароль должен содержать хотя бы одну заглавную букву' })
  .refine((p) => /[a-z]/.test(p), { message: 'Пароль должен содержать хотя бы одну строчную букву' })
  .refine((p) => /[0-9]/.test(p), { message: 'Пароль должен содержать хотя бы одну цифру' });

const registerSchema = z.object({
  email: z.string().email('Некорректный email').max(254, 'Email слишком длинный'),
  password: strongPassword,
  firstName: z.string().min(1, 'Введите имя').max(100, 'Имя слишком длинное'),
  lastName: z.string().max(100, 'Фамилия слишком длинная').optional(),
  phone: z.string().optional(),
  otpToken: z.string().optional(), // token returned by /auth/verify-otp
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().max(1000), // prevent bcrypt DoS (bcrypt truncates at 72 chars anyway)
  deviceToken: z.string().optional(), // trusted device token for skipping TOTP
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
        await prisma.otpCode.updateMany({ where: { id: otp.id }, data: { used: true } });
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

    await logSecurityEvent('REGISTER', user.id, req, `email=${user.email}`);

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
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
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
        error: 'Этот аккаунт создан через соцсеть. Войдите через VK или Яндекс.',
        code: 'SOCIAL_ONLY',
      });
    }

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) {
      // Increment first, then decide based on the actual post-increment value to avoid TOCTOU
      // under concurrent requests (two threads reading the same stale count could both skip lock)
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: { increment: 1 } },
        select: { loginAttempts: true },
      });
      const attempts = updated.loginAttempts;
      const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;
      if (shouldLock) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) },
        });
      }
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

    // TOTP 2FA gate — if enabled, check for trusted device token first
    if ((user as any).totpEnabled && (user as any).totpSecret) {
      let skipTotp = false;
      if (data.deviceToken) {
        const tokenHash = crypto.createHash('sha256').update(data.deviceToken).digest('hex');
        const trusted = await prisma.trustedDevice.findFirst({
          where: { tokenHash, userId: user.id, expiresAt: { gte: new Date() } },
        });
        skipTotp = !!trusted;
      }
      if (!skipTotp) {
        const pendingToken = jwt.sign(
          { userId: user.id, phase: 'totp' },
          process.env.JWT_SECRET!,
          { expiresIn: '5m', issuer: JWT_ISS, audience: JWT_AUD },
        );
        return res.json({ requiresTOTP: true, pendingToken });
      }
      // Trusted device: fall through to normal login below
      await logSecurityEvent('LOGIN_SUCCESS', user.id, req, `email=${data.email} method=trusted_device`);
      const { token: tk, refreshToken: rt } = await signTokens(user.id, req);
      const { passwordHash: ph, googleId: gi, vkId: vi, yandexId: yi, ...uwsTrusted } = user as any;
      return res.json({ user: uwsTrusted, token: tk, refreshToken: rt });
    }

    await logSecurityEvent('LOGIN_SUCCESS', user.id, req, `email=${data.email}`);
    checkSuspiciousLogin(user.id, req, user.email, user.emailVerified).catch(() => {});

    const { token, refreshToken } = await signTokens(user.id, req);
    const { passwordHash, googleId, vkId, yandexId, ...userWithoutSecrets } = user as any;
    res.json({ user: userWithoutSecrets, token, refreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors[0].message });
    }
    logger.error(e);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// ── TOTP 2FA verify ───────────────────────────────────────────────────────────

/**
 * POST /auth/totp-verify — verify TOTP code after password login gate
 * Accepts a short-lived pendingToken (5min) returned when 2FA is required
 */
router.post('/totp-verify', async (req: Request, res: Response) => {
  try {
    const { pendingToken, code, backupCode, rememberDevice } = z.object({
      pendingToken: z.string().min(1),
      code: z.string().length(6).optional(),
      backupCode: z.string().min(1).optional(),
      rememberDevice: z.boolean().optional().default(false),
    }).refine((d) => d.code || d.backupCode, { message: 'Введите код или резервный код' }).parse(req.body);

    // Verify pending token
    let payload: { userId: string; phase: string };
    try {
      payload = jwt.verify(pendingToken, process.env.JWT_SECRET!, { issuer: JWT_ISS, audience: JWT_AUD }) as any;
    } catch {
      return res.status(401).json({ error: 'Токен истёк. Войдите снова.', code: 'PENDING_TOKEN_EXPIRED' });
    }

    if (payload.phase !== 'totp') {
      return res.status(401).json({ error: 'Недействительный токен', code: 'INVALID_TOKEN' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { healthRestrictions: true },
    });

    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    if (user.isBanned) return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
    if (!(user as any).totpEnabled || !(user as any).totpSecret) {
      return res.status(400).json({ error: '2FA не включена', code: 'TOTP_NOT_ENABLED' });
    }

    // Verify TOTP code or backup code
    if (backupCode) {
      // Backup code flow
      let rawBackupCodes: Array<{ hash: string; used: boolean }>;
      try { rawBackupCodes = JSON.parse((user as any).totpBackupCodes || '[]'); } catch { rawBackupCodes = []; }
      const codeHash = crypto.createHash('sha256').update(backupCode.toUpperCase()).digest('hex');
      const matchIdx = rawBackupCodes.findIndex((c) => c.hash === codeHash && !c.used);
      if (matchIdx === -1) {
        await logSecurityEvent('LOGIN_FAIL', user.id, req, 'backup_code_invalid');
        return res.status(401).json({ error: 'Резервный код недействителен или уже использован', code: 'INVALID_BACKUP_CODE' });
      }
      rawBackupCodes[matchIdx].used = true;
      await prisma.user.update({ where: { id: user.id }, data: { totpBackupCodes: JSON.stringify(rawBackupCodes) } });
      await logSecurityEvent('LOGIN_SUCCESS', user.id, req, 'method=backup_code');
    } else {
      // TOTP code flow
      const totp = new TOTP({
        secret: Secret.fromBase32((user as any).totpSecret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      });
      const delta = totp.validate({ token: code!, window: 1 });
      if (delta === null) {
        await logSecurityEvent('LOGIN_FAIL', user.id, req, 'totp_invalid');
        return res.status(401).json({ error: 'Неверный код. Проверьте время на устройстве.', code: 'INVALID_TOTP' });
      }
      if (await isTotpReplay(user.id, code!)) {
        await logSecurityEvent('LOGIN_FAIL', user.id, req, 'totp_replayed');
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
      await logSecurityEvent('LOGIN_SUCCESS', user.id, req, 'method=totp');
    }

    const currentUa = req.headers['user-agent'] ?? null;
    const currentIp = (req as any).ip ?? null;
    checkSuspiciousLogin(user.id, req, user.email, user.emailVerified).catch(() => {});

    const { token, refreshToken } = await signTokens(user.id, req);

    // Remember this device: generate a plain device token, store its SHA256 hash in DB
    let deviceToken: string | undefined;
    if (rememberDevice) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await prisma.trustedDevice.create({
        data: {
          tokenHash,
          userId: user.id,
          userAgent: currentUa,
          ip: currentIp,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });
      deviceToken = rawToken;
    }

    const { passwordHash, googleId, vkId, yandexId, totpSecret, ...userWithoutSecrets } = user as any;
    res.json({ user: userWithoutSecrets, token, refreshToken, ...(deviceToken ? { deviceToken } : {}) });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/totp-verify:', e);
    res.status(500).json({ error: 'Ошибка проверки кода' });
  }
});

// ── Check email ───────────────────────────────────────────────────────────────

/** POST /auth/check-email — returns auth methods available for an email */
router.post('/check-email', async (req: Request, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, googleId: true, passwordHash: true, vkId: true, yandexId: true },
    });
    if (!user) return res.json({ exists: false });
    res.json({
      exists: true,
      hasPassword: !!user.passwordHash,
      hasGoogle: !!user.googleId,
      hasVk: !!user.vkId,
      hasYandex: !!user.yandexId,
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

// ── Social auth 2FA gate helper ───────────────────────────────────────────────

/**
 * If the user has TOTP enabled, check for a trusted device token.
 * Returns { requiresTOTP: true, pendingToken } if TOTP is required, null otherwise.
 */
async function checkSocialAuthTotpGate(
  user: any,
  deviceToken: string | undefined,
): Promise<{ requiresTOTP: true; pendingToken: string } | null> {
  if (!user.totpEnabled || !user.totpSecret) return null;
  if (deviceToken) {
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    const trusted = await prisma.trustedDevice.findFirst({
      where: { tokenHash, userId: user.id, expiresAt: { gte: new Date() } },
    });
    if (trusted) return null;
  }
  const pendingToken = jwt.sign(
    { userId: user.id, phase: 'totp' },
    process.env.JWT_SECRET!,
    { expiresIn: '5m', issuer: JWT_ISS, audience: JWT_AUD },
  );
  return { requiresTOTP: true, pendingToken };
}

// ── Google Auth ───────────────────────────────────────────────────────────────

/** POST /auth/google — verify Google ID token, find or create user */
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { idToken, deviceToken } = z.object({
      idToken: z.string().min(1),
      deviceToken: z.string().optional(),
    }).parse(req.body);

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
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
    }

    const totpGate = await checkSocialAuthTotpGate(user!, deviceToken);
    if (totpGate) {
      await logSecurityEvent('LOGIN_TOTP_REQUIRED', user!.id, req, 'method=google');
      return res.json(totpGate);
    }

    const { token, refreshToken } = await signTokens(user!.id, req);
    await logSecurityEvent('LOGIN_SUCCESS', user!.id, req, 'method=google');
    checkSuspiciousLogin(user!.id, req, user!.email, user!.emailVerified).catch(() => {});
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
    const { accessToken, userId: claimedVkUserId, email: vkEmail, deviceToken } = z.object({
      accessToken: z.string().min(1),
      userId: z.number().int().positive(),
      email: z.string().email().optional(),
      deviceToken: z.string().optional(),
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

    // SECURITY: Only look up by vkId — never by email.
    // VK does not return email via the users.get API; vkEmail comes from the client payload
    // and cannot be trusted. Auto-linking by a client-supplied email would let any VK user
    // claim an arbitrary email address and take over the matching Iron Gym account.
    let user = await prisma.user.findFirst({
      where: { vkId },
      include: { healthRestrictions: true },
    });

    if (!user) {
      // New VK user — create account. If vkEmail was provided by the client, store it
      // but never mark it as verified (VK doesn't prove email ownership server-side).
      const email = vkEmail || `vk_${vkId}@irongym.internal`;
      user = await prisma.user.create({
        data: { email, vkId, firstName, lastName, avatarUrl, emailVerified: false },
        include: { healthRestrictions: true },
      }) as any;
    }

    if (user!.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
    }

    const totpGate = await checkSocialAuthTotpGate(user!, deviceToken);
    if (totpGate) {
      await logSecurityEvent('LOGIN_TOTP_REQUIRED', user!.id, req, 'method=vk');
      return res.json(totpGate);
    }

    const { token, refreshToken } = await signTokens(user!.id, req);
    await logSecurityEvent('LOGIN_SUCCESS', user!.id, req, 'method=vk');
    checkSuspiciousLogin(user!.id, req, user!.email, user!.emailVerified).catch(() => {});
    res.json({ user: safeUser(user), token, refreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/vk:', e);
    res.status(500).json({ error: 'Ошибка авторизации через VK' });
  }
});

// ── Yandex Auth ──────────────────────────────────────────────────────────────

/**
 * POST /auth/yandex
 * Exchange a Yandex OAuth access token for Iron Gym JWT tokens.
 * The client obtains the Yandex token via OAuth 2.0 (WebBrowser or Yandex SDK),
 * then sends it here for server-side validation.
 */
router.post('/yandex', async (req: Request, res: Response) => {
  try {
    const { accessToken, deviceToken } = z.object({
      accessToken: z.string().min(1, 'Yandex access token обязателен'),
      deviceToken: z.string().optional(),
    }).parse(req.body);

    if (!process.env.YANDEX_CLIENT_ID) {
      return res.status(503).json({ error: 'Yandex OAuth не настроен на сервере' });
    }

    // Validate token with Yandex API
    let yandexUser: any;
    try {
      const resp = await fetch('https://login.yandex.ru/info?format=json', {
        headers: { Authorization: `OAuth ${accessToken}` },
      });
      if (!resp.ok) throw new Error(`Yandex API error: ${resp.status}`);
      yandexUser = await resp.json();
    } catch (e: any) {
      return res.status(401).json({ error: 'Не удалось проверить Yandex токен: ' + e.message });
    }

    if (!yandexUser?.id) return res.status(401).json({ error: 'Пользователь Яндекса не найден' });

    // Verify token was issued for our app (prevents token injection from other Yandex apps)
    if (yandexUser.client_id && yandexUser.client_id !== process.env.YANDEX_CLIENT_ID) {
      logger.warn(`[SECURITY] Yandex token client_id mismatch: expected=${process.env.YANDEX_CLIENT_ID} got=${yandexUser.client_id}`);
      return res.status(401).json({ error: 'Токен выдан для другого приложения' });
    }

    const yandexId = String(yandexUser.id);
    const firstName = yandexUser.first_name || yandexUser.display_name || 'Пользователь';
    const lastName = yandexUser.last_name || undefined;
    // Use the user's default Yandex email (yandex.ru or custom domain) — Yandex has verified it
    const yandexEmail: string | undefined = yandexUser.default_email || undefined;
    const avatarId = yandexUser.default_avatar_id;
    const avatarUrl = avatarId && avatarId !== '0' ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200` : undefined;

    // Find existing user by yandexId or email
    let user = await prisma.user.findFirst({
      where: { OR: [{ yandexId }, ...(yandexEmail ? [{ email: yandexEmail }] : [])] },
      include: { healthRestrictions: true },
    });

    if (user) {
      if (!user.yandexId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { yandexId, avatarUrl: avatarUrl || user.avatarUrl || undefined },
        });
      }
    } else {
      const email = yandexEmail || `yandex_${yandexId}@irongym.internal`;
      user = await prisma.user.create({
        data: { email, yandexId, firstName, lastName, avatarUrl, emailVerified: !!yandexEmail },
        include: { healthRestrictions: true },
      }) as any;
    }

    if ((user as any).isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
    }

    const totpGate = await checkSocialAuthTotpGate(user!, deviceToken);
    if (totpGate) {
      await logSecurityEvent('LOGIN_TOTP_REQUIRED', user!.id, req, 'method=yandex');
      return res.json(totpGate);
    }

    const { passwordHash, googleId, vkId, yandexId: _ya, totpSecret, totpBackupCodes, ...safeYandexUser } = user as any;
    const { token, refreshToken } = await signTokens(user!.id, req);
    await logSecurityEvent('LOGIN_SUCCESS', user!.id, req, 'method=yandex');
    checkSuspiciousLogin(user!.id, req, safeYandexUser.email, safeYandexUser.emailVerified).catch(() => {});
    res.json({ user: safeYandexUser, token, refreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/yandex:', e);
    res.status(500).json({ error: 'Ошибка авторизации через Яндекс' });
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
      where: { phone, purpose: 'phone-login', used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      await prisma.otpCode.updateMany({ where: { id: otp.id }, data: { used: true } });
      await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=phone-login phone=${phone}`);
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', code: 'OTP_BRUTEFORCE' });
    }

    if (otp.code !== code) {
      await prisma.otpCode.updateMany({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      const attemptsLeft = MAX_OTP_ATTEMPTS - otp.attempts - 1;
      return res.status(400).json({ error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.', code: 'INVALID_OTP' });
    }

    // Atomic: only proceed if this request is the first to consume the OTP
    const { count: consumed } = await prisma.otpCode.updateMany({ where: { id: otp.id, used: false }, data: { used: true } });
    if (consumed === 0) {
      return res.status(400).json({ error: 'Код уже использован. Запросите новый.', code: 'OTP_USED' });
    }

    const user = await prisma.user.findUnique({ where: { phone }, include: { healthRestrictions: true } });

    if (!user) {
      return res.status(404).json({ error: 'Пользователь с таким номером не найден', code: 'PHONE_NOT_FOUND' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true, loginAttempts: 0, lockedUntil: null } });

    await logSecurityEvent('LOGIN_SUCCESS', user.id, req, `phone=${phone} method=sms_otp`);
    checkSuspiciousLogin(user.id, req, user.email, user.emailVerified).catch(() => {});
    const { token, refreshToken } = await signTokens(user.id, req);
    const { passwordHash, googleId, vkId, yandexId, totpSecret, totpBackupCodes, ...rest } = user as any;
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
      purpose: z.enum(['register', 'login', 'phone-login', 'phone-reset', 'email-verify', 'phone-change', 'email-change']).default('register'),
    }).refine((d) => d.phone || d.email, { message: 'Укажите телефон или email' }).parse(req.body);

    // Authenticated purposes: require a valid JWT — prevents unauthenticated OTP spam to arbitrary addresses
    if (purpose === 'email-change' || purpose === 'phone-change') {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Требуется авторизация', code: 'UNAUTHORIZED' });
      }
      try {
        jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!, { issuer: JWT_ISS, audience: JWT_AUD });
      } catch {
        return res.status(401).json({ error: 'Недействительный токен', code: 'UNAUTHORIZED' });
      }
    }

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
    // Build filter only against the specific identifier — an empty {} condition would match all rows
    const since = new Date(Date.now() - 10 * 60 * 1000);
    const recentCount = await prisma.otpCode.count({
      where: {
        ...(phone ? { phone } : { email }),
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
      purpose: z.enum(['register', 'login', 'phone-login', 'phone-reset', 'email-verify', 'phone-change', 'email-change']).default('register'),
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
      await prisma.otpCode.updateMany({ where: { id: activeOtp.id }, data: { used: true } });
      await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=${purpose} phone=${phone ?? ''} email=${email ?? ''}`);
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', valid: false });
    }

    if (activeOtp.code !== code) {
      await prisma.otpCode.updateMany({ where: { id: activeOtp.id }, data: { attempts: { increment: 1 } } });
      const attemptsLeft = MAX_OTP_ATTEMPTS - activeOtp.attempts - 1;
      return res.status(400).json({
        error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.',
        valid: false,
      });
    }

    // Correct code
    // For 'register', 'phone-reset', 'phone-change', 'email-change': leave OTP intact — dedicated endpoints will consume it
    // For all other purposes: mark used now
    if (!['register', 'phone-reset', 'phone-change', 'email-change'].includes(purpose)) {
      const { count: consumed } = await prisma.otpCode.updateMany({ where: { id: activeOtp.id, used: false }, data: { used: true } });
      if (consumed === 0) {
        return res.status(400).json({ error: 'Код уже использован. Запросите новый.', valid: false });
      }
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
    if (!refreshToken || typeof refreshToken !== 'string') return res.status(400).json({ error: 'Refresh token обязателен' });

    let payload: { userId: string };
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!, { issuer: JWT_ISS, audience: JWT_AUD }) as { userId: string };
    } catch {
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }

    // Check DB: token must exist and belong to the same user as the JWT payload
    const dbToken = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!dbToken) return res.status(401).json({ error: 'Refresh token не найден' });
    if (dbToken.userId !== payload.userId) {
      // JWT payload userId doesn't match DB record — possible token swap attempt
      logSecurityEvent('SUSPICIOUS_LOGIN', payload.userId, req, 'refresh_token_userId_mismatch');
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }

    // Reuse detection: if the token was already revoked, someone may have stolen it.
    // Revoke ALL tokens for this user to protect the account.
    if (dbToken.revoked) {
      await Promise.all([
        prisma.refreshToken.updateMany({ where: { userId: dbToken.userId, revoked: false }, data: { revoked: true } }),
        prisma.trustedDevice.deleteMany({ where: { userId: dbToken.userId } }),
      ]);
      logSecurityEvent('SUSPICIOUS_LOGIN', dbToken.userId, req, 'refresh_token_reuse_detected');
      sendPushToUser(dbToken.userId, {
        title: 'Подозрительная активность',
        body: 'Обнаружено повторное использование токена. Все устройства отключены для вашей безопасности.',
        data: { url: 'irongym://profile/security' },
      }).catch(() => {});
      return res.status(401).json({ error: 'Обнаружено повторное использование токена. Войдите заново.', code: 'TOKEN_REUSE' });
    }

    if (dbToken.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Refresh token истёк' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, isBanned: true, lockedUntil: true } });
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    if (user.isBanned) return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'BANNED' });
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ error: `Аккаунт временно заблокирован. Попробуйте через ${minutesLeft} мин.`, code: 'ACCOUNT_LOCKED' });
    }

    // Rotate: atomically revoke old token — prevents TOCTOU race where two concurrent
    // requests with the same token would both succeed
    const { count: revokedCount } = await prisma.refreshToken.updateMany({
      where: { id: dbToken.id, revoked: false },
      data: { revoked: true },
    });
    if (revokedCount === 0) {
      // Another request already consumed this token concurrently → reuse detection
      await Promise.all([
        prisma.refreshToken.updateMany({ where: { userId: dbToken.userId, revoked: false }, data: { revoked: true } }),
        prisma.trustedDevice.deleteMany({ where: { userId: dbToken.userId } }),
      ]);
      logSecurityEvent('SUSPICIOUS_LOGIN', dbToken.userId, req, 'refresh_token_concurrent_reuse');
      return res.status(401).json({ error: 'Обнаружено повторное использование токена. Войдите заново.', code: 'TOKEN_REUSE' });
    }
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
    if (refreshToken && typeof refreshToken === 'string') {
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

    // Per-email rate limit: don't send another reset email if one was sent < 5 min ago.
    // Per-IP rate limit (passwordResetRateLimiter) handles the IP dimension; this closes
    // the gap where an attacker uses multiple IPs to spam one email address.
    const recentToken = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        used: false,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    if (recentToken) {
      // Return the same message — don't reveal that we rate-limited
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
      password: strongPassword,
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
      prisma.trustedDevice.deleteMany({ where: { userId: resetToken.userId } }),
      prisma.refreshToken.updateMany({ where: { userId: resetToken.userId, revoked: false }, data: { revoked: true } }),
    ]);
    await recordPasswordHistory(resetToken.userId, passwordHash);
    await logSecurityEvent('PASSWORD_CHANGE', resetToken.userId, req, 'method=email_reset');

    // Security alert to the user's email
    const resetIp = (req as any).ip ?? 'unknown';
    if (resetToken.user?.email && resetToken.user?.emailVerified) {
      sendPasswordChangedAlert(resetToken.user.email, resetIp, new Date()).catch(() => {});
    }

    res.json({ message: 'Пароль успешно изменён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return res.status(400).json({ error: e.errors[0].message });
    }
    if (e?.code === 'P2025') {
      return res.status(404).json({ error: 'Пользователь не найден' });
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
      await prisma.otpCode.updateMany({ where: { id: activeOtp.id }, data: { used: true } });
      await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=email-verify email=${email}`);
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', valid: false });
    }

    if (activeOtp.code !== code) {
      await prisma.otpCode.updateMany({ where: { id: activeOtp.id }, data: { attempts: { increment: 1 } } });
      const attemptsLeft = MAX_OTP_ATTEMPTS - activeOtp.attempts - 1;
      return res.status(400).json({
        error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.',
        valid: false,
      });
    }

    await prisma.$transaction([
      prisma.otpCode.updateMany({ where: { id: activeOtp.id }, data: { used: true } }),
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
      password: strongPassword,
    }).parse(req.body);

    const phone = normalizePhone(rawPhone);
    if (!phone) return res.status(400).json({ error: 'Неверный формат номера телефона' });

    const otp = await prisma.otpCode.findFirst({
      where: { phone, purpose: 'phone-reset', used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      await prisma.otpCode.updateMany({ where: { id: otp.id }, data: { used: true } });
      await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=phone-reset phone=${phone}`);
      return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', code: 'OTP_BRUTEFORCE' });
    }

    if (otp.code !== code) {
      await prisma.otpCode.updateMany({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      const attemptsLeft = MAX_OTP_ATTEMPTS - otp.attempts - 1;
      return res.status(400).json({ error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.', code: 'INVALID_OTP' });
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
      prisma.otpCode.updateMany({ where: { id: otp.id }, data: { used: true } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: user.id } }),
    ]);
    await recordPasswordHistory(user.id, passwordHash);

    await logSecurityEvent('PASSWORD_CHANGE', user.id, req, 'method=phone_reset');

    // Security alert to the user's email
    const phoneResetIp = (req as any).ip ?? 'unknown';
    if (user.email && user.emailVerified) {
      sendPasswordChangedAlert(user.email, phoneResetIp, new Date()).catch(() => {});
    }

    res.json({ message: 'Пароль успешно изменён' });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/reset-password-by-phone:', e);
    res.status(500).json({ error: 'Ошибка сброса пароля' });
  }
});

export { router as authRouter };
