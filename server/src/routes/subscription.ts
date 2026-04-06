import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';

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
    console.error('Subscription status error:', e);
    res.status(500).json({ error: 'Ошибка получения подписки' });
  }
});

// ─── Activate subscription (called after successful payment) ─────────────────
router.post('/activate', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { plan, durationDays, transactionId } = req.body as {
      plan: 'pro' | 'trainer' | 'club';
      durationDays: number; // 30 for monthly, 365 for annual, 7 for trial
      transactionId?: string;
    };

    if (!plan || !durationDays) {
      return res.status(400).json({ error: 'Необходимо указать plan и durationDays' });
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

    console.log(`Subscription activated: user=${userId} plan=${plan} days=${durationDays} txn=${transactionId || 'none'}`);

    res.json({
      plan: subscription.plan,
      status: subscription.status,
      isPremium: true,
      expiresAt: endDate.toISOString(),
      startDate: startDate.toISOString(),
    });
  } catch (e) {
    console.error('Subscription activate error:', e);
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
    console.error('Subscription cancel error:', e);
    res.status(500).json({ error: 'Ошибка отмены подписки' });
  }
});

// ─── Webhook for payment providers (RevenueCat / ЮKassa) ─────────────────────
// This endpoint doesn't require auth — it's called by the payment provider
router.post('/webhook', async (req, res: Response) => {
  try {
    const { provider, event, userId, plan, durationDays, transactionId } = req.body;

    // TODO: Verify webhook signature based on provider
    // - RevenueCat: verify X-RevenueCat-Webhook-Auth header
    // - ЮKassa: verify SHA-256 signature

    console.log(`Webhook received: provider=${provider} event=${event} user=${userId}`);

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
    console.error('Webhook error:', e);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

export const subscriptionRouter = router;
