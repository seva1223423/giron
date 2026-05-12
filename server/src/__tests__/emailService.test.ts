/**
 * Unit tests for services/emailService.
 *
 * The module's central design choice is the SMTP-disabled gate:
 * `SMTP_CONFIGURED` is computed ONCE at module load from
 * SMTP_HOST + SMTP_USER + SMTP_PASS. When any one is missing, every
 * sendMail call short-circuits to a fake successful resolution
 * (messageId='disabled') so callers' happy paths keep working in dev.
 *
 * Highest-stakes pieces to lock in:
 *   1. isSmtpConfigured() reflects the env state at module load — used
 *      by /admin/test-notification to report TRUTHFULLY whether email
 *      is wired. Lying here = false-positive "✓ email sent" UI.
 *   2. When SMTP is disabled, transporter.sendMail returns a fake-success
 *      object instead of either calling nodemailer OR throwing.
 *   3. When SMTP is configured, the call DOES land on nodemailer with
 *      the expected `from`, `to`, `subject` shape.
 *   4. HTML templates escape user-provided strings (firstName, IP,
 *      newEmail) so a tracked-injection email body can't break out of
 *      the surrounding markup.
 *
 * Module-level state means each test that toggles SMTP_CONFIGURED
 * needs jest.isolateModules + a fresh nodemailer mock setup.
 */

const ENV_KEYS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_FROM', 'APP_URL'] as const;

function clearSmtpEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function configureSmtpEnv() {
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_USER = 'user@example.com';
  process.env.SMTP_PASS = 'secret';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_FROM = 'Giron <noreply@giron.app>';
}

beforeEach(() => {
  jest.resetModules();
  clearSmtpEnv();
});

afterAll(() => {
  clearSmtpEnv();
});

// ── isSmtpConfigured() ─────────────────────────────────────────────────────

describe('isSmtpConfigured', () => {
  test('returns false when no env vars are set', () => {
    jest.isolateModules(() => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail: jest.fn() }),
      }));
      const { isSmtpConfigured } = require('../services/emailService');
      expect(isSmtpConfigured()).toBe(false);
    });
  });

  test('returns false when only SMTP_HOST is set (incomplete config)', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    jest.isolateModules(() => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail: jest.fn() }),
      }));
      const { isSmtpConfigured } = require('../services/emailService');
      expect(isSmtpConfigured()).toBe(false);
    });
  });

  test('returns false when only SMTP_HOST + SMTP_USER are set (still incomplete)', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user@example.com';
    jest.isolateModules(() => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail: jest.fn() }),
      }));
      const { isSmtpConfigured } = require('../services/emailService');
      expect(isSmtpConfigured()).toBe(false);
    });
  });

  test('returns true ONLY when all three of HOST + USER + PASS are set', () => {
    configureSmtpEnv();
    jest.isolateModules(() => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail: jest.fn() }),
      }));
      const { isSmtpConfigured } = require('../services/emailService');
      expect(isSmtpConfigured()).toBe(true);
    });
  });

  test('returns false when SMTP_PASS is empty string (Boolean coercion)', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'user@example.com';
    process.env.SMTP_PASS = '';
    jest.isolateModules(() => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail: jest.fn() }),
      }));
      const { isSmtpConfigured } = require('../services/emailService');
      expect(isSmtpConfigured()).toBe(false);
    });
  });
});

// ── SMTP-disabled gate ─────────────────────────────────────────────────────

describe('SMTP-disabled gate (no env credentials)', () => {
  test('sendPasswordResetEmail returns silently — no nodemailer call, no throw', async () => {
    const sendMail = jest.fn();
    await jest.isolateModulesAsync(async () => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail }),
      }));
      const { sendPasswordResetEmail } = require('../services/emailService');
      await expect(
        sendPasswordResetEmail('u@example.com', 'reset-token'),
      ).resolves.toBeUndefined();
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  test('sendOtpEmail returns silently when SMTP not configured', async () => {
    const sendMail = jest.fn();
    await jest.isolateModulesAsync(async () => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail }),
      }));
      const { sendOtpEmail } = require('../services/emailService');
      await expect(sendOtpEmail('u@example.com', '123456')).resolves.toBeUndefined();
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  test('warns ONCE per process about the disabled state (not on every call)', async () => {
    const sendMail = jest.fn();
    const warn = jest.fn();
    await jest.isolateModulesAsync(async () => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail }),
      }));
      jest.doMock('../utils/logger', () => ({
        logger: { info: jest.fn(), warn, error: jest.fn() },
      }));
      const { sendOtpEmail } = require('../services/emailService');

      await sendOtpEmail('u@example.com', '111111');
      await sendOtpEmail('v@example.com', '222222');
      await sendOtpEmail('w@example.com', '333333');

      const disabledWarns = warn.mock.calls.filter((c) =>
        typeof c[0] === 'string' && c[0].includes('outbound email is disabled'),
      );
      expect(disabledWarns).toHaveLength(1);
    });
  });
});

// ── SMTP configured: real path lands on nodemailer ─────────────────────────

describe('SMTP configured (all env vars set)', () => {
  test('sendOtpEmail calls nodemailer.sendMail with the correct envelope shape', async () => {
    configureSmtpEnv();
    const sendMail: jest.Mock = jest.fn(async () => ({ messageId: 'real-id' }));
    await jest.isolateModulesAsync(async () => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail }),
      }));
      const { sendOtpEmail } = require('../services/emailService');
      await sendOtpEmail('u@example.com', '424242');

      expect(sendMail).toHaveBeenCalledTimes(1);
      const call = sendMail.mock.calls[0][0] as {
        from: string; to: string; subject: string; text: string; html: string;
      };
      expect(call.from).toBe('Giron <noreply@giron.app>');
      expect(call.to).toBe('u@example.com');
      expect(call.subject).toMatch(/код подтверждения/i);
      expect(call.text).toContain('424242');
      expect(call.html).toContain('424242');
    });
  });

  test('sendPasswordResetEmail builds the reset URL from APP_URL + token', async () => {
    configureSmtpEnv();
    process.env.APP_URL = 'https://app.example.com';
    const sendMail: jest.Mock = jest.fn(async () => ({ messageId: 'real-id' }));
    await jest.isolateModulesAsync(async () => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail }),
      }));
      const { sendPasswordResetEmail } = require('../services/emailService');
      await sendPasswordResetEmail('u@example.com', 'tok-123');

      const call = sendMail.mock.calls[0][0] as { text: string; html: string };
      expect(call.text).toContain('https://app.example.com/reset-password?token=tok-123');
      expect(call.html).toContain('https://app.example.com/reset-password?token=tok-123');
    });
  });

  test('sendPasswordResetEmail uses default APP_URL=https://giron.app when env not set', async () => {
    configureSmtpEnv();
    delete process.env.APP_URL;
    const sendMail: jest.Mock = jest.fn(async () => ({ messageId: 'real-id' }));
    await jest.isolateModulesAsync(async () => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail }),
      }));
      const { sendPasswordResetEmail } = require('../services/emailService');
      await sendPasswordResetEmail('u@example.com', 'tok-xyz');

      const call = sendMail.mock.calls[0][0] as { html: string };
      expect(call.html).toContain('https://giron.app/reset-password?token=tok-xyz');
    });
  });
});

// ── HTML escaping (anti-injection) ─────────────────────────────────────────

describe('HTML escaping in email templates', () => {
  test('sendPasswordChangedAlert escapes <script> in IP field (defence-in-depth)', async () => {
    configureSmtpEnv();
    const sendMail: jest.Mock = jest.fn(async () => ({ messageId: 'real-id' }));
    await jest.isolateModulesAsync(async () => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail }),
      }));
      const { sendPasswordChangedAlert } = require('../services/emailService');
      const malIp = '<script>alert(1)</script>';
      await sendPasswordChangedAlert('u@example.com', malIp, new Date('2026-05-01T00:00:00Z'));

      const html = (sendMail.mock.calls[0][0] as { html: string }).html;
      // Raw <script> must NOT appear; escaped form MUST.
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  test('sendEmailChangedAlert escapes the new email address (anti-XSS)', async () => {
    configureSmtpEnv();
    const sendMail: jest.Mock = jest.fn(async () => ({ messageId: 'real-id' }));
    await jest.isolateModulesAsync(async () => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail }),
      }));
      const { sendEmailChangedAlert } = require('../services/emailService');
      const evil = 'evil"><script>alert(1)</script>@example.com';
      await sendEmailChangedAlert('old@example.com', evil, '127.0.0.1', new Date('2026-05-01'));

      const html = (sendMail.mock.calls[0][0] as { html: string }).html;
      expect(html).not.toContain('"><script>');
      expect(html).toContain('&quot;&gt;&lt;script&gt;');
    });
  });

  test('sendWeeklySummaryEmail escapes firstName (top-of-email greeting injection)', async () => {
    configureSmtpEnv();
    const sendMail: jest.Mock = jest.fn(async () => ({ messageId: 'real-id' }));
    await jest.isolateModulesAsync(async () => {
      jest.doMock('nodemailer', () => ({
        createTransport: () => ({ sendMail }),
      }));
      const { sendWeeklySummaryEmail } = require('../services/emailService');
      const malName = '<img src=x onerror=alert(1)>';
      await sendWeeklySummaryEmail('u@example.com', malName, {
        workoutsThisWeek: 3,
        workoutsLastWeek: 2,
        totalVolumeKg: 5000,
        totalDurationMin: 180,
        topExerciseName: null,
        topExerciseDelta: null,
      });

      const html = (sendMail.mock.calls[0][0] as { html: string }).html;
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });
  });
});
