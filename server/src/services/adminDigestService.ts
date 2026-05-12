import { prisma } from '../db';
import { sendPushToUser } from './pushService';
import { sendDailyAdminDigestEmail } from './emailService';
import { logger } from '../utils/logger';
import { reportError } from '../utils/errorReporter';

/**
 * Daily admin digest — packages the 5 key metrics into a push + email
 * delivered to every ADMIN user every morning at 09:00 МСК (06:00 UTC).
 *
 * Why automatic delivery, not just a dashboard:
 *   - The dashboard requires the founder to remember to open it. The point
 *     of metrics is to *force* eye contact, not hope for it.
 *   - Daily delta vs yesterday is the cheapest possible early-warning
 *     system: a single bad day shows up as a chip in the digest before it
 *     compounds into a month of churn.
 *   - Push gives 5-second visibility on the lock screen; email keeps a
 *     searchable archive so trends across weeks are recoverable.
 *
 * Metrics included (mirrors /admin/metrics/key plus today-vs-yesterday
 * deltas which make sense at daily cadence but not the 30d cadence of the
 * dashboard endpoint):
 *
 *   1. Paying users (current + 30d delta)
 *   2. Daily new signups (today + delta vs yesterday)
 *   3. Daily completed workouts (today + delta vs yesterday)
 *   4. Daily AI messages (today + delta vs yesterday)
 *   5. Daily new paid subscriptions (today + delta vs yesterday)
 *
 * The digest is intentionally daily-flavoured (today vs yesterday) rather
 * than 30-day window — the dashboard already has 30-day numbers. The
 * digest's job is to surface anomalies fast.
 */

interface AdminDigestStats {
  date: string;
  /** Paying users right now (status active OR cancelled-not-yet-expired). */
  payingNow: number;
  /** Net change in paying users vs 30 days ago. */
  payingDelta30d: number;
  /** New signups today (UTC day). */
  signupsToday: number;
  signupsYesterday: number;
  workoutsToday: number;
  workoutsYesterday: number;
  aiMessagesToday: number;
  aiMessagesYesterday: number;
  newSubsToday: number;
  newSubsYesterday: number;
  /** Activation rate for the cohort that signed up YESTERDAY (so there's been
   *  >24h to react). null when the cohort is empty. */
  activationRateYesterdayPct: number | null;
}

/**
 * Compute the digest stats. Read-only — safe to call ad-hoc from /admin
 * preview routes too.
 */
export async function computeDigestStats(): Promise<AdminDigestStats> {
  const now = new Date();
  const todayUtc = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const yesterdayUtc = new Date(todayUtc.getTime() - 86_400_000);
  const dayBeforeYesterdayUtc = new Date(yesterdayUtc.getTime() - 86_400_000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

  const [
    payingNow,
    payingThirtyDaysAgo,
    signupsToday,
    signupsYesterday,
    workoutsToday,
    workoutsYesterday,
    aiMessagesToday,
    aiMessagesYesterday,
    newSubsToday,
    newSubsYesterday,
    yesterdayCohort,
  ] = await Promise.all([
    prisma.subscription.count({
      where: {
        plan: { not: 'free' },
        OR: [
          { status: 'active' },
          { status: 'cancelled', endDate: { gte: now } },
        ],
      },
    }),
    prisma.subscription.count({
      where: {
        plan: { not: 'free' },
        createdAt: { lte: thirtyDaysAgo },
        OR: [{ endDate: null }, { endDate: { gte: thirtyDaysAgo } }],
      },
    }),
    prisma.user.count({ where: { createdAt: { gte: todayUtc } } }),
    prisma.user.count({ where: { createdAt: { gte: yesterdayUtc, lt: todayUtc } } }),
    prisma.workout.count({ where: { completedAt: { gte: todayUtc } } }),
    prisma.workout.count({ where: { completedAt: { gte: yesterdayUtc, lt: todayUtc } } }),
    prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: todayUtc } } }),
    prisma.chatMessage.count({ where: { role: 'user', createdAt: { gte: yesterdayUtc, lt: todayUtc } } }),
    prisma.subscription.count({
      where: { plan: { not: 'free' }, createdAt: { gte: todayUtc } },
    }),
    prisma.subscription.count({
      where: {
        plan: { not: 'free' },
        createdAt: { gte: yesterdayUtc, lt: todayUtc },
      },
    }),
    // Yesterday's signup cohort — used to compute activation rate (% who
    // chatted within 24h). dayBeforeYesterday window so they had a full
    // day to engage; today's cohort is too fresh to evaluate.
    prisma.user.findMany({
      where: { createdAt: { gte: dayBeforeYesterdayUtc, lt: yesterdayUtc } },
      select: { firstChatAt: true, createdAt: true },
    }),
  ]);

  const yesterdayCohortSize = yesterdayCohort.length;
  const yesterdayActivated = yesterdayCohort.filter(
    (u) =>
      u.firstChatAt != null &&
      u.firstChatAt.getTime() - u.createdAt.getTime() <= 86_400_000,
  ).length;
  const activationRateYesterdayPct =
    yesterdayCohortSize > 0
      ? Math.round((yesterdayActivated / yesterdayCohortSize) * 1000) / 10
      : null;

  return {
    date: todayUtc.toISOString().slice(0, 10),
    payingNow,
    payingDelta30d: payingNow - payingThirtyDaysAgo,
    signupsToday,
    signupsYesterday,
    workoutsToday,
    workoutsYesterday,
    aiMessagesToday,
    aiMessagesYesterday,
    newSubsToday,
    newSubsYesterday,
    activationRateYesterdayPct,
  };
}

/**
 * Format a delta as a tiny inline tag. Used for both push body (single line)
 * and email subject. Returns " (+5)" / " (-2)" / " (=)" so it can be
 * concatenated to a label without extra spacing logic at the call site.
 */
function fmtDelta(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? ` (+${curr})` : '';
  const d = curr - prev;
  if (d === 0) return ' (=)';
  return d > 0 ? ` (+${d})` : ` (${d})`;
}

/**
 * Send the digest to all admin users. Idempotent within a day — relies on
 * the 24h cron tick, no per-user `sentAt` flag because there's only ever a
 * handful of admins and double-firing would be more confusing to debug
 * than valuable to dedupe at scale we'll never hit. Push and email failures
 * are independent — if SMTP is down, push still lands.
 */
export async function sendDailyAdminDigest(): Promise<number> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isBanned: false },
      select: { id: true, email: true, firstName: true },
    });

    if (admins.length === 0) {
      logger.info('[AdminDigest] No admin users — skipping digest');
      return 0;
    }

    const stats = await computeDigestStats();

    // Compact push body: one line per metric, no fluff. The push title
    // carries the date so timestamps in lock-screen history stay obvious
    // even after 3 days of accumulated digests.
    const pushTitle = `📊 Giron — ${stats.date}`;
    const pushBody = [
      `Платят: ${stats.payingNow}${stats.payingDelta30d >= 0 ? ` (+${stats.payingDelta30d}` : ` (${stats.payingDelta30d}`} за 30д)`,
      `Регистраций: ${stats.signupsToday}${fmtDelta(stats.signupsToday, stats.signupsYesterday)}`,
      `Тренировок: ${stats.workoutsToday}${fmtDelta(stats.workoutsToday, stats.workoutsYesterday)}`,
      stats.activationRateYesterdayPct != null
        ? `Активация (вчер.): ${stats.activationRateYesterdayPct}%`
        : '',
    ].filter(Boolean).join(' · ');

    let delivered = 0;
    for (const admin of admins) {
      try {
        await sendPushToUser(admin.id, {
          title: pushTitle,
          body: pushBody,
          data: { url: 'giron://admin/metrics-key', cohort: 'admin-digest' },
        }).catch(() => {});

        if (admin.email) {
          await sendDailyAdminDigestEmail(
            admin.email,
            admin.firstName ?? null,
            stats,
          );
        }
        delivered++;
      } catch (err) {
        reportError(err as Error, {
          userId: admin.id,
          tags: { origin: 'admin-digest' },
        });
      }
    }

    logger.info(
      `[AdminDigest] Sent ${delivered}/${admins.length} digest(s) for ${stats.date}`,
    );
    return delivered;
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'admin-digest' } });
    return 0;
  }
}

export type { AdminDigestStats };
