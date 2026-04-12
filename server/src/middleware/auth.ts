import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { recordActivity } from '../utils/activityTracker';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    req.userId = payload.userId;
    // Record activity for online-user tracking (non-blocking)
    recordActivity(payload.userId);
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
};

/** Middleware: allow only ADMIN role */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) return res.status(401).json({ error: 'Требуется авторизация' });
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true, email: true } });
    if (!user || user.role !== 'ADMIN') {
      // Log unauthorized admin access attempts — could indicate a compromised account or probe
      logger.warn(`[SECURITY] Unauthorized admin access attempt by userId=${req.userId} email=${user?.email ?? 'unknown'} role=${user?.role ?? 'none'} ip=${ip} path=${req.path}`);
      return res.status(403).json({ error: 'Доступ запрещён — только для администраторов' });
    }
    req.userRole = user.role;
    next();
  } catch {
    return res.status(500).json({ error: 'Ошибка проверки прав доступа' });
  }
};

/** Middleware: allow ADMIN or SUPPORT roles */
export const requireStaff = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { role: true } });
    if (!user || !['ADMIN', 'SUPPORT'].includes(user.role)) {
      return res.status(403).json({ error: 'Доступ запрещён — только для персонала поддержки' });
    }
    req.userRole = user.role;
    next();
  } catch {
    return res.status(500).json({ error: 'Ошибка проверки прав доступа' });
  }
};
