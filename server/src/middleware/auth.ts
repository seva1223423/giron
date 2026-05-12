import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { recordActivity, shouldSyncLastActiveAt } from '../utils/activityTracker';
import { logger } from '../utils/logger';
import { authUserCache, AUTH_CACHE_TTL_MS } from '../utils/memCache';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.split(' ')[1];
  let payload: { userId: string };
  try {
    const raw = jwt.verify(token, process.env.JWT_SECRET!, {
      issuer: 'giron-api',
      audience: 'giron-app',
      algorithms: ['HS256'],
    }) as { userId: string; phase?: string };
    // Reject intermediate tokens (e.g. TOTP-pending) — they must not grant full API access
    if (raw.phase || !raw.userId) {
      return res.status(401).json({ error: 'Недействительный токен' });
    }
    payload = raw;
  } catch (e) {
    // Distinguish expired tokens from invalid ones so the client can trigger refresh vs. logout
    if (e instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Токен истёк', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Недействительный токен' });
  }

  // Round 280: cache the ban/role/lock lookup for 60s. Without the
  // cache every authenticated request paid a Prisma roundtrip; under
  // load (typing-indicator fan-out, chat streams) this was the
  // dominant bottleneck. Sensitive ops (ban, role change, lock)
  // call authUserCache.delete(userId) to invalidate immediately.
  //
  // Tests bypass the cache (NODE_ENV=test) so a banned-user fixture in
  // case A doesn't leak into a fresh-user fixture in case B. Production
  // and dev paths use the cache normally.
  const useCache = process.env.NODE_ENV !== 'test';
  try {
    let user: { isBanned: boolean; role: string; lockedUntil: Date | null } | null;
    const cached = useCache ? authUserCache.get(payload.userId) : undefined;
    if (cached) {
      user = cached;
    } else {
      const fresh = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { isBanned: true, role: true, lockedUntil: true },
      });
      if (fresh && useCache) authUserCache.set(payload.userId, fresh, AUTH_CACHE_TTL_MS);
      user = fresh;
    }
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    if (user.isBanned) {
      logger.warn(`[SECURITY] Banned user attempted API access: userId=${payload.userId} path=${req.path}`);
      return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'BANNED' });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ error: `Аккаунт временно заблокирован. Попробуйте через ${minutesLeft} мин.`, code: 'ACCOUNT_LOCKED' });
    }
    req.userId = payload.userId;
    req.userRole = user.role;
  } catch (e) {
    logger.error('authenticate middleware DB error:', e);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }

  // Record activity for online-user tracking (non-blocking)
  recordActivity(payload.userId);

  // Refresh User.lastActiveAt at most once per hour per user. Without this,
  // passive readers (open the app, browse, never log a workout / talk to AI)
  // would only update lastActiveAt via specific routes (workout complete,
  // meal log, AI chat) and get incorrectly bucketed into the 7/14/30d
  // reactivation cohorts. The 1h throttle keeps the DB write rate low while
  // ensuring the cohort signal stays accurate. Fire-and-forget — never block
  // the request on this bookkeeping write. Wrapped in try/catch because some
  // jest test mocks of prisma.user.update return undefined (not a thenable),
  // which would otherwise throw `.catch is not a function`.
  if (shouldSyncLastActiveAt(payload.userId)) {
    try {
      const p = prisma.user.update({
        where: { id: payload.userId },
        data: { lastActiveAt: new Date() },
      });
      if (p && typeof (p as any).catch === 'function') {
        (p as Promise<unknown>).catch(() => { /* best-effort retention bookkeeping */ });
      }
    } catch { /* mocked or otherwise non-thenable update — drop on the floor */ }
  }

  next();
};

/** Middleware: allow only ADMIN role (must be used after authenticate) */
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) return res.status(401).json({ error: 'Требуется авторизация' });
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  if (req.userRole !== 'ADMIN') {
    logger.warn(`[SECURITY] Unauthorized admin access attempt: userId=${req.userId} role=${req.userRole ?? 'none'} ip=${ip} path=${req.path}`);
    return res.status(403).json({ error: 'Доступ запрещён — только для администраторов' });
  }
  next();
};

/** Middleware: allow ADMIN or SUPPORT roles (must be used after authenticate) */
export const requireStaff = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) return res.status(401).json({ error: 'Требуется авторизация' });
  if (!req.userRole || !['ADMIN', 'SUPPORT'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Доступ запрещён — только для персонала поддержки' });
  }
  next();
};
