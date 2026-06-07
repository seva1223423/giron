import { prisma } from '../db';
import { sendPushToUser } from './pushService';
import {
  sendWeeklySummaryEmail,
  sendPreRenewalNotificationEmail,
  sendActivationReminderEmail,
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
 *
 * Quiet hours: pushes (NOT emails — emails sit in inbox harmlessly) are
 * skipped during sleep hours. Giron is RU-focused so we approximate
 * Moscow time (UTC+3): no pushes between 22:00 and 08:00 Moscow =
 * 19:00..05:00 UTC. Eligible users are deferred to the next cron tick;
 * the *SentAt gate isn't set so they're picked up cleanly later.
 *
 * TODO when User.timezone exists: switch to per-user local hour and drop
 * the Moscow assumption. For users outside RU the current heuristic may
 * fire 1-3h off their actual sleep window.
 */
const QUIET_HOURS_UTC_START = 19; // 22:00 MSK
const QUIET_HOURS_UTC_END = 5;    // 08:00 MSK

function isQuietHourUtc(date: Date): boolean {
  const h = date.getUTCHours();
  // Window crosses midnight (19..23 + 0..4) — handle both halves
  return h >= QUIET_HOURS_UTC_START || h < QUIET_HOURS_UTC_END;
}

/**
 * Activation cohort: users registered ≥24h ago who never sent an AI
 * message. Goal: convert install/signup → first conversation. Two
 * channels run in parallel:
 *
 *   PUSH — sent if user has at least one push token (i.e. opened the
 *          app at least once and granted notifications). Gated by
 *          activationPushSentAt.
 *   EMAIL — sent if user has an email AND email channel hasn't fired
 *           yet. Gated by activationEmailSentAt. Reaches the silent
 *           majority that signed up via web/curl/Telegram CTA but
 *           never opened the mobile app.
 *
 * Each channel has its own write-once flag; firing on one doesn't
 * suppress the other so a user with both push + email gets a
 * coordinated nudge across channels. Internal email-domain accounts
 * (e.g. ok_*@giron.internal from the legacy OK.ru flow) are skipped
 * via the `not @giron.internal` filter.
 */
export async function processActivationCohort(): Promise<number> {
  const now = new Date();
  // Lower bound: registered ≥24h ago. Upper bound: registered ≤7 days
  // ago. The upper bound keeps the cohort tight — a user who registered
  // 3 months ago and never engaged should NOT get an activation push
  // ("ждём первого вопроса") today; they belong in the reactivation
  // cohort (which has its own copy: "we miss you, here's what's new").
  // Without this bound, a fresh deploy would fire activation emails to
  // every silent legacy account in one tick. The 7d window is forgiving
  // enough that a user who created an account, took a short break, and
  // came back still gets the nudge; tighter than that and we'd miss
  // people who signed up before a weekend.
  const minAge = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const maxAge = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Single query, two parallel candidate sets — anyone who needs
    // either push or email or both. Kept generous (300) because the
    // cron is hourly and most ticks find 0 candidates anyway.
    const candidates = await prisma.user.findMany({
      where: {
        firstChatAt: null,
        createdAt: { lt: minAge, gte: maxAge },
        isBanned: false,
        OR: [
          { activationPushSentAt: null, pushTokens: { some: {} } },
          { activationEmailSentAt: null, NOT: { email: { endsWith: '@giron.internal' } } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        email: true,
        activationPushSentAt: true,
        activationEmailSentAt: true,
        pushTokens: { select: { id: true }, take: 1 },
      },
      take: 300,
    });

    if (candidates.length === 0) return 0;

    const quietHour = isQuietHourUtc(now);
    let pushSent = 0;
    let emailSent = 0;
    let pushDeferred = 0;
    for (const user of candidates) {
      const greeting = user.firstName ? `${user.firstName}, ` : '';

      // Push path (skipped during quiet hours — no waking users at 3am)
      if (!user.activationPushSentAt && user.pushTokens.length > 0) {
        if (quietHour) {
          // *SentAt gate intentionally NOT set — user is picked up at the
          // next non-quiet tick. The cron is hourly so the worst-case
          // delay is ~10h (one full quiet window), well within the 7-day
          // activation window enforced by the createdAt filter above.
          pushDeferred++;
        } else {
          // Round 251: atomic claim-then-send. updateMany with the
          // null-condition acts as a CAS — only one of N concurrent
          // cron ticks can win the row. Caller-side null check (line
          // above) is now a fast filter; the updateMany is the
          // authoritative gate. On send failure, roll back the claim
          // so a future tick retries.
          const claim = await prisma.user.updateMany({
            where: { id: user.id, activationPushSentAt: null },
            data: { activationPushSentAt: now },
          });
          if (claim.count === 0) continue; // another tick claimed
          try {
            await sendPushToUser(user.id, {
              title: 'Iron Coach ждёт первого вопроса',
              body: `${greeting}задай ИИ-тренеру вопрос — программа, питание, техника. 30 секунд и план готов.`,
              data: { url: 'giron://ai', cohort: 'activation' },
            });
            pushSent++;
          } catch (err) {
            // Roll back the claim so a future tick retries this user.
            await prisma.user.updateMany({
              where: { id: user.id, activationPushSentAt: now },
              data: { activationPushSentAt: null },
            }).catch(() => {});
            reportError(err as Error, {
              userId: user.id,
              tags: { origin: 'retention-activation-push' },
            });
          }
        }
      }

      // Email path — same eligibility window but separate gate. Skips
      // users without a real email (synthetic *@giron.internal stubs
      // from legacy OAuth flows would bounce on every send and waste
      // the SMTP quota).
      if (!user.activationEmailSentAt && user.email && !user.email.endsWith('@giron.internal')) {
        // Round 251: atomic claim-then-send (same as push above).
        const claim = await prisma.user.updateMany({
          where: { id: user.id, activationEmailSentAt: null },
          data: { activationEmailSentAt: now },
        });
        if (claim.count === 0) continue; // another tick claimed
        try {
          await sendActivationReminderEmail(user.email, user.firstName ?? null);
          emailSent++;
        } catch (err) {
          await prisma.user.updateMany({
            where: { id: user.id, activationEmailSentAt: now },
            data: { activationEmailSentAt: null },
          }).catch(() => {});
          reportError(err as Error, {
            userId: user.id,
            tags: { origin: 'retention-activation-email' },
          });
        }
      }
    }

    logger.info(
      `[Retention] Activation cohort: ${pushSent} pushes + ${emailSent} emails` +
      (pushDeferred > 0 ? ` (${pushDeferred} push deferred to non-quiet hours)` : '') +
      ` / ${candidates.length} candidates`,
    );
    return pushSent + emailSent;
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

  // Quiet-hours guard — skip the whole cohort during sleep window. The
  // *SentAt gate isn't set so candidates roll forward to the next tick
  // automatically; no special bookkeeping needed.
  if (isQuietHourUtc(now)) {
    logger.info(
      `[Retention] Reactivation ${daysInactive}d cohort: deferred (quiet hours, ${now.getUTCHours()}:00 UTC)`,
    );
    return 0;
  }

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
      // Round 253: atomic claim-then-send — same pattern as R251
      // applied to the activation cohort. Without this, two cron
      // ticks running concurrently (deploy overlap, replica scale)
      // would both pass the null-filter and double-send.
      const claim = await prisma.user.updateMany({
        where: { id: user.id, [sentAtField]: null },
        data: { [sentAtField]: now },
      });
      if (claim.count === 0) continue; // another tick claimed
      try {
        await sendPushToUser(user.id, {
          title,
          body,
          data: { url: 'giron://ai', cohort: `reactivation-${daysInactive}d` },
        });
        sent++;
      } catch (err) {
        // Roll back so a future tick retries this user
        await prisma.user.updateMany({
          where: { id: user.id, [sentAtField]: now },
          data: { [sentAtField]: null },
        }).catch(() => {});
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
 * who completed at least one workout in the past 7 days.
 *
 * Audit 2026-05-29 (H8): per-user stats are now batched into 3 queries for the
 * whole cohort (was 2 deep queries PER user — an N+1), and each send is gated
 * by an atomic claim on User.weeklySummarySentDate so a 2nd cron tick (even
 * across a restart inside the 18:00 hour) can't double-send.
 */
export async function processWeeklySummaryEmails(): Promise<number> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  // 'YYYY-MM-DD' of the run (the Sunday) — the per-user once-per-week claim key.
  const weekKey = now.toISOString().slice(0, 10);

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

    const ids = eligible.map((u) => u.id);

    // Audit 2026-05-29 (H8): batch ALL aggregation up front (3 queries for the
    // whole cohort) instead of 2 deep queries per user (the old N+1). groupBy
    // gives per-user workout count + volume/duration sums; one workoutExercise
    // scan feeds the top-exercise pick. DB load is now flat in the cohort size.
    const [thisWeekAgg, lastWeekAgg, exerciseRows] = await Promise.all([
      prisma.workout.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, completedAt: { gte: sevenDaysAgo, lte: now } },
        _count: { _all: true },
        _sum: { totalVolume: true, durationMinutes: true },
      }),
      prisma.workout.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
        _count: { _all: true },
      }),
      prisma.workoutExercise.findMany({
        where: { workout: { userId: { in: ids }, completedAt: { gte: sevenDaysAgo, lte: now } } },
        select: {
          workout: { select: { userId: true } },
          exercise: { select: { name: true } },
          sets: { select: { weight: true, reps: true, completed: true } },
        },
      }),
    ]);

    const thisWeekByUser = new Map(thisWeekAgg.map((r) => [r.userId, r]));
    const lastWeekCountByUser = new Map(lastWeekAgg.map((r) => [r.userId, r._count._all]));

    // Per-user map of exercise name → completed-set volume, for the top pick.
    const exVolByUser = new Map<string, Map<string, number>>();
    for (const row of exerciseRows) {
      const uid = row.workout?.userId;
      const name = row.exercise?.name;
      if (!uid || !name) continue;
      const vol = row.sets
        .filter((s) => s.completed)
        .reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), 0);
      const byEx = exVolByUser.get(uid) ?? new Map<string, number>();
      byEx.set(name, (byEx.get(name) ?? 0) + vol);
      exVolByUser.set(uid, byEx);
    }

    let sent = 0;
    for (const user of eligible) {
      // Audit 2026-05-29 (H8): atomic claim-then-send — only one cron tick (even
      // across a restart inside the 18:00 hour) sends this week's summary to a
      // given user. Mirrors the activation/reactivation cohorts' CAS pattern.
      const claim = await prisma.user.updateMany({
        where: {
          id: user.id,
          OR: [{ weeklySummarySentDate: null }, { weeklySummarySentDate: { not: weekKey } }],
        },
        data: { weeklySummarySentDate: weekKey },
      });
      if (claim.count === 0) continue; // already sent this week

      try {
        const agg = thisWeekByUser.get(user.id);

        // Top exercise: highest completed-set volume this week.
        let topExerciseName: string | null = null;
        let topVolume = 0;
        for (const [name, vol] of exVolByUser.get(user.id) ?? []) {
          if (vol > topVolume) {
            topVolume = vol;
            topExerciseName = name;
          }
        }

        const stats: WeeklySummaryStats = {
          workoutsThisWeek: agg?._count._all ?? 0,
          workoutsLastWeek: lastWeekCountByUser.get(user.id) ?? 0,
          totalVolumeKg: Math.round(agg?._sum.totalVolume ?? 0),
          totalDurationMin: agg?._sum.durationMinutes ?? 0,
          topExerciseName,
          // Delta calculation deferred — needs prev-week max-set lookup.
          topExerciseDelta: null,
        };

        await sendWeeklySummaryEmail(user.email, user.firstName ?? null, stats);
        sent++;
      } catch (err) {
        // Roll back the claim so a future tick retries this user.
        await prisma.user.updateMany({
          where: { id: user.id, weeklySummarySentDate: weekKey },
          data: { weeklySummarySentDate: null },
        }).catch(() => {});
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
 * Quiet hours: the **push** is skipped during 22:00..08:00 MSK so we don't
 * wake a user with a charging warning at 03:00. The **email** still fires —
 * email is the channel that satisfies 376-ФЗ §4 (lands in inbox at any
 * time, harmless), and the gate is set on email success so the user gets
 * exactly one notice per cycle. Push is a UX nudge, not a legal channel,
 * so dropping it during sleep hours costs nothing. This matches the
 * activation cohort behaviour (push deferred, email always).
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

    const quietHour = isQuietHourUtc(now);
    let sent = 0;
    let pushDeferred = 0;
    for (const sub of candidates) {
      if (sub.user?.isBanned) continue;
      if (!sub.user?.email || !sub.endDate) continue;

      // Round 253: atomic claim before sending. The 376-ФЗ obligation
      // is "exactly one notice per renewal cycle"; a double-tick under
      // deploy overlap previously could send two emails because both
      // ticks saw renewalNoticeSentAt=null. updateMany with the null-
      // condition is a CAS — only one tick wins.
      const claim = await prisma.subscription.updateMany({
        where: { id: sub.id, renewalNoticeSentAt: null },
        data: { renewalNoticeSentAt: now },
      });
      if (claim.count === 0) continue; // another tick beat us

      try {
        // Push first (instant) when allowed, then email (slower SMTP, the
        // legally-required channel). Push is best-effort — failures are
        // swallowed so a flaky Expo response doesn't block the email path.
        if (!quietHour) {
          await sendPushToUser(sub.userId, {
            title: 'Подписка продлится через 2 дня',
            body: `Списание ${sub.endDate.toLocaleDateString('ru-RU')}. Отменить можно в разделе «Подписка».`,
            data: { url: 'giron://subscription', cohort: 'pre-renewal' },
          }).catch(() => {});
        } else {
          pushDeferred++;
        }

        await sendPreRenewalNotificationEmail(
          sub.user.email,
          sub.user.firstName ?? null,
          sub.plan,
          sub.endDate,
          sub.renewalAmountRub ?? 0,
        );
        sent++;
      } catch (err) {
        // Email failed — roll back the claim so a future tick retries.
        // This is critical for 376-ФЗ: missing notice has legal weight.
        await prisma.subscription.updateMany({
          where: { id: sub.id, renewalNoticeSentAt: now },
          data: { renewalNoticeSentAt: null },
        }).catch(() => {});
        reportError(err as Error, {
          userId: sub.userId,
          tags: { origin: '376-fz-pre-renewal' },
        });
      }
    }

    logger.info(
      `[376-ФЗ] Pre-renewal notices: sent ${sent}/${candidates.length}` +
      (pushDeferred > 0 ? ` (${pushDeferred} push deferred — quiet hours)` : ''),
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
