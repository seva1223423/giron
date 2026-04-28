import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

/** Escape HTML special characters to prevent injection in email templates */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Email sending is gated on a complete SMTP config (host + user + pass).
 * Without all three set, every send call returns silently — the caller
 * keeps its happy path, no noisy SMTP-auth errors flood Sentry, and no
 * cron loop dies. Useful state during early development before SMTP is
 * wired, and as a self-healing fallback if env credentials get rotated
 * out by mistake.
 *
 * We log a one-time warning on first send attempt so the operator knows
 * the no-op is intentional, not a silent failure.
 */
const SMTP_CONFIGURED = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
);
let smtpDisabledWarned = false;
function warnSmtpDisabledOnce(): void {
  if (smtpDisabledWarned) return;
  smtpDisabledWarned = true;
  logger.warn('[Email] SMTP_HOST/SMTP_USER/SMTP_PASS not all set — outbound email is disabled. Set all three in env to re-enable.');
}

const realTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Wraps the real nodemailer transporter so every send goes through the
 * SMTP_CONFIGURED gate. The shape mimics what nodemailer.Transporter
 * exposes (just the `sendMail` method we actually use) so callers stay
 * unchanged. When SMTP is disabled this returns a resolved promise with
 * a fake messageId — that lets the calling code's `await` complete
 * without blowing up the request handler.
 */
const transporter = {
  async sendMail(options: Parameters<typeof realTransporter.sendMail>[0]) {
    if (!SMTP_CONFIGURED) {
      warnSmtpDisabledOnce();
      return { messageId: 'disabled', accepted: [], rejected: [], response: 'SMTP disabled' } as any;
    }
    return realTransporter.sendMail(options);
  },
};

const FROM = process.env.SMTP_FROM || 'Iron Gym <noreply@irongym.app>';
const APP_NAME = 'Iron Gym';

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  // Sec audit 2026-04: HIGH-8. Use the verified https:// universal/app link
  // as the primary tap target. The custom-scheme `irongym://` is registered
  // without `android:autoVerify="true"` and can be hijacked by a malicious
  // app installed on the device — sending the raw reset token to that app.
  // The https URL is claimed via assetlinks.json + apple-app-site-association
  // (deployment requirement: host both files at irongym.app/.well-known/),
  // so OS-level link verification routes the tap to our app, falling back
  // to the browser if the app isn't installed.
  const appUrl = process.env.APP_URL || 'https://irongym.app';
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `${APP_NAME} — сброс пароля`,
    text: `Ты запросил сброс пароля в ${APP_NAME}.\n\nПерейди по ссылке, чтобы создать новый пароль:\n${resetUrl}\n\nСсылка действительна 1 час.\n\nЕсли ты не запрашивал сброс — просто проигнорируй это письмо.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #8B5CF6; margin-bottom: 8px;">🏋️ ${APP_NAME}</h2>
        <h3 style="color: #333; margin-bottom: 16px;">Сброс пароля</h3>
        <p style="color: #555; line-height: 1.6;">
          Ты запросил сброс пароля. Нажми кнопку ниже чтобы создать новый пароль.
        </p>
        <a href="${resetUrl}" style="display:inline-block; background:#8B5CF6; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin: 16px 0;">
          Сбросить пароль
        </a>
        <p style="color: #888; font-size: 13px; margin-top: 16px;">
          Ссылка действительна <strong>1 час</strong>.<br>
          Если ты не запрашивал сброс — проигнорируй это письмо.
        </p>
        <hr style="border:none; border-top:1px solid #eee; margin: 24px 0;">
        <p style="color: #bbb; font-size: 12px;">
          Если кнопка не работает, скопируй ссылку:<br>
          <a href="${resetUrl}" style="color:#8B5CF6;">${resetUrl}</a>
        </p>
      </div>
    `,
  });

  logger.info(`[Email] Password reset sent to ${email}`);
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `${APP_NAME} — код подтверждения`,
    text: `Ваш код подтверждения: ${code}\n\nКод действителен 10 минут. Если вы не запрашивали код — проигнорируйте это письмо.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #8B5CF6; margin-bottom: 8px;">🏋️ ${APP_NAME}</h2>
        <h3 style="color: #333; margin-bottom: 16px;">Код подтверждения</h3>
        <p style="color: #555; line-height: 1.6;">Введите этот код в приложении:</p>
        <div style="background: #f5f5f7; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #8B5CF6;">${code}</span>
        </div>
        <p style="color: #888; font-size: 13px;">
          Код действителен <strong>10 минут</strong>.<br>
          Если вы не запрашивали код — проигнорируйте это письмо.
        </p>
      </div>
    `,
  });
  logger.info(`[Email] OTP sent to ${email}`);
}

export async function sendPasswordChangedAlert(email: string, ip: string, date: Date): Promise<void> {
  const dateStr = date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' });
  const safeIp = esc(ip);
  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `${APP_NAME} — пароль изменён`,
    text: `Пароль вашего аккаунта ${APP_NAME} был изменён.\n\nДата: ${dateStr} (МСК)\nIP: ${ip}\n\nЕсли это были не вы — немедленно воспользуйтесь функцией сброса пароля.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #8B5CF6; margin-bottom: 8px;">🏋️ ${APP_NAME}</h2>
        <h3 style="color: #333; margin-bottom: 16px;">Пароль изменён</h3>
        <p style="color: #555; line-height: 1.6;">Пароль вашего аккаунта был успешно изменён.</p>
        <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="margin: 4px 0; color: #333; font-size: 14px;"><strong>Дата:</strong> ${esc(dateStr)} (МСК)</p>
          <p style="margin: 4px 0; color: #333; font-size: 14px;"><strong>IP-адрес:</strong> ${safeIp}</p>
        </div>
        <p style="color: #EF4444; font-weight: bold; font-size: 14px;">
          Если это были не вы — немедленно воспользуйтесь функцией <a href="irongym://forgot-password" style="color: #EF4444;">сброса пароля</a>.
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 16px;">
          Это автоматическое уведомление системы безопасности ${APP_NAME}.
        </p>
      </div>
    `,
  });
  logger.info(`[Email] Password changed alert sent to ${email}`);
}

/**
 * Weekly summary email (RETENTION-03). Sent Sunday evening to users with at
 * least one workout in the past 7 days. The numbers are pre-computed by
 * retentionService to keep this template a pure formatter.
 */
export interface WeeklySummaryStats {
  workoutsThisWeek: number;
  workoutsLastWeek: number;
  totalVolumeKg: number;
  totalDurationMin: number;
  topExerciseName: string | null;
  /** "+5 кг" / "—" / "новый PR" — already formatted upstream */
  topExerciseDelta: string | null;
}

export async function sendWeeklySummaryEmail(
  email: string,
  firstName: string | null,
  stats: WeeklySummaryStats,
): Promise<void> {
  const greeting = firstName ? `${esc(firstName)}, ` : '';
  const trend = stats.workoutsThisWeek - stats.workoutsLastWeek;
  const trendLine =
    trend > 0
      ? `На ${trend} тренировку больше, чем неделей раньше — отличный темп.`
      : trend === 0
        ? 'Тот же ритм, что и неделей раньше — стабильность.'
        : 'На прошлой неделе было больше — давай вернём ритм.';

  const prLine = stats.topExerciseName
    ? `Лидер недели — <strong>${esc(stats.topExerciseName)}</strong>${stats.topExerciseDelta ? ` (${esc(stats.topExerciseDelta)})` : ''}.`
    : '';

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `${APP_NAME} — итоги недели`,
    text: `${greeting}итоги недели в ${APP_NAME}:\n\n` +
      `Тренировок: ${stats.workoutsThisWeek} (на прошлой: ${stats.workoutsLastWeek})\n` +
      `Общий объём: ${stats.totalVolumeKg.toLocaleString('ru-RU')} кг\n` +
      `Время в зале: ${stats.totalDurationMin} мин\n` +
      (stats.topExerciseName ? `Лидер недели: ${stats.topExerciseName}${stats.topExerciseDelta ? ` (${stats.topExerciseDelta})` : ''}\n` : '') +
      `\n${trendLine}\n\nОткрой приложение, чтобы спланировать следующую неделю.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #8B5CF6; margin-bottom: 8px;">🏋️ ${APP_NAME}</h2>
        <h3 style="color: #333; margin-bottom: 16px;">Итоги недели</h3>
        <p style="color: #555; line-height: 1.6;">${greeting}вот как прошла твоя неделя:</p>
        <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="margin: 6px 0; color: #333; font-size: 15px;"><strong>Тренировок:</strong> ${stats.workoutsThisWeek} <span style="color:#888; font-size:13px;">(на прошлой: ${stats.workoutsLastWeek})</span></p>
          <p style="margin: 6px 0; color: #333; font-size: 15px;"><strong>Общий объём:</strong> ${stats.totalVolumeKg.toLocaleString('ru-RU')} кг</p>
          <p style="margin: 6px 0; color: #333; font-size: 15px;"><strong>Время в зале:</strong> ${stats.totalDurationMin} мин</p>
          ${prLine ? `<p style="margin: 6px 0; color: #333; font-size: 15px;">${prLine}</p>` : ''}
        </div>
        <p style="color: #555; line-height: 1.6;">${esc(trendLine)}</p>
        <a href="irongym://progress" style="display:inline-block; background:#8B5CF6; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin: 16px 0;">
          Открыть прогресс
        </a>
        <hr style="border:none; border-top:1px solid #eee; margin: 24px 0;">
        <p style="color: #bbb; font-size: 12px;">
          Отписаться от еженедельных писем можно в настройках приложения.
        </p>
      </div>
    `,
  });
  logger.info(`[Email] Weekly summary sent to ${email}`);
}

/**
 * Subscription cancellation confirmation (376-ФЗ §2). Sent the moment the
 * user taps "Отменить подписку". Confirms the access-until date so they
 * have written record of when premium ends — matches the regulatory
 * requirement to acknowledge cancellation in writing.
 */
export async function sendSubscriptionCancelledEmail(
  email: string,
  firstName: string | null,
  plan: string,
  accessUntil: Date,
): Promise<void> {
  const greeting = firstName ? `${esc(firstName)}, ` : '';
  const accessUntilStr = accessUntil.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `${APP_NAME} — подписка отменена`,
    text:
      `${greeting}подписка ${plan} отменена.\n\n` +
      `Доступ к премиум-функциям сохраняется до ${accessUntilStr} (МСК).\n` +
      `После этой даты автосписаний не будет.\n\n` +
      `Если это была ошибка — оформи подписку заново в разделе «Подписка».`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #8B5CF6; margin-bottom: 8px;">🏋️ ${APP_NAME}</h2>
        <h3 style="color: #333; margin-bottom: 16px;">Подписка отменена</h3>
        <p style="color: #555; line-height: 1.6;">${greeting}подписка <strong>${esc(plan)}</strong> успешно отменена.</p>
        <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="margin: 4px 0; color: #333; font-size: 14px;"><strong>Доступ сохраняется до:</strong> ${esc(accessUntilStr)} (МСК)</p>
          <p style="margin: 4px 0; color: #333; font-size: 14px;"><strong>Автоматических списаний:</strong> больше не будет</p>
        </div>
        <p style="color: #555; line-height: 1.6;">
          Если отмена случилась по ошибке — открой раздел «Подписка» в приложении и оформи заново.
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 16px;">
          Это подтверждение отмены подписки в соответствии с требованиями 376-ФЗ.
        </p>
      </div>
    `,
  });
  logger.info(`[Email] Subscription cancelled confirmation sent to ${email}`);
}

/**
 * Pre-renewal notification (376-ФЗ §4). Sent ~48h before an auto-renewal
 * charge. Must include the renewal date, amount, and a clear path to
 * cancel — failing to deliver this is a regulatory violation, not a UX
 * miss.
 */
export async function sendPreRenewalNotificationEmail(
  email: string,
  firstName: string | null,
  plan: string,
  renewalDate: Date,
  amountRub: number,
): Promise<void> {
  const greeting = firstName ? `${esc(firstName)}, ` : '';
  const renewalDateStr = renewalDate.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `${APP_NAME} — автоматическое продление через 2 дня`,
    text:
      `${greeting}напоминаем: подписка ${plan} продлится автоматически.\n\n` +
      `Дата списания: ${renewalDateStr} (МСК)\n` +
      `Сумма: ${amountRub.toLocaleString('ru-RU')} ₽\n\n` +
      `Если хочешь отменить продление — открой раздел «Подписка» в приложении и нажми «Отменить подписку». Доступ сохранится до конца оплаченного периода, но новых списаний не будет.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #8B5CF6; margin-bottom: 8px;">🏋️ ${APP_NAME}</h2>
        <h3 style="color: #333; margin-bottom: 16px;">Автоматическое продление через 2 дня</h3>
        <p style="color: #555; line-height: 1.6;">${greeting}напоминаем: подписка <strong>${esc(plan)}</strong> продлится автоматически.</p>
        <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="margin: 4px 0; color: #333; font-size: 14px;"><strong>Дата списания:</strong> ${esc(renewalDateStr)} (МСК)</p>
          <p style="margin: 4px 0; color: #333; font-size: 14px;"><strong>Сумма:</strong> ${amountRub.toLocaleString('ru-RU')} ₽</p>
        </div>
        <p style="color: #555; line-height: 1.6;">
          Если не хочешь продлевать — открой раздел «Подписка» в приложении и нажми «Отменить подписку». Доступ сохранится до конца оплаченного периода.
        </p>
        <a href="irongym://subscription" style="display:inline-block; background:#8B5CF6; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin: 16px 0;">
          Открыть «Подписка»
        </a>
        <p style="color: #888; font-size: 12px; margin-top: 16px;">
          Это автоматическое уведомление о предстоящем списании в соответствии с требованиями 376-ФЗ.
        </p>
      </div>
    `,
  });
  logger.info(`[Email] Pre-renewal notification sent to ${email} (renewal ${renewalDateStr})`);
}

/**
 * Daily admin digest email — accepts the AdminDigestStats payload computed
 * by adminDigestService.computeDigestStats(). Renders a compact HTML
 * snapshot with current numbers + day-over-day deltas. Sent at 09:00 МСК
 * to every ADMIN user.
 *
 * The stats type is duplicated here as a local interface so emailService
 * stays free of cross-module imports — adminDigestService imports this
 * function, and circular imports are easier to avoid than diagnose.
 */
export interface AdminDigestEmailStats {
  date: string;
  payingNow: number;
  payingDelta30d: number;
  signupsToday: number;
  signupsYesterday: number;
  workoutsToday: number;
  workoutsYesterday: number;
  aiMessagesToday: number;
  aiMessagesYesterday: number;
  newSubsToday: number;
  newSubsYesterday: number;
  activationRateYesterdayPct: number | null;
}

export async function sendDailyAdminDigestEmail(
  email: string,
  firstName: string | null,
  stats: AdminDigestEmailStats,
): Promise<void> {
  const greeting = firstName ? `${esc(firstName)}, ` : '';

  // HTML delta — green for positive movement, red for negative. The colour
  // semantic is "more is better" by default; the goodWhenNegative option
  // would flip it for metrics like churn (not currently surfaced in the
  // digest, but the helper takes the option for forward compatibility).
  const fmtDelta = (curr: number, prev: number, opts?: { goodWhenNegative?: boolean }) => {
    if (prev === 0) return curr > 0 ? `+${curr}` : '—';
    const d = curr - prev;
    if (d === 0) return '=';
    const isPositive = opts?.goodWhenNegative ? d < 0 : d > 0;
    const color = isPositive ? '#10B981' : '#EF4444';
    const sign = d > 0 ? '+' : '';
    return `<span style="color:${color}; font-weight:700;">${sign}${d}</span>`;
  };

  // Plain-text delta for the text/plain alternative — no colour.
  const fmtDeltaPlain = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? ` (+${curr})` : '';
    const d = curr - prev;
    if (d === 0) return ' (=)';
    return d > 0 ? ` (+${d})` : ` (${d})`;
  };

  const dateLabel = new Date(`${stats.date}T00:00:00.000Z`).toLocaleDateString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const subject = `${APP_NAME} — отчёт за ${dateLabel}`;

  const text =
    `${greeting}отчёт ${APP_NAME} за ${dateLabel}:\n\n` +
    `Платят сейчас: ${stats.payingNow} (${stats.payingDelta30d >= 0 ? '+' : ''}${stats.payingDelta30d} за 30д)\n` +
    `Регистраций: ${stats.signupsToday}${fmtDeltaPlain(stats.signupsToday, stats.signupsYesterday)}\n` +
    `Тренировок: ${stats.workoutsToday}${fmtDeltaPlain(stats.workoutsToday, stats.workoutsYesterday)}\n` +
    `AI-сообщений: ${stats.aiMessagesToday}${fmtDeltaPlain(stats.aiMessagesToday, stats.aiMessagesYesterday)}\n` +
    `Новых подписок: ${stats.newSubsToday}${fmtDeltaPlain(stats.newSubsToday, stats.newSubsYesterday)}\n` +
    (stats.activationRateYesterdayPct != null
      ? `Активация (вчерашняя когорта в первые 24ч): ${stats.activationRateYesterdayPct}%\n`
      : '') +
    `\nОткрой панель «5 ключевых чисел» в админке для подробностей.`;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject,
    text,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; background: #FFFFFF;">
        <h2 style="color: #8B5CF6; margin: 0 0 4px 0;">📊 ${APP_NAME}</h2>
        <h3 style="color: #1F2937; margin: 0 0 16px 0;">Отчёт за ${esc(dateLabel)}</h3>

        <p style="color: #6B7280; line-height: 1.5; margin: 0 0 16px 0;">
          ${greeting}автоматическая сводка ключевых метрик.
        </p>

        <table style="width: 100%; border-collapse: separate; border-spacing: 0 8px;">
          <tr>
            <td style="background: #F5F3FF; border-radius: 12px; padding: 16px;">
              <div style="font-size: 12px; color: #6B7280; font-weight: 600;">ПЛАТЯТ СЕЙЧАС</div>
              <div style="font-size: 28px; font-weight: 800; color: #1F2937; margin-top: 4px;">
                ${stats.payingNow}
                <span style="font-size: 14px; font-weight: 600; color: ${stats.payingDelta30d >= 0 ? '#10B981' : '#EF4444'}; margin-left: 8px;">
                  ${stats.payingDelta30d >= 0 ? '+' : ''}${stats.payingDelta30d} <span style="color:#9CA3AF; font-weight:400;">за 30д</span>
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #F9FAFB; border-radius: 12px; padding: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #4B5563; font-size: 14px;">Регистраций сегодня</span>
                <span style="color: #1F2937; font-size: 20px; font-weight: 700;">
                  ${stats.signupsToday} <span style="font-size: 13px;">${fmtDelta(stats.signupsToday, stats.signupsYesterday)}</span>
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #F9FAFB; border-radius: 12px; padding: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #4B5563; font-size: 14px;">Тренировок завершено</span>
                <span style="color: #1F2937; font-size: 20px; font-weight: 700;">
                  ${stats.workoutsToday} <span style="font-size: 13px;">${fmtDelta(stats.workoutsToday, stats.workoutsYesterday)}</span>
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #F9FAFB; border-radius: 12px; padding: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #4B5563; font-size: 14px;">AI-сообщений</span>
                <span style="color: #1F2937; font-size: 20px; font-weight: 700;">
                  ${stats.aiMessagesToday} <span style="font-size: 13px;">${fmtDelta(stats.aiMessagesToday, stats.aiMessagesYesterday)}</span>
                </span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background: #F9FAFB; border-radius: 12px; padding: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #4B5563; font-size: 14px;">Новых подписок</span>
                <span style="color: #1F2937; font-size: 20px; font-weight: 700;">
                  ${stats.newSubsToday} <span style="font-size: 13px;">${fmtDelta(stats.newSubsToday, stats.newSubsYesterday)}</span>
                </span>
              </div>
            </td>
          </tr>
          ${
            stats.activationRateYesterdayPct != null
              ? `
          <tr>
            <td style="background: #ECFDF5; border-radius: 12px; padding: 14px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #047857; font-size: 14px;">Активация (когорта 24ч назад)</span>
                <span style="color: #047857; font-size: 20px; font-weight: 800;">
                  ${stats.activationRateYesterdayPct}%
                </span>
              </div>
            </td>
          </tr>`
              : ''
          }
        </table>

        <p style="color: #9CA3AF; font-size: 11px; margin-top: 24px; line-height: 1.5;">
          Это автоматическая ежедневная сводка ${APP_NAME}. Источник — server/src/services/adminDigestService.ts (cron 09:00 МСК).
        </p>
      </div>
    `,
  });
  logger.info(`[Email] Daily admin digest sent to ${email} (${stats.date})`);
}

export async function sendNewLoginAlert(email: string, ip: string, userAgent: string | null, date: Date): Promise<void> {
  const dateStr = date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'medium', timeStyle: 'short' });
  const device = userAgent
    ? (userAgent.includes('iPhone') ? 'iPhone' : userAgent.includes('Android') ? 'Android' : userAgent.slice(0, 60))
    : 'Неизвестное устройство';

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `${APP_NAME} — вход с нового устройства`,
    text: `В ваш аккаунт выполнен вход с нового устройства.\n\nДата: ${dateStr} (МСК)\nIP: ${ip}\nУстройство: ${device}\n\nЕсли это были не вы — немедленно смените пароль и включите двухфакторную аутентификацию.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #8B5CF6; margin-bottom: 8px;">🏋️ ${APP_NAME}</h2>
        <h3 style="color: #333; margin-bottom: 16px;">Вход с нового устройства</h3>
        <p style="color: #555; line-height: 1.6;">В ваш аккаунт выполнен вход с нового IP-адреса или устройства.</p>
        <div style="background: #f5f5f7; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="margin: 4px 0; color: #333; font-size: 14px;"><strong>Дата:</strong> ${esc(dateStr)} (МСК)</p>
          <p style="margin: 4px 0; color: #333; font-size: 14px;"><strong>IP-адрес:</strong> ${esc(ip)}</p>
          <p style="margin: 4px 0; color: #333; font-size: 14px;"><strong>Устройство:</strong> ${esc(device)}</p>
        </div>
        <p style="color: #EF4444; font-weight: bold; font-size: 14px;">
          Если это были не вы — немедленно смените пароль и включите двухфакторную аутентификацию.
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 16px;">
          Это автоматическое уведомление системы безопасности ${APP_NAME}.
        </p>
      </div>
    `,
  });
  logger.info(`[Email] New login alert sent to ${email}`);
}
