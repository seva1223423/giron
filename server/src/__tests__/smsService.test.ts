/**
 * Unit tests for services/smsService.
 *
 * Two surfaces:
 *   - normalizePhone(raw): pure E.164 normalisation. Must accept the four
 *     common input shapes Russian users type (+7..., 7..., 8..., 10-digit
 *     local) and pass through arbitrary +country prefixes. A bug here =
 *     OTP delivered to wrong number / silently dropped.
 *   - sendSmsOtp(phone, code): 3-tier provider chain (SMS.ru → Twilio →
 *     dev console / production error). The "production with no provider
 *     configured" branch is the highest-stakes path: a misconfig means
 *     users can't sign in but the API returns 200, no error surfaced
 *     unless we explicitly logger.error.
 */

// jest.mock factories must come before imports.
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import { normalizePhone, sendSmsOtp } from '../services/smsService';
import { logger } from '../utils/logger';

const fetchMock = jest.fn();
beforeAll(() => {
  (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});

beforeEach(() => {
  fetchMock.mockReset();
  (logger.info as jest.Mock).mockClear();
  (logger.warn as jest.Mock).mockClear();
  (logger.error as jest.Mock).mockClear();

  // Wipe SMS env so each test sets only what it needs.
  delete process.env.SMSRU_API_ID;
  delete process.env.SMSRU_SENDER;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_PHONE_NUMBER;
  delete process.env.NODE_ENV;
});

// ── normalizePhone ──────────────────────────────────────────────────────────

describe('normalizePhone — input shapes', () => {
  test('+79991234567 → +79991234567 (already E.164)', () => {
    expect(normalizePhone('+79991234567')).toBe('+79991234567');
  });

  test('79991234567 → +79991234567 (no plus)', () => {
    expect(normalizePhone('79991234567')).toBe('+79991234567');
  });

  test('89991234567 → +79991234567 (Russian "8" prefix replaced)', () => {
    expect(normalizePhone('89991234567')).toBe('+79991234567');
  });

  test('9991234567 → +79991234567 (10-digit local form gets +7)', () => {
    expect(normalizePhone('9991234567')).toBe('+79991234567');
  });

  test('+7 (999) 123-45-67 → +79991234567 (strips spaces / parens / dashes)', () => {
    expect(normalizePhone('+7 (999) 123-45-67')).toBe('+79991234567');
  });

  test('+1 555 123 4567 → +15551234567 (passes through arbitrary country prefix)', () => {
    expect(normalizePhone('+1 555 123 4567')).toBe('+15551234567');
  });

  test('+44 20 7946 0958 → +442079460958 (UK number passes through)', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });
});

// ── sendSmsOtp — provider chain ─────────────────────────────────────────────

describe('sendSmsOtp — provider priority', () => {
  test('SMS.ru success: calls SMS.ru and stops (no Twilio fallback)', async () => {
    process.env.SMSRU_API_ID = 'test-api-id';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'OK', sms: { '+79991234567': { status: 'OK' } } }),
    });

    await sendSmsOtp('+79991234567', '123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://sms.ru/sms/send?'),
    );
    expect((logger.info as jest.Mock).mock.calls[0][0]).toMatch(/\[SMS\.ru\] sent to/);
  });

  test('SMS.ru includes the configured sender name when SMSRU_SENDER is set', async () => {
    process.env.SMSRU_API_ID = 'test-api-id';
    process.env.SMSRU_SENDER = 'Giron';
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'OK', sms: { '+79991234567': { status: 'OK' } } }),
    });

    await sendSmsOtp('+79991234567', '123456');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('from=Giron');
  });

  test('SMS.ru failure (status!=OK) falls through to Twilio', async () => {
    process.env.SMSRU_API_ID = 'test-api-id';
    process.env.TWILIO_ACCOUNT_SID = 'twilio-sid';
    process.env.TWILIO_AUTH_TOKEN = 'twilio-token';
    process.env.TWILIO_PHONE_NUMBER = '+15551110000';

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ERROR', status_code: 100 }),
    });

    // Mock the twilio require — synchronous require inside getTwilioClient()
    jest.doMock(
      'twilio',
      () => () => ({
        messages: { create: jest.fn().mockResolvedValueOnce({ sid: 'sm-1' }) },
      }),
      { virtual: true },
    );

    await sendSmsOtp('+79991234567', '123456');

    // SMS.ru was called and failed; logger.warn surfaces the error
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/\[SMS\.ru\] API error/),
    );
  });

  test('production with no provider configured → logger.error fires (silent-misconfig guard)', async () => {
    process.env.NODE_ENV = 'production';
    // No SMSRU_API_ID, no Twilio creds.

    await sendSmsOtp('+79991234567', '999000');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/\[SMS\] No provider configured in production/),
    );
    // Phone redacted to last 4 digits, code NOT logged at error level.
    const errArg = (logger.error as jest.Mock).mock.calls[0][0] as string;
    expect(errArg).toMatch(/\+7\*\*\*4567/);
    expect(errArg).not.toContain('999000');
  });

  test('non-production with no provider → dev fallback logs the code at info level', async () => {
    process.env.NODE_ENV = 'development';

    await sendSmsOtp('+79991234567', '654321');

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/\[SMS-DEV\] OTP for \+7\*\*\*4567: 654321/),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('SMS.ru network error → falls through gracefully (no throw)', async () => {
    process.env.SMSRU_API_ID = 'test-api-id';
    process.env.NODE_ENV = 'development';
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    // Should not throw despite the network error.
    await expect(sendSmsOtp('+79991234567', '111111')).resolves.toBeUndefined();
    // The dev fallback fires when both providers fail.
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/\[SMS-DEV\]/),
    );
  });
});

// ── Phone redaction in logs ─────────────────────────────────────────────────

describe('phone redaction in logs', () => {
  test('logs include only first 2 + last 4 digits of phone (PII protection per 152-ФЗ)', async () => {
    process.env.NODE_ENV = 'development';
    await sendSmsOtp('+79991234567', '111111');

    const allLogs = [
      ...(logger.info as jest.Mock).mock.calls,
      ...(logger.warn as jest.Mock).mock.calls,
      ...(logger.error as jest.Mock).mock.calls,
    ]
      .flat()
      .map((arg) => (typeof arg === 'string' ? arg : ''))
      .join(' | ');

    // Full phone must NOT appear; redacted form MUST appear.
    expect(allLogs).not.toContain('+79991234567');
    expect(allLogs).toContain('+7***4567');
  });
});
