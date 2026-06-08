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

// Per-account 2FA brute-force lockout — extracted to a shared util (audit 2026-06-07)
// so EVERY step-up surface shares one per-user counter (not just /totp-verify): user.ts
// change-*/2fa-disable/backup-codes/linked-accounts/account-delete and admin step-up.
import { is2faLocked, record2faFailure, clear2faFailures } from '../utils/twofaLockout';
import { invalidateAccessTokens } from '../utils/sessionRevocation';

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
      // Push goes through FCM/APNs — treat the payload as if a third party can read it.
      // Don't embed the actual IP here; the full IP/UA is shown inside the app on the
      // security screen (and sent by email, which is a more controlled channel).
      sendPushToUser(userId, {
        title: 'Новый вход в аккаунт',
        body: 'Обнаружен вход с нового устройства или IP-адреса. Если это не вы — откройте приложение и смените пароль.',
        data: { url: 'giron://profile/security' },
      }).catch(() => {});
      if (userEmail && emailVerified && currentIp) {
        sendNewLoginAlert(userEmail, currentIp, currentUa, new Date()).catch(() => {});
      }
    }
  } catch {
    // non-critical — don't fail the login
  }
}

const JWT_ISS = 'giron-api';
const JWT_AUD = 'giron-app';

/** Constant-time OTP comparison — prevents timing-based enumeration of correct digits. */
const otpEquals = (stored: string, input: string): boolean => {
  if (stored.length !== input.length) return false;
  return crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(input));
};

/**
 * Round 234 (security audit): OAuth token replay cache.
 *
 * Google id_token has 60-min `exp` by default. VK and Yandex access
 * tokens are opaque and live for hours. If an attacker captures any of
 * them (TLS-MITM with cert-pin bypass, clipboard scrape, debug log
 * leak), they can hit `/auth/google|vk|yandex` repeatedly within the
 * token lifetime — each call mints a fresh refresh-token pair. Even
 * with the suspicious-login alert, the attacker has hours.
 *
 * This cache rejects any token whose identity-key has been seen before,
 * regardless of validity. The key is:
 *   - Google: `g:${jti}` from id_token claims (always present per RFC)
 *   - VK / Yandex: `${provider}:${sha256(access_token).slice(0,32)}` —
 *     these aren't JWTs, so we hash the raw token. Doing so doesn't
 *     leak it (one-way) and gives a stable identity for replay match.
 *
 * Entries auto-expire after 70 minutes (just past the longest token
 * lifetime). Cap at 50,000 entries — a busy day at scale, well within
 * memory budget. The pruner runs every 5 min with `unref()` so it never
 * holds the event loop open.
 */
const OAUTH_REPLAY_TTL_MS = 70 * 60 * 1000;
const OAUTH_REPLAY_MAX = 50_000;
const oauthReplayCache = new Map<string, number>();

function pruneOAuthReplayCache(): void {
  const now = Date.now();
  for (const [k, t] of oauthReplayCache) {
    if (now - t > OAUTH_REPLAY_TTL_MS) oauthReplayCache.delete(k);
  }
  // Hard cap — if the prune left us over budget (unlikely outside abuse),
  // drop the oldest entries by Map insertion order.
  while (oauthReplayCache.size > OAUTH_REPLAY_MAX) {
    const oldest = oauthReplayCache.keys().next().value;
    if (oldest === undefined) break;
    oauthReplayCache.delete(oldest);
  }
}
setInterval(pruneOAuthReplayCache, 5 * 60 * 1000).unref();

/**
 * Marks the token-identity key as seen. Returns `true` on first sight,
 * `false` if this exact identity already came in within TTL — caller
 * must treat `false` as a replay attack and refuse the auth.
 */
function markOAuthTokenSeen(key: string): boolean {
  const now = Date.now();
  const prev = oauthReplayCache.get(key);
  if (prev !== undefined && now - prev <= OAUTH_REPLAY_TTL_MS) return false;
  oauthReplayCache.set(key, now);
  return true;
}

/** Test-only — reset state between cases. Not exported via barrel. */
export function _resetOAuthReplayCacheForTests(): void {
  oauthReplayCache.clear();
}

/** Test-only — exposes the marker so the cache contract can be unit-tested
 *  without spinning up the full Express stack. */
export function _markOAuthTokenSeenForTests(key: string): boolean {
  return markOAuthTokenSeen(key);
}

const MAX_SESSIONS_PER_USER = 10;

/** SHA-256 of a refresh token. Stored in DB so a leak does not yield
 * exchangeable credentials. Sec audit 2026-04: HIGH-5. */
function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function signTokens(userId: string, req?: Request) {
  // Access token: 60 minutes. Was 15min — that was hostile to the founder
  // experience because every Render redeploy (which takes 30-60 seconds)
  // could fall during the JWT's last 15 min, fail refresh, and bounce
  // them to login. 60min reduces that risk by 4x while still being short
  // enough that a stolen token isn't a long-lived liability — refresh
  // tokens (30 days, hashed in DB) are the real long-lived credential.
  const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '60m', issuer: JWT_ISS, audience: JWT_AUD });
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
      token: hashRefreshToken(rawRefresh),
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
  return { ...rest, hasGoogle: !!googleId, hasVk: !!vkId, hasYandex: !!yandexId };
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
  if (email.endsWith('@giron.internal')) return;
  // Invalidate old unused codes
  await prisma.otpCode.updateMany({ where: { email, purpose: 'email-verify', used: false }, data: { used: true } });
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  await prisma.otpCode.create({ data: { email, code, purpose: 'email-verify', expiresAt } });
  await sendOtpEmail(email, code);
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const strongPassword = z
  .string()
  .min(8, 'Пароль минимум 8 символов')
  .max(128, 'Пароль не может быть длиннее 128 символов')
  .refine((p) => /[A-Z]/.test(p), { message: 'Пароль должен содержать хотя бы одну заглавную букву' })
  .refine((p) => /[a-z]/.test(p), { message: 'Пароль должен содержать хотя бы одну строчную букву' })
  .refine((p) => /[0-9]/.test(p), { message: 'Пароль должен содержать хотя бы одну цифру' });

/** Canonicalize an email so case/whitespace/unicode-form variants collapse to
 * a single value before any lookup or write hits the DB. Sec audit 2026-04:
 * HIGH-14. The DB column is case-sensitive `text`, and the official client
 * lowercases before submit — without this server-side normalization an
 * attacker could bypass the client (curl/Postman) and pre-register a
 * case-variant of a future user's email, then collect their OAuth-link or
 * password-reset traffic via the duplicate row.
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().normalize('NFKC');
}

/**
 * Round 237 — current consent version. Equals the "Last updated" date in
 * docs/privacy.html and docs/terms.html. Bump in lockstep with edits to
 * either document; existing users with an older `consentVersion` get a
 * re-accept prompt on next launch (separate round, not yet wired).
 */
export const CURRENT_CONSENT_VERSION = '2026-04-20';

const registerSchema = z.object({
  email: z.string().email('Некорректный email').max(254, 'Email слишком длинный').transform(normalizeEmail),
  password: strongPassword,
  firstName: z.string().min(1, 'Введите имя').max(100, 'Имя слишком длинное'),
  lastName: z.string().max(100, 'Фамилия слишком длинная').optional(),
  phone: z.string().optional(),
  otpToken: z.string().optional(), // token returned by /auth/verify-otp
  // Round 237 (152-ФЗ §6 + GDPR Art.7): mandatory informed consent. Must
  // be `true` literal — `false` or absent → 400 BEFORE any DB write so we
  // never create a user who hasn't agreed. The version string lets us
  // distinguish users on old vs current consent text when we change the
  // documents (legal team needs this audit trail).
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Необходимо принять Условия использования и Политику конфиденциальности' }),
  }),
  consentVersion: z.string().min(8).max(20).optional(),
});

const loginSchema = z.object({
  email: z.string().email().max(254).transform(normalizeEmail), // sec audit 2026-04 HIGH-14
  password: z.string().max(1000), // prevent bcrypt DoS (bcrypt truncates at 72 chars anyway)
  deviceToken: z.string().optional(), // trusted device token for skipping TOTP
});

// ── Register ──────────────────────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    const phone = data.phone ? normalizePhone(data.phone) : undefined;

    // Validate OTP if phone provided
    let phoneVerified = false;
    if (phone && data.otpToken) {
      const otp = await prisma.otpCode.findFirst({
        where: { phone, code: data.otpToken, purpose: 'register', used: false, expiresAt: { gte: new Date() } },
      });
      if (otp) {
        const { count: consumed } = await prisma.otpCode.updateMany({ where: { id: otp.id, used: false }, data: { used: true } });
        if (consumed > 0) phoneVerified = true;
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    // Admin bootstrap-on-register: if this is the first time the user
    // matching ADMIN_BOOTSTRAP_EMAIL signs up, create them straight as
    // ADMIN. Saves a server restart that would otherwise be needed for
    // the boot-time bootstrap to find them. Idempotent — only the very
    // first registration with a matching email gets ADMIN; subsequent
    // attempts hit the email-uniqueness 409 path below.
    // NFKC-normalize alongside trim+lowercase so we match the same
    // pipeline applied to user-input email via the Zod transform on
    // registerSchema. Without NFKC, a precomposed ё in the env var
    // wouldn't match the decomposed ё that NFKC produces from the
    // user input (HIGH-14 leftover — user-side was fixed 2026-04-28
    // but the bootstrap comparison was missed).
    const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL
      ?.trim()
      .toLowerCase()
      .normalize('NFKC');
    // data.email is already normalized by the Zod transform, so compare
    // it directly. The previous .toLowerCase() was a no-op (already
    // lowercased upstream) and could mask a NFKC mismatch.
    const isBootstrapAdmin = bootstrapEmail && data.email === bootstrapEmail;

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone,
        phoneVerified,
        emailVerified: false,
        role: isBootstrapAdmin ? 'ADMIN' : undefined,
        // Round 237: persist informed-consent timestamp + version. The
        // schema rejected the request above if acceptTerms wasn't true,
        // so we always have consent here. Client may pass its own
        // consentVersion (the doc version it actually showed the user)
        // or fall back to the server's CURRENT — defensive cap on
        // mismatch where the client is on an older app build.
        consentAcceptedAt: new Date(),
        consentVersion: data.consentVersion ?? CURRENT_CONSENT_VERSION,
      },
    });

    if (isBootstrapAdmin) {
      logger.info(`[AdminBootstrap] Auto-promoted ${user.email} on register`);
    }

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
    if (e?.code === 'P2002') {
      const field = e?.meta?.target?.includes('phone') ? 'номером телефона' : 'email';
      return res.status(400).json({ error: `Пользователь с таким ${field} уже существует` });
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
      return res.json({ user: safeUser(user), token: tk, refreshToken: rt });
    }

    await logSecurityEvent('LOGIN_SUCCESS', user.id, req, `email=${data.email}`);
    checkSuspiciousLogin(user.id, req, user.email, user.emailVerified).catch(() => {});

    const { token, refreshToken } = await signTokens(user.id, req);
    res.json({ user: safeUser(user), token, refreshToken });
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
      // Round 235: pin algorithms to HS256 to prevent algorithm-confusion
      // attacks (none/RS256 substitution if a downstream lib changes default).
      payload = jwt.verify(pendingToken, process.env.JWT_SECRET!, {
        issuer: JWT_ISS,
        audience: JWT_AUD,
        algorithms: ['HS256'],
      }) as any;
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

    // Per-account 2FA lockout (finding H1): blocks brute-forcing the code /
    // backup code via IP rotation. Checked before any validation so a locked
    // account can't be probed further regardless of source IP.
    if (is2faLocked(user.id)) {
      await logSecurityEvent('LOGIN_FAIL', user.id, req, '2fa_locked');
      return res.status(429).json({ error: 'Слишком много неверных кодов. Попробуйте через 15 минут.', code: 'TOTP_LOCKED' });
    }

    // Verify TOTP code or backup code
    if (backupCode) {
      // Backup code flow — SELECT FOR UPDATE prevents two concurrent requests from
      // both consuming the same backup code (TOCTOU race condition)
      const codeHash = crypto.createHash('sha256').update(backupCode.toUpperCase()).digest('hex');
      let backupCodeValid = false;
      try {
        await prisma.$transaction(async (tx) => {
          const [locked] = await tx.$queryRaw<Array<{ totpBackupCodes: string | null }>>`
            SELECT "totpBackupCodes" FROM "User" WHERE id = ${user.id} FOR UPDATE
          `;
          const codes: Array<{ hash: string; used: boolean }> = [];
          try { codes.push(...JSON.parse(locked?.totpBackupCodes || '[]')); } catch {}
          const idx = codes.findIndex((c) => c.hash === codeHash && !c.used);
          if (idx === -1) return;
          codes[idx].used = true;
          await tx.user.update({ where: { id: user.id }, data: { totpBackupCodes: JSON.stringify(codes) } });
          backupCodeValid = true;
        });
      } catch { /* db error — treat as invalid */ }
      if (!backupCodeValid) {
        record2faFailure(user.id);
        await logSecurityEvent('LOGIN_FAIL', user.id, req, 'backup_code_invalid');
        return res.status(401).json({ error: 'Резервный код недействителен или уже использован', code: 'INVALID_BACKUP_CODE' });
      }
      clear2faFailures(user.id);
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
        record2faFailure(user.id);
        await logSecurityEvent('LOGIN_FAIL', user.id, req, 'totp_invalid');
        return res.status(401).json({ error: 'Неверный код. Проверьте время на устройстве.', code: 'INVALID_TOTP' });
      }
      if (await isTotpReplay(user.id, code!)) {
        record2faFailure(user.id);
        await logSecurityEvent('LOGIN_FAIL', user.id, req, 'totp_replayed');
        return res.status(401).json({ error: 'Этот код уже был использован. Дождитесь следующего кода.', code: 'TOTP_REPLAYED' });
      }
      clear2faFailures(user.id);
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

    res.json({ user: safeUser(user), token, refreshToken, ...(deviceToken ? { deviceToken } : {}) });
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
    const { email } = z.object({ email: z.string().email().transform(normalizeEmail) }).parse(req.body);
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

    // Round 234 (security audit): freshness window. `verifyIdToken` accepts
    // a token up to 60 min old (Google's default `exp`). A captured-but-
    // not-yet-expired token replayed an hour later is still "valid" by
    // signature. Require `iat` within 5 min of now — short enough that a
    // captured token has minutes, not an hour, of usable lifetime; long
    // enough that legitimate clients with mild clock skew aren't rejected.
    const nowSec = Math.floor(Date.now() / 1000);
    const iat = typeof payload.iat === 'number' ? payload.iat : 0;
    if (iat <= 0 || nowSec - iat > 300) {
      return res.status(401).json({ error: 'Google токен устарел, повторите вход', code: 'TOKEN_STALE' });
    }

    // Round 234: replay cache. Google ID tokens carry a `jti` per RFC 7519
    // (also: `sub` + `iat` together form a unique-enough fallback for
    // older audiences that omit jti). The first /auth/google call with
    // a given jti wins; subsequent calls with the SAME jti within TTL
    // are refused — covers the case where an attacker grabs a single
    // valid token and races against the legit client.
    const jti = (typeof payload.jti === 'string' && payload.jti) || `${payload.sub}:${payload.iat}`;
    if (!markOAuthTokenSeen(`g:${jti}`)) {
      await logSecurityEvent('OAUTH_TOKEN_REPLAY', null, req, `provider=google jti=${jti.slice(0, 12)}`);
      return res.status(401).json({ error: 'Google токен уже был использован, повторите вход', code: 'TOKEN_REPLAY' });
    }

    // Google OAuth account-takeover hardening (sec audit 2026-04: HIGH-2).
    // `email_verified` MUST be true before we trust `payload.email` for
    // user creation or auto-linking — otherwise a Google Workspace admin
    // who controls a domain can mint an ID token with arbitrary `email`
    // and unverified flag, taking over an existing Giron account.
    if (payload.email_verified !== true) {
      return res.status(401).json({ error: 'Email Google не подтверждён', code: 'EMAIL_NOT_VERIFIED' });
    }

    const googleId = payload.sub as string;
    const email = normalizeEmail(payload.email as string); // sec audit 2026-04 HIGH-14
    const firstName = (payload.given_name as string) || (payload.name as string)?.split(' ')[0] || 'Пользователь';
    const lastName = (payload.family_name as string) || undefined;
    const avatarUrl = (payload.picture as string) || undefined;

    // Lookup by googleId first (the strong identifier). Email-based linking
    // is only allowed when the existing Giron account already verified
    // the same email — otherwise an attacker who registered a victim's
    // address without verification could be silently linked.
    let user = await prisma.user.findFirst({
      where: { googleId },
      include: { healthRestrictions: true },
    });
    if (!user) {
      const byEmail = await prisma.user.findUnique({
        where: { email },
        include: { healthRestrictions: true },
      });
      if (byEmail) {
        if (!byEmail.emailVerified) {
          await logSecurityEvent('OAUTH_EMAIL_LINK_BLOCKED', byEmail.id, req, 'method=google reason=existing_email_unverified');
          return res.status(409).json({
            error: 'Этот email уже зарегистрирован, но не подтверждён. Подтвердите email паролем, затем привяжите Google.',
            code: 'EMAIL_NOT_VERIFIED_LOCAL',
          });
        }
        user = byEmail;
      }
    }

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
      // Create new user. Round 237: tapping "Sign in with Google" on the
      // login screen (where the under-button text says "Регистрируясь, вы
      // принимаете Условия и Политику") is the consent gesture for OAuth
      // first-timers. Persist the version so the audit trail matches the
      // email-register path.
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          firstName,
          lastName,
          avatarUrl,
          emailVerified: true,
          // passwordHash is null — Google-only user
          consentAcceptedAt: new Date(),
          consentVersion: CURRENT_CONSENT_VERSION,
        },
        include: { healthRestrictions: true },
      }) as any;
    }

    if (user!.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
    }
    if (user!.lockedUntil && user!.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user!.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ error: `Аккаунт временно заблокирован. Попробуйте через ${minutesLeft} мин.`, code: 'ACCOUNT_LOCKED', lockedUntil: user!.lockedUntil });
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
    const { accessToken, userId: claimedVkUserId, deviceToken } = z.object({
      accessToken: z.string().min(1),
      userId: z.number().int().positive(),
      // `email` is intentionally NOT accepted from the client. VK's
      // users.get API doesn't return an email server-side, and the value
      // the mobile flow extracts from the OAuth redirect fragment is
      // forwarded through the device — an attacker can replay /auth/vk
      // directly with a valid VK token of their own VK account but a
      // crafted `email` field, squatting on the victim's email at user
      // creation time. The unique constraint on User.email blocks the
      // takeover for emails already registered, but for free emails the
      // squatter wins, and the legitimate owner is then locked out of
      // /register with "email taken". HIGH-3 closed the auto-link half
      // of this gap; this closes the new-account-creation half.
      deviceToken: z.string().optional(),
    }).parse(req.body);

    if (!process.env.VK_APP_ID) {
      return res.status(503).json({ error: 'VK OAuth не настроен на сервере' });
    }

    // Round 234 (security audit): replay cache. VK access tokens are
    // opaque (not JWT) — we hash for stable, non-leaking identity.
    const vkTokenKey = `v:${crypto.createHash('sha256').update(accessToken).digest('hex').slice(0, 32)}`;
    if (!markOAuthTokenSeen(vkTokenKey)) {
      await logSecurityEvent('OAUTH_TOKEN_REPLAY', null, req, 'provider=vk');
      return res.status(401).json({ error: 'VK токен уже был использован, повторите вход', code: 'TOKEN_REPLAY' });
    }

    let vkUser: any;
    try {
      // Omit user_ids to get the token owner's own profile — prevents user ID spoofing
      const params = new URLSearchParams({
        fields: 'photo_200',
        access_token: accessToken,
        v: '5.199',
      });
      const resp = await fetch(`https://api.vk.com/method/users.get?${params}`, { signal: AbortSignal.timeout(5000) });
      const data = await resp.json() as any;
      if (data.error) throw new Error(data.error.error_msg);
      vkUser = data.response?.[0];
    } catch (e: any) {
      logger.warn('VK users.get failed:', e.message);
      return res.status(401).json({ error: 'Не удалось получить данные из VK' });
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
    // claim an arbitrary email address and take over the matching Giron account.
    let user = await prisma.user.findFirst({
      where: { vkId },
      include: { healthRestrictions: true },
    });

    if (!user) {
      // New VK user — create with the synthetic internal email only.
      // The client-supplied email is no longer accepted (see schema note
      // above). The user can attach a real email later via the
      // /user/change-email OTP flow, which proves ownership end-to-end.
      const email = `vk_${vkId}@giron.internal`;
      // Round 237: see Google handler — tapping the social button is the
      // consent gesture for first-time OAuth users. Persist version.
      user = await prisma.user.create({
        data: {
          email, vkId, firstName, lastName, avatarUrl, emailVerified: false,
          consentAcceptedAt: new Date(),
          consentVersion: CURRENT_CONSENT_VERSION,
        },
        include: { healthRestrictions: true },
      }) as any;
    }

    if (user!.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
    }
    if (user!.lockedUntil && user!.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user!.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ error: `Аккаунт временно заблокирован. Попробуйте через ${minutesLeft} мин.`, code: 'ACCOUNT_LOCKED', lockedUntil: user!.lockedUntil });
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
 * Exchange a Yandex OAuth access token for Giron JWT tokens.
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

    // Round 234 (security audit): replay cache. Same rationale as the VK
    // path — Yandex access tokens are opaque (not JWT), so we hash for a
    // stable identity that doesn't leak the raw token.
    const yandexTokenKey = `y:${crypto.createHash('sha256').update(accessToken).digest('hex').slice(0, 32)}`;
    if (!markOAuthTokenSeen(yandexTokenKey)) {
      await logSecurityEvent('OAUTH_TOKEN_REPLAY', null, req, 'provider=yandex');
      return res.status(401).json({ error: 'Yandex токен уже был использован, повторите вход', code: 'TOKEN_REPLAY' });
    }

    // Validate token with Yandex API
    let yandexUser: any;
    try {
      const resp = await fetch('https://login.yandex.ru/info?format=json', {
        headers: { Authorization: `OAuth ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`Yandex API error: ${resp.status}`);
      yandexUser = await resp.json();
    } catch (e: any) {
      logger.warn('Yandex token validation failed:', e.message);
      return res.status(401).json({ error: 'Не удалось проверить Yandex токен' });
    }

    if (!yandexUser?.id) return res.status(401).json({ error: 'Пользователь Яндекса не найден' });

    // Verify token was issued for our app (prevents token injection from other Yandex apps).
    // Round 236: previously the check was conditional on yandexUser.client_id being
    // present — if Yandex omitted client_id from the response (or an upstream
    // change made it optional), the audience check silently passed. Now we
    // REQUIRE client_id to be present AND equal. Configure YANDEX_CLIENT_ID env;
    // without it the check still rejects (defense-in-depth).
    if (!yandexUser.client_id || yandexUser.client_id !== process.env.YANDEX_CLIENT_ID) {
      logger.warn(`[SECURITY] Yandex token client_id mismatch: expected=${process.env.YANDEX_CLIENT_ID} got=${yandexUser.client_id ?? 'absent'}`);
      return res.status(401).json({ error: 'Токен выдан для другого приложения' });
    }

    const yandexId = String(yandexUser.id);
    const firstName = yandexUser.first_name || yandexUser.display_name || 'Пользователь';
    const lastName = yandexUser.last_name || undefined;
    // Use the user's default Yandex email (yandex.ru or custom domain) — Yandex has verified it
    const yandexEmail: string | undefined = yandexUser.default_email ? normalizeEmail(yandexUser.default_email) : undefined; // sec audit 2026-04 HIGH-14
    const avatarId = yandexUser.default_avatar_id;
    const avatarUrl = avatarId && avatarId !== '0' ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200` : undefined;

    // Lookup by yandexId first (the strong identifier). Email-based linking
    // requires the existing Giron account to have a verified email —
    // otherwise an attacker who registered the victim's address without
    // verification could be silently linked (sec audit 2026-04: HIGH-3).
    let user: any = await prisma.user.findFirst({
      where: { yandexId },
      include: { healthRestrictions: true },
    });
    if (!user && yandexEmail) {
      const byEmail = await prisma.user.findUnique({
        where: { email: yandexEmail },
        include: { healthRestrictions: true },
      });
      if (byEmail) {
        if (!byEmail.emailVerified) {
          await logSecurityEvent('OAUTH_EMAIL_LINK_BLOCKED', byEmail.id, req, 'method=yandex reason=existing_email_unverified');
          return res.status(409).json({
            error: 'Этот email уже зарегистрирован, но не подтверждён. Подтвердите email паролем, затем привяжите Яндекс.',
            code: 'EMAIL_NOT_VERIFIED_LOCAL',
          });
        }
        user = byEmail;
      }
    }

    if (user) {
      if (!user.yandexId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { yandexId, avatarUrl: avatarUrl || user.avatarUrl || undefined },
        });
      }
    } else {
      const email = yandexEmail || `yandex_${yandexId}@giron.internal`;
      // Round 237: see Google handler.
      user = await prisma.user.create({
        data: {
          email, yandexId, firstName, lastName, avatarUrl, emailVerified: !!yandexEmail,
          consentAcceptedAt: new Date(),
          consentVersion: CURRENT_CONSENT_VERSION,
        },
        include: { healthRestrictions: true },
      }) as any;
    }

    if ((user as any).isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
    }
    if ((user as any).lockedUntil && (user as any).lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(((user as any).lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ error: `Аккаунт временно заблокирован. Попробуйте через ${minutesLeft} мин.`, code: 'ACCOUNT_LOCKED', lockedUntil: (user as any).lockedUntil });
    }

    const totpGate = await checkSocialAuthTotpGate(user!, deviceToken);
    if (totpGate) {
      await logSecurityEvent('LOGIN_TOTP_REQUIRED', user!.id, req, 'method=yandex');
      return res.json(totpGate);
    }

    const { token, refreshToken } = await signTokens(user!.id, req);
    await logSecurityEvent('LOGIN_SUCCESS', user!.id, req, 'method=yandex');
    checkSuspiciousLogin(user!.id, req, user!.email, user!.emailVerified).catch(() => {});
    res.json({ user: safeUser(user), token, refreshToken });
  } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors[0].message });
    logger.error('POST /auth/yandex:', e);
    res.status(500).json({ error: 'Ошибка авторизации через Яндекс' });
  }
});

// ── Login by phone (OTP) ──────────────────────────────────────────────────────

router.post('/login-by-phone', async (req: Request, res: Response) => {
  try {
    const { phone: rawPhone, code, deviceToken } = z.object({
      phone: z.string().min(10, 'Введите номер телефона'),
      code: z.string().length(6, 'Код должен быть 6 цифр'),
      deviceToken: z.string().optional(),
    }).parse(req.body);

    const phone = normalizePhone(rawPhone);

    const otp = await prisma.otpCode.findFirst({
      where: { phone, purpose: 'phone-login', used: false, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }

    if (!otpEquals(otp.code, code)) {
      // Atomic increment with limit guard — prevents concurrent requests from bypassing the attempt cap
      const incResult = await prisma.otpCode.updateMany({
        where: { id: otp.id, attempts: { lt: MAX_OTP_ATTEMPTS }, used: false },
        data: { attempts: { increment: 1 } },
      });
      if (incResult.count === 0) {
        await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=phone-login phone=${phone}`);
        return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', code: 'OTP_BRUTEFORCE' });
      }
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
      // Edge case: user deleted their account between send-otp and login-by-phone.
      // Respond like a wrong code — don't leak that the phone was ever registered here.
      return res.status(400).json({ error: 'Неверный или истёкший код', code: 'INVALID_OTP' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Аккаунт заблокирован. Обратитесь в поддержку.', code: 'BANNED' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ error: `Аккаунт временно заблокирован. Попробуйте через ${minutesLeft} мин.`, code: 'ACCOUNT_LOCKED', lockedUntil: user.lockedUntil });
    }

    await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true, loginAttempts: 0, lockedUntil: null } });

    // 2FA gate — must run before issuing access tokens. Phone-login was
    // previously bypassing TOTP entirely (sec audit 2026-04: HIGH-1). The
    // pending token is short-lived and can only be exchanged for a real
    // session via /auth/totp-verify with a valid 6-digit code.
    const totpGate = await checkSocialAuthTotpGate(user, deviceToken);
    if (totpGate) {
      await logSecurityEvent('LOGIN_TOTP_REQUIRED', user.id, req, 'method=sms_otp');
      return res.json(totpGate);
    }

    await logSecurityEvent('LOGIN_SUCCESS', user.id, req, `phone=${phone} method=sms_otp`);
    checkSuspiciousLogin(user.id, req, user.email, user.emailVerified).catch(() => {});
    const { token, refreshToken } = await signTokens(user.id, req);
    res.json({ user: safeUser(user), token, refreshToken });
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
      email: z.string().email().transform(normalizeEmail).optional(), // sec audit 2026-04 HIGH-14
      purpose: z.enum(['register', 'login', 'phone-login', 'phone-reset', 'email-verify', 'phone-change', 'email-change']).default('register'),
    }).refine((d) => d.phone || d.email, { message: 'Укажите телефон или email' }).parse(req.body);

    // Authenticated purposes: require a valid JWT — prevents unauthenticated OTP spam
    // to arbitrary addresses, and lets us scope the issued OTP to its owner so a
    // different logged-in user can't consume it.
    let ownerUserId: string | undefined;
    if (purpose === 'email-change' || purpose === 'phone-change') {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Требуется авторизация', code: 'UNAUTHORIZED' });
      }
      try {
        // Round 235: pin algorithms to HS256 (algorithm confusion defense).
        const payload = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET!, {
          issuer: JWT_ISS,
          audience: JWT_AUD,
          algorithms: ['HS256'],
        }) as { userId?: string };
        ownerUserId = payload.userId;
        if (!ownerUserId) {
          return res.status(401).json({ error: 'Недействительный токен', code: 'UNAUTHORIZED' });
        }
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

    // Round 234 (security audit): per-USER cap for email-change so an
    // attacker with a stolen access token can't burn the SMTP quota by
    // rotating target emails (a@x.com, b@x.com, c@x.com…) — each unique
    // address bypasses the per-identifier limit above. Cap at 5/hour
    // per ownerUserId for email-change specifically; phone-change is
    // SMS-billed separately and has its own provider-side throttle.
    if (purpose === 'email-change' && ownerUserId) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const ownerEmailChangeCount = await prisma.otpCode.count({
        where: { userId: ownerUserId, purpose: 'email-change', createdAt: { gte: hourAgo } },
      });
      if (ownerEmailChangeCount >= 5) {
        return res.status(429).json({
          error: 'Слишком много запросов на смену email. Попробуйте через час.',
          code: 'EMAIL_CHANGE_RATE_LIMIT',
        });
      }
    }

    // Invalidate old unused codes
    if (phone) {
      await prisma.otpCode.updateMany({ where: { phone, purpose, used: false }, data: { used: true } });
    } else {
      await prisma.otpCode.updateMany({ where: { email, purpose, used: false }, data: { used: true } });
    }

    const code = String(crypto.randomInt(100000, 1000000)); // 6 digits, CSPRNG
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.otpCode.create({
      data: { phone, email, code, purpose, expiresAt, userId: ownerUserId ?? null },
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
      email: z.string().email().transform(normalizeEmail).optional(), // sec audit 2026-04 HIGH-14
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

    if (!otpEquals(activeOtp.code, code)) {
      // Atomically increment only if below limit — prevents concurrent bypass via TOCTOU
      const updated = await prisma.otpCode.updateMany({
        where: { id: activeOtp.id, attempts: { lt: MAX_OTP_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      if (updated.count === 0) {
        // Already at max attempts (either pre-existing or concurrent request hit it first)
        await prisma.otpCode.updateMany({ where: { id: activeOtp.id }, data: { used: true } });
        await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=${purpose} phone=${phone ?? ''} email=${email ?? ''}`);
        return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', valid: false });
      }
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
      // Round 235: pin algorithms to HS256 (algorithm confusion defense).
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!, {
        issuer: JWT_ISS,
        audience: JWT_AUD,
        algorithms: ['HS256'],
      }) as { userId: string };
    } catch {
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }

    // Check DB: token must exist and belong to the same user as the JWT payload.
    // Stored as SHA-256 hash (sec audit 2026-04: HIGH-5) — hash before lookup.
    const dbToken = await prisma.refreshToken.findUnique({ where: { token: hashRefreshToken(refreshToken) } });
    if (!dbToken) return res.status(401).json({ error: 'Refresh token не найден' });
    if (dbToken.userId !== payload.userId) {
      // JWT payload userId doesn't match DB record — possible token swap attempt
      logSecurityEvent('SUSPICIOUS_LOGIN', payload.userId, req, 'refresh_token_userId_mismatch');
      return res.status(401).json({ error: 'Недействительный refresh token' });
    }

    // Reuse detection: if the token was already revoked, someone may have stolen it.
    // Revoke ALL tokens for this user to protect the account.
    if (dbToken.revoked) {
      await prisma.$transaction([
        prisma.refreshToken.updateMany({ where: { userId: dbToken.userId, revoked: false }, data: { revoked: true } }),
        prisma.trustedDevice.deleteMany({ where: { userId: dbToken.userId } }),
      ]);
      logSecurityEvent('SUSPICIOUS_LOGIN', dbToken.userId, req, 'refresh_token_reuse_detected');
      sendPushToUser(dbToken.userId, {
        title: 'Подозрительная активность',
        body: 'Обнаружено повторное использование токена. Все устройства отключены для вашей безопасности.',
        data: { url: 'giron://profile/security' },
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
      await prisma.$transaction([
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
    const { refreshToken, all } = req.body;
    if (refreshToken && typeof refreshToken === 'string') {
      if (all) {
        // Revoke all active sessions for this user — used by "logout all devices"
        try {
          // Round 235: pin algorithms to HS256 (algorithm confusion defense).
          const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!, {
            issuer: JWT_ISS,
            audience: JWT_AUD,
            algorithms: ['HS256'],
          }) as { userId: string };
          await prisma.refreshToken.updateMany({ where: { userId: payload.userId, revoked: false }, data: { revoked: true } });
          await invalidateAccessTokens(payload.userId); // M1: "logout all devices" also kills live access tokens
        } catch {
          // Token invalid/expired — fall back to revoking only this token.
          // Stored as SHA-256 hash; lookup by hash. Sec audit 2026-04: HIGH-5.
          await prisma.refreshToken.updateMany({ where: { token: hashRefreshToken(refreshToken), revoked: false }, data: { revoked: true } });
        }
      } else {
        await prisma.refreshToken.updateMany({ where: { token: hashRefreshToken(refreshToken), revoked: false }, data: { revoked: true } });
      }
    }
    res.json({ message: 'Выход выполнен' });
  } catch {
    res.json({ message: 'Выход выполнен' });
  }
});

// ── Forgot password ───────────────────────────────────────────────────────────

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = z.object({ email: z.string().email().transform(normalizeEmail) }).parse(req.body); // sec audit 2026-04 HIGH-14

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

    // Reset token is password-equivalent — only store the SHA-256 hash so a
    // DB read (replica leak, BI export, support engineer with prisma:studio,
    // SQL-injection elsewhere) does NOT yield ready-to-use reset links.
    // Sec audit 2026-04: HIGH-4. The raw token is sent to the user's mailbox
    // and is hashed back before lookup in /reset-password.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { token: tokenHash, userId: user.id, expiresAt },
    });

    // Fire-and-forget: awaiting SMTP leaks registration state via response timing.
    sendPasswordResetEmail(email, rawToken).catch((err) => {
      logger.warn('sendPasswordResetEmail failed:', err);
    });

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

    // Token is stored as SHA-256 hash (sec audit 2026-04: HIGH-4). Hash the
    // incoming raw value before lookup. crypto.createHash is constant-time
    // for fixed-length input, so this doesn't open a timing oracle.
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Ссылка недействительна или истекла' });
    }

    if (resetToken.user?.passwordHash && await bcrypt.compare(password, resetToken.user.passwordHash)) {
      return res.status(400).json({ error: 'Новый пароль совпадает с текущим', code: 'PASSWORD_UNCHANGED' });
    }

    if (await checkPasswordHistory(resetToken.userId, password)) {
      return res.status(400).json({ error: `Нельзя использовать один из последних ${PASSWORD_HISTORY_DEPTH} паролей`, code: 'PASSWORD_REUSED' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Atomically consume the reset token — prevents concurrent requests with the same token from both succeeding
    const { count: tokenConsumed } = await prisma.passwordResetToken.updateMany({ where: { id: resetToken.id, used: false }, data: { used: true } });
    if (tokenConsumed === 0) {
      return res.status(400).json({ error: 'Ссылка уже использована или истекла' });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
      prisma.trustedDevice.deleteMany({ where: { userId: resetToken.userId } }),
      prisma.refreshToken.updateMany({ where: { userId: resetToken.userId, revoked: false }, data: { revoked: true } }),
    ]);
    // M1 (audit 2026-06-07): also kill already-issued access tokens — a password reset
    // after a leak must cut off an attacker holding a live access token, not just refresh.
    await invalidateAccessTokens(resetToken.userId);
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
      email: z.string().email().transform(normalizeEmail), // sec audit 2026-04 HIGH-14
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

    if (!otpEquals(activeOtp.code, code)) {
      // Atomic increment with limit guard — prevents concurrent requests from bypassing the attempt cap
      const incResult = await prisma.otpCode.updateMany({
        where: { id: activeOtp.id, attempts: { lt: MAX_OTP_ATTEMPTS }, used: false },
        data: { attempts: { increment: 1 } },
      });
      if (incResult.count === 0) {
        await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=email-verify email=${email}`);
        return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', valid: false });
      }
      const attemptsLeft = MAX_OTP_ATTEMPTS - activeOtp.attempts - 1;
      return res.status(400).json({
        error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.',
        valid: false,
      });
    }

    // Atomically consume the OTP to prevent concurrent replay
    const { count: otpConsumed } = await prisma.otpCode.updateMany({ where: { id: activeOtp.id, used: false }, data: { used: true } });
    if (otpConsumed === 0) {
      return res.status(400).json({ error: 'Код уже использован. Запросите новый.', valid: false });
    }
    await prisma.user.updateMany({ where: { email, emailVerified: false }, data: { emailVerified: true } });

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
    const { email } = z.object({ email: z.string().email().transform(normalizeEmail) }).parse(req.body); // sec audit 2026-04 HIGH-14

    if (email.endsWith('@giron.internal')) {
      return res.status(400).json({ error: 'Email verification не поддерживается для этого аккаунта' });
    }
    const GENERIC_OK = { message: 'Если такой email зарегистрирован, письмо отправлено' };
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
    // Return the same response for missing user OR already-verified email to prevent
    // account enumeration / verification-state probing.
    if (!user || user.emailVerified) return res.json(GENERIC_OK);

    // Rate limit: max 3 per hour
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await prisma.otpCode.count({ where: { email, purpose: 'email-verify', createdAt: { gte: since } } });
    if (recentCount >= 3) {
      return res.status(429).json({ error: 'Слишком много запросов. Попробуйте через час.' });
    }

    sendEmailVerificationOtp(email).catch((err) => {
      logger.warn('sendEmailVerificationOtp failed:', err);
    });
    res.json(GENERIC_OK);
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

    if (!otpEquals(otp.code, code)) {
      // Atomic increment with limit guard — prevents concurrent requests from bypassing the attempt cap
      const incResult = await prisma.otpCode.updateMany({
        where: { id: otp.id, attempts: { lt: MAX_OTP_ATTEMPTS }, used: false },
        data: { attempts: { increment: 1 } },
      });
      if (incResult.count === 0) {
        await logSecurityEvent('OTP_BRUTEFORCE', null, req, `purpose=phone-reset phone=${phone}`);
        return res.status(429).json({ error: 'Слишком много попыток. Запросите новый код.', code: 'OTP_BRUTEFORCE' });
      }
      const attemptsLeft = MAX_OTP_ATTEMPTS - otp.attempts - 1;
      return res.status(400).json({ error: attemptsLeft > 0 ? `Неверный код. Осталось попыток: ${attemptsLeft}` : 'Слишком много попыток. Запросите новый код.', code: 'INVALID_OTP' });
    }

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });
    }

    if (user.passwordHash && await bcrypt.compare(password, user.passwordHash)) {
      return res.status(400).json({ error: 'Новый пароль совпадает с текущим', code: 'PASSWORD_UNCHANGED' });
    }

    if (await checkPasswordHistory(user.id, password)) {
      return res.status(400).json({ error: `Нельзя использовать один из последних ${PASSWORD_HISTORY_DEPTH} паролей`, code: 'PASSWORD_REUSED' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Atomically consume the OTP to prevent concurrent reuse
    const { count: otpConsumed } = await prisma.otpCode.updateMany({ where: { id: otp.id, used: false }, data: { used: true } });
    if (otpConsumed === 0) {
      return res.status(400).json({ error: 'Код уже использован. Запросите новый.', code: 'OTP_USED' });
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash, loginAttempts: 0, lockedUntil: null } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
      prisma.trustedDevice.deleteMany({ where: { userId: user.id } }),
    ]);
    await invalidateAccessTokens(user.id); // M1: kill live access tokens on phone-reset too
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
