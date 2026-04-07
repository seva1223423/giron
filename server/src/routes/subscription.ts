import { Router, Response, Request } from 'express';
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

    // Auto-expire if endDate has passed
    const isExpired = subscription.endDate && new Date(subscription.endDate) < new Date();
    if (isExpired && subscription.status === 'active') {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'expired' },
      });
      return res.json({
        plan: subscription.plan,
        status: 'expired',
        isPremium: false,
        expiresAt: subscription.endDate?.toISOString() || null,
      });
    }

    const isPremium = subscription.status === 'active' && subscription.plan !== 'free';

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
    const { plan, durationDays, transactionId } = req.body as {
      plan: 'pro' | 'trainer' | 'club';
      durationDays: number;
      transactionId?: string;
    };

    if (!plan || !durationDays) {
      return res.status(400).json({ error: 'Необходимо указать plan и durationDays' });
    }

    // Only allow trial (7 days) without payment verification
    if (!transactionId && durationDays > 7) {
      return res.status(403).json({ error: 'Для активации подписки требуется подтверждение оплаты' });
    }

    // Prevent duplicate trials
    if (!transactionId) {
      const existing = await prisma.subscription.findUnique({ where: { userId } });
      if (existing) {
        return res.status(400).json({ error: 'Пробный период уже использован' });
      }
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
      where: { id: subscription.id },
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
      if (!header || !timingSafeEqual(Buffer.from(header), Buffer.from(genericSecret))) {
        logger.warn('Webhook: invalid generic secret');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    logger.info(`Webhook received: provider=${provider} event=${event} user=${userId}`);

    if (event === 'subscription_activated' || event === 'subscription_renewed') {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + (durationDays || 30));

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          plan: plan || 'pro',
          status: 'active',
          startDate,
          endDate,
        },
        update: {
          plan: plan || 'pro',
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
