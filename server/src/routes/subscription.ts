import { Router, Response, Request } from 'express';
import { z } from 'zod';
import { createHmac, timingSafeEqual } from 'crypto';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../db';
import { logger } from '../utils/logger';
import { sendSubscriptionCancelledEmail } from '../services/emailService';
import { reportError } from '../utils/errorReporter';

// The app is targeted at the RF market: primary payment channel is ЮKassa,
// secondary is a generic webhook. RevenueCat (Apple/Google Play Billing bridge)
// is intentionally unsupported — Apple/Google in-app payments from Russia are
// not available since 2022, and keeping the branch alive was dead code plus
// attack surface (static-secret header compare was a replay risk).

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
    // Trial path: hardcoded to plan='pro'. Earlier this endpoint accepted
    // enum('pro'|'trainer'|'club'), which let any free user POST
    // `{plan:'trainer', durationDays:7}` and get 7 days of trainer
    // privileges (creating TrainerClient rows, generating invite codes,
    // reading other users' trainer data) without payment. Trainer/club
    // tiers must come from the verified webhook path only — see
    // /subscription/webhook below. If product later wants a "trainer
    // trial" it should be a distinct SKU with its own bizdev approval,
    // not a self-serve free upgrade.
    const parsed = z.object({
      plan: z.literal('pro'),
      durationDays: z.number().int().finite().min(1).max(7),
      transactionId: z.string().optional(),
      // 376-ФЗ §3 explicit auto-renewal consent timestamp. The client-side
      // modal records the moment the user ticked the consent checkbox and
      // tapped "Подтвердить"; the server requires it to be recent (≤2
      // minutes) so a stale consent screenshot can't be replayed days later
      // to authorize a renewal.
      autoRenewalConsentAt: z.string().datetime().optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Некорректные данные', details: parsed.error.flatten() });
    }
    const { plan, durationDays, transactionId, autoRenewalConsentAt } = parsed.data;

    // With transactionId: only allow activation via webhook (server-to-server).
    // The /activate endpoint from the client can ONLY start a trial.
    if (transactionId) {
      return res.status(403).json({ error: 'Активация платных подписок доступна только через webhook после подтверждения оплаты' });
    }

    // Validate consent timestamp freshness. Required for the auto-renewing
    // monthly/annual plans; for the 7-day trial we don't strictly need it
    // because there's no auto-renewal at end of trial without an explicit
    // payment step, but capturing it anyway gives us an audit trail when
    // the user converts.
    let consentDate: Date | null = null;
    if (autoRenewalConsentAt) {
      consentDate = new Date(autoRenewalConsentAt);
      const ageMs = Date.now() - consentDate.getTime();
      if (Number.isNaN(consentDate.getTime()) || ageMs < 0 || ageMs > 2 * 60 * 1000) {
        return res.status(400).json({ error: 'Согласие на автопродление просрочено или некорректно — повторите подтверждение.' });
      }
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    let subscription;
    try {
      subscription = await prisma.subscription.create({
        data: {
          userId,
          plan,
          status: 'active',
          startDate,
          endDate,
          autoRenewalConsentAt: consentDate,
        },
      });
    } catch (createErr: any) {
      if (createErr?.code === 'P2002') {
        return res.status(400).json({ error: 'Пробный период уже использован' });
      }
      throw createErr;
    }

    logger.info(`Subscription activated: user=${userId} plan=${plan} days=${durationDays} txn=${transactionId || 'none'} consent=${consentDate?.toISOString() ?? 'none'}`);

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

    // Don't delete — keep until endDate, just mark as cancelled. canceledAt
    // is the regulatory timestamp (376-ФЗ §2 audit trail) and stays
    // distinct from `status` so admin/webhook flows that also flip status
    // don't pollute the user-initiated cancellation log.
    const cancelledAt = new Date();
    await prisma.subscription.update({
      where: { id: subscription.id, userId },
      data: { status: 'cancelled', canceledAt: cancelledAt },
    });

    // Send the 376-ФЗ §2 cancellation confirmation email. Fire-and-forget —
    // we don't fail the cancel API if SMTP is down, but the regulator's
    // audit-trail expectation is "we tried", which Sentry will record on
    // failure so we have evidence of attempt+failure for any complaint.
    (async () => {
      try {
        const userRow = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, firstName: true },
        });
        if (userRow?.email) {
          await sendSubscriptionCancelledEmail(
            userRow.email,
            userRow.firstName ?? null,
            subscription.plan,
            subscription.endDate ?? cancelledAt,
          );
        }
      } catch (err) {
        reportError(err as Error, {
          userId,
          route: 'POST /subscription/cancel',
          tags: { origin: '376-fz-cancel-email' },
        });
      }
    })();

    res.json({
      plan: subscription.plan,
      status: 'cancelled',
      isPremium: true, // still premium until endDate
      expiresAt: subscription.endDate?.toISOString() || null,
      canceledAt: cancelledAt.toISOString(),
      message: 'Подписка отменена. Доступ сохранится до окончания оплаченного периода. Письмо с подтверждением отправлено.',
    });
  } catch (e) {
    logger.error('Subscription cancel error:', e);
    res.status(500).json({ error: 'Ошибка отмены подписки' });
  }
});

// ─── Webhook signature verification ──────────────────────────────────────────

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

// ─── Webhook for payment providers (ЮKassa / generic) ─────────────────────
// This endpoint doesn't require auth — it's called by the payment provider
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody: string = (req as any).rawBody ?? JSON.stringify(req.body);
    const { provider, event, userId, plan, durationDays, transactionId } = req.body;

    // Verify signature based on provider — ALWAYS require secret to be configured
    if (provider === 'revenuecat') {
      return res.status(410).json({ error: 'RevenueCat provider is no longer supported on this deployment' });
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

      // Stale-event guard: only update if the incoming endDate is strictly later than
      // the current one. Prevents out-of-order webhook replay (e.g. a retried
      // `subscription_renewed` arriving after `subscription_cancelled`) from reverting
      // a more recent, correct state.
      const current = await prisma.subscription.findUnique({ where: { userId }, select: { endDate: true } });
      if (current && current.endDate && current.endDate >= endDate) {
        logger.info(`Webhook stale event skipped: provider=${provider} event=${event} user=${userId} currentEnd=${current.endDate.toISOString()} incomingEnd=${endDate.toISOString()}`);
        return res.json({ received: true, skipped: true });
      }

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
      // Stale-event guard: an `expired` event replayed AFTER a fresh
      // `renewed` would otherwise revert the renewal — same shape of bug
      // the activated/renewed branch above already protects against. If
      // the current sub still has endDate in the future, the user has
      // re-paid since the original expiration and this is a stale replay.
      const current = await prisma.subscription.findUnique({
        where: { userId },
        select: { endDate: true, status: true },
      });
      if (current && current.endDate && current.endDate > new Date()) {
        logger.info(
          `Webhook stale subscription_expired skipped: user=${userId} ` +
          `currentEnd=${current.endDate.toISOString()} status=${current.status}`,
        );
        return res.json({ received: true, skipped: true });
      }
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
