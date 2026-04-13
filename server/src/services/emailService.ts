import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || 'Iron Gym <noreply@irongym.app>';
const APP_NAME = 'Iron Gym';

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const resetUrl = `irongym://reset-password?token=${token}`;
  const webFallbackUrl = `${process.env.APP_URL || 'https://irongym.app'}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `${APP_NAME} — сброс пароля`,
    text: `Ты запросил сброс пароля в ${APP_NAME}.\n\nОткрой приложение и перейди по ссылке:\n${resetUrl}\n\nЕсли ссылка не работает, открой в браузере:\n${webFallbackUrl}\n\nСсылка действительна 1 час.\n\nЕсли ты не запрашивал сброс — просто проигнорируй это письмо.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #FF6B35; margin-bottom: 8px;">🏋️ ${APP_NAME}</h2>
        <h3 style="color: #333; margin-bottom: 16px;">Сброс пароля</h3>
        <p style="color: #555; line-height: 1.6;">
          Ты запросил сброс пароля. Нажми кнопку ниже чтобы создать новый пароль.
        </p>
        <a href="${resetUrl}" style="display:inline-block; background:#FF6B35; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin: 16px 0;">
          Сбросить пароль
        </a>
        <p style="color: #888; font-size: 13px; margin-top: 16px;">
          Ссылка действительна <strong>1 час</strong>.<br>
          Если ты не запрашивал сброс — проигнорируй это письмо.
        </p>
        <hr style="border:none; border-top:1px solid #eee; margin: 24px 0;">
        <p style="color: #bbb; font-size: 12px;">
          Если кнопка не работает, открой в браузере:<br>
          <a href="${webFallbackUrl}" style="color:#FF6B35;">${webFallbackUrl}</a>
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
