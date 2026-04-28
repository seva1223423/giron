import { logger } from '../utils/logger';

// ── Phone normalization ────────────────────────────────────────────────────────
/**
 * Normalize Russian/CIS phone numbers to E.164 format (+7XXXXXXXXXX).
 * Handles: +79991234567, 79991234567, 89991234567, 9991234567
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return '+7' + digits.slice(1);
  }
  if (digits.length === 10) {
    return '+7' + digits;
  }
  if (raw.startsWith('+')) return raw.replace(/[\s\-()]/g, '');
  return '+' + digits;
}

// ── SMS.ru provider ────────────────────────────────────────────────────────────

async function sendViaSmsRu(phone: string, text: string): Promise<boolean> {
  const apiId = process.env.SMSRU_API_ID;
  if (!apiId) return false;

  try {
    const params = new URLSearchParams({ api_id: apiId, to: phone, msg: text, json: '1' });
    if (process.env.SMSRU_SENDER) params.set('from', process.env.SMSRU_SENDER);

    const resp = await fetch(`https://sms.ru/sms/send?${params.toString()}`);
    const data = await resp.json() as any;

    if (data.status === 'OK') {
      const statuses = Object.values(data.sms || {}) as any[];
      if (statuses.every((s: any) => s.status === 'OK')) {
        logger.info(`[SMS.ru] sent to ${phone}`);
        return true;
      }
      logger.warn(`[SMS.ru] delivery failed: ${statuses[0]?.status_code}`);
    } else {
      logger.warn(`[SMS.ru] API error: ${data.status_code}`);
    }
  } catch (e: any) {
    logger.warn(`[SMS.ru] error: ${e.message}`);
  }
  return false;
}

// ── Twilio provider ────────────────────────────────────────────────────────────

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

async function sendViaTwilio(phone: string, text: string): Promise<boolean> {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!client || !from) return false;

  try {
    await client.messages.create({ body: text, from, to: phone });
    logger.info(`[Twilio] sent to ${phone}`);
    return true;
  } catch (e: any) {
    logger.warn(`[Twilio] failed: ${e.message}`);
    return false;
  }
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Send OTP via SMS.
 * Priority: SMS.ru (Russian provider) → Twilio → dev console.
 *
 * In production, falling through to the dev console means the user never
 * receives an SMS while the API still returns 200 — a silent misconfig that's
 * easy to miss in logs. Escalate it to error level so it surfaces immediately.
 */
export async function sendSmsOtp(phone: string, code: string): Promise<void> {
  const normalized = normalizePhone(phone);
  const text = `Iron Gym: код ${code}. Действителен 10 мин. Никому не сообщайте.`;

  if (await sendViaSmsRu(normalized, text)) return;
  if (await sendViaTwilio(normalized, text)) return;

  if (process.env.NODE_ENV === 'production') {
    logger.error(
      `[SMS] No provider configured in production — OTP for ${normalized} was NOT delivered. ` +
      `Set SMSRU_API_ID (or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_PHONE_NUMBER) in server env.`,
    );
    return;
  }

  logger.info(`[SMS-DEV] OTP for ${normalized}: ${code}`);
}
