import { logger } from '../utils/logger';

let twilioClient: any = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const twilio = require('twilio');
  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
}

/**
 * Send OTP code via SMS.
 * Falls back to console.log if Twilio is not configured (dev mode).
 */
export async function sendSmsOtp(phone: string, code: string): Promise<void> {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!client || !from) {
    // Dev mode — log OTP to console
    logger.info(`[SMS-DEV] OTP for ${phone}: ${code}`);
    return;
  }

  await client.messages.create({
    body: `Ваш код подтверждения Iron Gym: ${code}. Действителен 10 минут.`,
    from,
    to: phone,
  });

  logger.info(`[SMS] OTP sent to ${phone}`);
}
