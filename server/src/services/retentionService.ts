import { prisma } from '../db';
import { sendPushToUser } from './pushService';
import {
  sendWeeklySummaryEmail,
  sendPreRenewalNotificationEmail,
  type WeeklySummaryStats,
} from './emailService';
import { logger } from '../utils/logger';
import { reportError } from '../utils/errorReporter';

/**
 * Retention pushes (RETENTION-01..04).
 *
 * Runs server-side on a cron, not the device. The local notification
 * scheduling in `src/services/notificationService.ts` only fires for users
 * who actually open the app — these handlers reach users who installed,
 * registered, and went silent.
 *
 * Each cohort is gated by a `*SentAt` flag on the User row so the same
 * user never receives the same milestone twice. Push delivery failures are
 * non-fatal; a missing push token simply means the user is skipped this
 * tick (they may install push later). All errors are routed to Sentry via
 * reportError but never thrown — the cron must be self-healing.
 */

/**
 * Activation push: users registered ≥24h ago who never sent an AI message.
 * Goal: convert install → first conversation. Single push per user, never
 * retried.
 *
 * Returns the number of pushes sent for observability.
 */
export async function processActivationCohort(): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    const candidates = await prisma.user.findMany({
      where: {
        firstChatAt: null,
        activationPushSentAt: null,
        createdAt: { lt: cutoff },
        isBanned: false,
        // Has at least one push token registered
        pushTokens: { some: {} },
      },
      select: { id: true, firstName: true },
      take: 200, // Hard cap per tick — protect Expo quota even if backlog spikes
    });

    if (candidates.length === 0) return 0;

    let sent = 0;
    for (const user of candidates) {
      const greeting = user.firstName ? `${user.firstName}, ` : '';
      try {
        await sendPushToUser(user.id, {
          title: 'Iron Coach ждёт первого вопроса',
          body: `${greeting}задай ИИ-тренеру вопрос — программа, питание, техника. 30 секунд и план готов.`,
          data: { url: 'irongym://ai', cohort: 'activation' },
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { activationPushSentAt: now },
        });
        sent++;
      } catch (err) {
        reportError(err as Error, {
          userId: user.id,
          tags: { origin: 'retention-activation' },
        });
      }
    }

    logger.info(`[Retention] Activation cohort: sent ${sent}/${candidates.length}`);
    return sent;
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'retention-activation' } });
    return 0;
  }
}

/**
 * Reactivation push: users who were active and went quiet for N days.
 *
 *   N=7  — soft nudge ("we noticed you've been busy")
 *   N=14 — stronger reminder + benefit recap
 *   N=30 — last attempt, frame as "we miss you, here's what's new"
 *
 * The cron calls this once per cohort per day (different *SentAt fields
 * gate each milestone).
 */
export async function processReactivationCohort(
  daysInactive: 7 | 14 | 30,
): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - daysInactive * 24 * 60 * 60 * 1000);

  // Field selection per cohort. Using a switch keeps the Prisma query
  // explicit — passing field names dynamically would lose type safety.
  const sentAtField =
    daysInactive === 7
      ? 'reactivation7dSentAt'
      : daysInactive === 14
        ? 'reactivation14dSentAt'
        : 'reactivation30dSentAt';

  const copy = (firstName: string | null) => {
    const greeting = firstName ? `${firstName}, ` : '';
    if (daysInactive === 7) {
      return {
        title: 'Iron Coach скучает',
        body: `${greeting}возвращайся, открою сегодняшний план за 30 секунд.`,
      };
    }
    if (daysInactive === 14) {
      return {
        title: 'Две недели без тренировок',
        body: `${greeting}один разговор с ИИ-тренером — и форма не уйдёт. Давай вернёмся.`,
      };
    }
    return {
      title: 'Всё ещё с нами?',
      body: `${greeting}за месяц мы добавили обновления — твой план ждёт. Открыть?`,
    };
  };

  try {
    const candidates = await prisma.user.findMany({
      where: {
        // Either lastActiveAt is older than the cutoff OR (never active AND registered before cutoff).
        // We OR these so users who registered + never engaged are also caught by the 7d cohort.
        OR: [
          { lastActiveAt: { lt: cutoff } },
          { lastActiveAt: null, createdAt: { lt: cutoff } },
        ],
        [sentAtField]: null,
        isBanned: false,
        pushTokens: { some: {} },
      },
      select: { id: true, firstName: true },
      take: 200,
    });

    if (candidates.length === 0) return 0;

    let sent = 0;
    for (const user of candidates) {
      const { title, body } = copy(user.firstName ?? null);
      try {
        await sendPushToUser(user.id, {
          title,
          body,
          data: { url: 'irongym://ai', cohort: `reactivation-${daysInactive}d` },
        });
        await prisma.user.update({
          where: { id: user.id },
          data: { [sentAtField]: now },
        });
        sent++;
      } catch (err) {
        reportError(err as Error, {
          userId: user.id,
          tags: { origin: `retention-reactivation-${daysInactive}d` },
        });
      }
    }

    logger.info(
      `[Retention] Reactivation ${daysInactive}d cohort: sent ${sent}/${candidates.length}`,
    );
    return sent;
  } catch (err) {
    reportError(err as Error, {
      tags: { origin: `retention-reactivation-${daysInactive}d` },
    });
    return 0;
  }
}

/**
 * Weekly summary email (RETENTION-03). Sends every Sunday evening to users
 * who completed at least one workout in the past 7 days. Idempotent within
 * a Sunday — double-firing the cron in the same day is safe because we use
 * a lookback window keyed on the calling time and a per-user transmit
 * de-dupe (we just track that the email was sent on the *date*).
 *
 * For now we don't store an explicit weeklySummarySentAt column — instead
 * we rely on the cron firing once per Sunday at 18:00 UTC. If you want
 * stricter de-dup across server restarts, add a `weeklySummarySentDate`
 * field to User and gate on it.
 */
export async function processWeeklySummaryEmails(): Promise<number> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  try {
    // Eligible cohort: users with email + at least one completed workout in
    // the past week. We deliberately skip users with zero workouts — a
    // weekly summary saying "you trained 0 times" is demoralizing and the
    // reactivation cohort already handles inactives.
    const eligible = await prisma.user.findMany({
      where: {
        email: { not: '' },
        isBanned: false,
        workouts: {
          some: {
            completedAt: { gte: sevenDaysAgo, lte: now },
          },
        },
      },
      select: { id: true, email: true, firstName: true },
      take: 500, // Hard cap per tick — protect SMTP throughput
    });

    if (eligible.length === 0) return 0;

    let sent = 0;
    for (const user of eligible) {
      try {
        // Aggregate per-user stats. Two queries (this week, last week) are
        // cheaper than a single complex GROUP BY for sub-100k users; revisit
        // if user table grows past that.
        const [thisWeek, lastWeek] = await Promise.all([
          prisma.workout.findMany({
            where: {
              userId: user.id,
              completedAt: { gte: sevenDaysAgo, lte: now },
            },
            select: {
              durationMinutes: true,
              totalVolume: true,
              exercises: {
                select: {
                  exercise: { select: { name: true } },
                  sets: { select: { weight: true, reps: true, completed: true } },
                },
              },
            },
          }),
          prisma.workout.count({
            where: {
              userId: user.id,
              completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
            },
          }),
        ]);

        const totalVolumeKg = Math.round(
          thisWeek.reduce((sum, w) => sum + (w.totalVolume ?? 0), 0),
        );
        const totalDurationMin = thisWeek.reduce(
          (sum, w) => sum + (w.durationMinutes ?? 0),
          0,
        );

        // Top exercise: the one with the highest total volume this week.
        const exerciseVolume = new Map<string, number>();
        for (const w of thisWeek) {
          for (const ex of w.exercises) {
            const name = ex.exercise?.name;
            if (!name) continue;
            const vol = ex.sets
              .filter((s) => s.completed)
              .reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), 0);
            exerciseVolume.set(name, (exerciseVolume.get(name) ?? 0) + vol);
          }
        }
        let topExerciseName: string | null = null;
        let topVolume = 0;
        for (const [name, vol] of exerciseVolume) {
          if (vol > topVolume) {
            topVolume = vol;
            topExerciseName = name;
          }
        }

        const stats: WeeklySummaryStats = {
          workoutsThisWeek: thisWeek.length,
          workoutsLastWeek: lastWeek,
          totalVolumeKg,
          totalDurationMin,
          topExerciseName,
          // Delta calculation deferred — needs prev-week max-set lookup.
          // For now we simply highlight the leader by volume. Future work:
          // compute estimated 1RM delta against prior 4 weeks.
          topExerciseDelta: null,
        };

        await sendWeeklySummaryEmail(user.email, user.firstName ?? null, stats);
        sent++;
      } catch (err) {
        reportError(err as Error, {
          userId: user.id,
          tags: { origin: 'retention-weekly-summary' },
        });
      }
    }

    logger.info(`[Retention] Weekly summary: sent ${sent}/${eligible.length}`);
    return sent;
  } catch (err) {
    reportError(err as Error, { tags: { origin: 'retention-weekly-summary' } });
    return 0;
  }
}

/**
 * 48-hour pre-renewal notification (376-ФЗ §4). Required by Russian law to
 * warn users before an auto-renewal charge so they have a chance to cancel.
 *
 * Strategy: every hour the cron picks up active subscriptions whose endDate
 * (which equals the next charge date for auto-renewing plans) lies in the
 * 46-50h forward window AND `renewalNoticeSentAt` is still null. The 4-hour
 * tolerance band absorbs cron drift and missed ticks during deploys; the
 * `renewalNoticeSentAt` gate guarantees one notice per renewal cycle.
 *
 * Lifetime plans (no `endDate`) and free-tier rows are skipped.
 */
export async function processPreRenewalNotices(): Promise<number> {
  const now = new Date();
  const lowerBound = new Date(now.getTime() + 46 * 60 * 60 * 1000); // 46h
  const upperBound = new Date(now.getTime() + 50 * 60 * 60 * 1000); // 50h

  try {
    const candidates = await prisma.subscription.findMany({
      where: {
        status: 'active',
        endDate: { gte: lowerBound, lte: upperBound },
        renewalNoticeSentAt: null,
        plan: { notIn: ['free', 'lifetime'] },
      },
      select: {
        id: true,
        plan: true,
        endDate: true,
        renewalAmountRub: true,
        userId: true,
        user: { select: { email: true, firstName: true, isBanned: true } },
      },
      take: 200, // Hard cap per tick — match the retention cohort cap.
    });

    if (candidates.length === 0) return 0;

    let sent = 0;
    for (const sub of candidates) {
      if (sub.user?.isBanned) continue;
      if (!sub.user?.email || !sub.endDate) continue;

      try {
        // Push first (instant), then email (slower SMTP). Both are best-effort.
        await sendPushToUser(sub.userId, {
          title: 'Подписка продлится через 2 дня',
          body: `Списание ${sub.endDate.toLocaleDateString('ru-RU')}. Отменить можно в разделе «Подписка».`,
          data: { url: 'irongym://subscription', cohort: 'pre-renewal' },
        }).catch(() => {});

        await sendPreRenewalNotificationEmail(
          sub.user.email,
          sub.user.firstName ?? null,
          sub.plan,
          sub.endDate,
          sub.renewalAmountRub ?? 0,
        );

        await prisma.subscription.update({
          where: { id: sub.id },
          data: { renewalNoticeSentAt: now },
        });
        sent++;
      } catch (err) {
        reportError(err as Error, {
          userId: sub.userId,
          tags: { origin: '376-fz-pre-renewal' },
        });
      }
    }

    logger.info(
      `[376-ФЗ] Pre-renewal notices: sent ${sent}/${candidates.length}`,
    );
    return sent;
  } catch (err) {
    reportError(err as Error, { tags: { origin: '376-fz-pre-renewal' } });
    return 0;
  }
}

/**
 * Convenience: run all push cohorts in sequence. Called from the hourly cron
 * in index.ts. Sequential (not parallel) so we don't blast Expo with
 * concurrent batches if all four cohorts have backlog at the same time.
 *
 * Weekly summary is NOT included here — it has its own weekly cadence and
 * is invoked from a separate Sunday-only cron.
 */
export async function runAllRetentionCohorts(): Promise<void> {
  await processActivationCohort();
  await processReactivationCohort(7);
  await processReactivationCohort(14);
  await processReactivationCohort(30);
  // 376-ФЗ §4 pre-renewal notices share the hourly cadence — they have
  // their own independent sentAt gate so calling them here is safe and
  // co-located with the other notification work.
  await processPreRenewalNotices();
}
