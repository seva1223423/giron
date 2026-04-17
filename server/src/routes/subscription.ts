import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';

const router = Router();

// ─── Get subscription status ─────────────────────────────────────────────────
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription) {
      return res.json({
        plan: 'free',
        status: 'active',
        isPremium: false,
        expiresAt: null,
      });
    }

    // Auto-expire if endDate has passed. Handle both 'active' and 'cancelled' (cancelled = access until endDate).
    const isExpired = subscription.endDate && new Date(subscription.endDate) < new Date();
    if (isExpired && (subscription.status === 'active' || subscription.status === 'cancelled')) {
      try {
        await prisma.subscription.update({
          where: { id: subscription.id, status: subscription.status },
          data: { status: 'expired' },
        });
      } catch (e: any) {
        if (e?.code !== 'P2025') throw e; // P2025 = concurrent request already expired it, safe to ignore
      }
      return res.json({
        plan: subscription.plan,
        status: 'expired',
        isPremium: false,
        expiresAt: subscription.endDate?.toISOString() || null,
      });
    }

    // isPremium: active OR cancelled-but-not-yet-expired (access until endDate)
    const isPremium = (subscription.status === 'active' || subscription.status === 'cancelled') &&
      subscription.plan !== 'free' &&
      (!subscription.endDate || subscription.endDate >= new Date());

    res.json({
      plan: subscription.plan,
      status: subscription.status,
      isPremium,
      expiresAt: subscription.endDate?.toISOString() || null,
      startDate: subscription.startDate.toISOString(),
    });
  } catch (e) {
    logger.error('Subscription status error:', e);
    res.status(500).json({ error: 'Ошибка получения подписки' });
  }
});

// ─── Activate subscription (called after successful payment) ─────────────────
// NOTE: In production, this endpoint should verify payment with the payment provider.
// Currently only allows trial (7 days) without transactionId. Real payments require webhook confirmation.
router.post('/activate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const parsed = z.object({
      plan: z.enum(['pro', 'trainer', 'club']),
      durationDays: z.number().int().min(1).max(7),
      transactionId: z.string().optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    }
    const { plan, durationDays, transactionId } = parsed.data;

    // With transactionId: only allow activation via webhook (server-to-server).
    // The /activate endpoint from the client can ONLY start a trial.
    if (transactionId) {
      return res.status(403).json({ error: 'Активация платных подписок доступна только через webhook после подтверждения оплаты' });
    }

    // Prevent duplicate trials — block if user ever had any subscription
    const existing = await prisma.subscription.findUnique({ where: { userId } });
    if (existing) {
      return res.status(400).json({ error: 'Пробный период уже использован' });
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    const subscription = await prisma.subscription.upsert({
      where: { userId },
      create: {
        userId,
        plan,
        status: 'active',
        startDate,
        endDate,
      },
      update: {
        plan,
        status: 'active',
        startDate,
        endDate,
      },
    });

    logger.info(`Subscription activated: user=${userId} plan=${plan} days=${durationDays} txn=${transactionId || 'none'}`);

    res.json({
      plan: subscription.plan,
      status: subscription.status,
      isPremium: true,
      expiresAt: endDate.toISOString(),
      startDate: startDate.toISOString(),
    });
  } catch (e) {
    logger.error('Subscription activate error:', e);
    res.status(500).json({ error: 'Ошибка активации подписки' });
  }
});

// ─── Cancel subscription ─────────────────────────────────────────────────────
router.post('/cancel', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const subscription = await prisma.subscription.findUnique({
      where: { userId },
    });

    if (!subscription || subscription.status !== 'active') {
      return res.status(400).json({ error: 'Нет активной подписки' });
    }

    // Don't delete — keep until endDate, just mark as cancelled
    await prisma.subscription.update({
      where: { id: subscription.id, userId },
      data: { status: 'cancelled' },
    });

    res.json({
      plan: subscription.plan,
      status: 'cancelled',
      isPremium: true, // still premium until endDate
      expiresAt: subscription.endDate?.toISOString() || null,
      message: 'Подписка отменена. Доступ сохранится до окончания оплаченного периода.',
    });
  } catch (e) {
    logger.error('Subscription cancel error:', e);
    res.status(500).json({ error: 'Ошибка отмены подписки' });
  }
});

// ─── Webhook signature verification ──────────────────────────────────────────

function verifyRevenueCatSignature(req: Request): boolean {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.headers['x-revenuecat-webhook-auth'] as string | undefined;
  if (!header) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(secret));
  } catch {
    return false;
  }
}

function verifyYukassaSignature(req: Request, rawBody: string): boolean {
  const secret = process.env.YUKASSA_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = req.headers['x-yukassa-signature'] as string | undefined;
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Webhook for payment providers (RevenueCat / ЮKassa) ─────────────────────
// This endpoint doesn't require auth — it's called by the payment provider
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody: string = (req as any).rawBody ?? JSON.stringify(req.body);
    const { provider, event, userId, plan, durationDays, transactionId } = req.body;

    // Verify signature based on provider — ALWAYS require secret to be configured
    if (provider === 'revenuecat') {
      if (!process.env.REVENUECAT_WEBHOOK_SECRET) {
        logger.warn('Webhook: REVENUECAT_WEBHOOK_SECRET not configured, rejecting');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }
      if (!verifyRevenueCatSignature(req)) {
        logger.warn('Webhook: invalid RevenueCat signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else if (provider === 'yukassa') {
      if (!process.env.YUKASSA_WEBHOOK_SECRET) {
        logger.warn('Webhook: YUKASSA_WEBHOOK_SECRET not configured, rejecting');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }
      if (!verifyYukassaSignature(req, rawBody)) {
        logger.warn('Webhook: invalid ЮKassa signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else {
      // Generic secret — always required
      const genericSecret = process.env.WEBHOOK_SECRET;
      if (!genericSecret) {
        logger.warn('Webhook: WEBHOOK_SECRET not configured, rejecting');
        return res.status(500).json({ error: 'Webhook secret not configured' });
      }
      const header = req.headers['x-webhook-secret'] as string | undefined;
      let signatureValid = false;
      try {
        signatureValid = !!header && timingSafeEqual(Buffer.from(header), Buffer.from(genericSecret));
      } catch { /* different lengths — treat as invalid */ }
      if (!signatureValid) {
        logger.warn('Webhook: invalid generic secret');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    logger.info(`Webhook received: provider=${provider} event=${event} user=${userId}`);

    // Validate required fields before touching the DB
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId обязателен' });
    }

    // Verify user exists — prevents P2003 FK violation on subscription upsert
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userExists) {
      logger.warn(`Webhook: unknown userId=${userId} provider=${provider} event=${event}`);
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Validate plan and duration — prevent attacker-controlled values from slipping through
    const VALID_PLANS = ['free', 'pro', 'trainer', 'club'] as const;
    const resolvedPlan = VALID_PLANS.includes(plan) ? plan : 'pro';
    const resolvedDays = Math.min(Math.max(parseInt(durationDays, 10) || 30, 1), 3650); // 1 day – 10 years

    if (event === 'subscription_activated' || event === 'subscription_renewed') {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + resolvedDays);

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: resolvedPlan,
          status: 'active',
          startDate,
          endDate,
        },
        update: {
          plan: resolvedPlan,
          status: 'active',
          startDate,
          endDate,
        },
      });
    } else if (event === 'subscription_cancelled') {
      await prisma.subscription.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'cancelled' },
      });
    } else if (event === 'subscription_expired') {
      await prisma.subscription.updateMany({
        where: { userId },
        data: { status: 'expired' },
      });
    }

    res.json({ received: true });
  } catch (e) {
    logger.error('Webhook error:', e);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

export const subscriptionRouter = router;
