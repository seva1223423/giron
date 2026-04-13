import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { recordActivity } from '../utils/activityTracker';
import { logger } from '../utils/logger';

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
    payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }

  // Check if user is banned (don't hit DB on every request — sample 20% for performance,
  // always check on sensitive mutations; for simplicity we check every request)
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isBanned: true, role: true },
    });
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    if (user.isBanned) {
      logger.warn(`[SECURITY] Banned user attempted API access: userId=${payload.userId} path=${req.path}`);
      return res.status(403).json({ error: 'Аккаунт заблокирован', code: 'BANNED' });
    }
    req.userId = payload.userId;
    req.userRole = user.role;
  } catch (e) {
    logger.error('authenticate middleware DB error:', e);
    return res.status(500).json({ error: 'Ошибка сервера' });
  }

  // Record activity for online-user tracking (non-blocking)
  recordActivity(payload.userId);
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
