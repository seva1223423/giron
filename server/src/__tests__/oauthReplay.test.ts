/**
 * OAuth replay cache — round 234 security audit.
 *
 * Pins the contract: the same Google `jti` (or sha256(VK/Yandex
 * access_token)) cannot be redeemed twice within TTL. Without this, a
 * captured-but-not-yet-expired token is replayable for the full
 * provider-side `exp` window (~1h for Google).
 */

// Mock prisma so importing the auth router (which calls prisma at module
// scope via the imported `prisma` symbol) doesn't try to talk to a real
// database. The replay-cache logic itself doesn't touch the DB.
jest.mock('../db', () => ({
  prisma: {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    refreshToken: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    securityEvent: { create: jest.fn(() => Promise.resolve()) },
    trustedDevice: { findFirst: jest.fn(), create: jest.fn() },
    pushToken: { findMany: jest.fn(() => Promise.resolve([])) },
    otpCode: { create: jest.fn(), findFirst: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    passwordHistory: { findMany: jest.fn() },
    passwordResetToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    usedTotpCode: { findFirst: jest.fn(), create: jest.fn() },
  },
}));

jest.mock('../services/emailService', () => ({
  sendNewLoginAlert: jest.fn(() => Promise.resolve()),
  sendOtpEmail: jest.fn(() => Promise.resolve()),
  sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  sendPasswordChangedAlert: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/pushService', () => ({
  sendPushToUser: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/smsService', () => ({
  sendSmsOtp: jest.fn(() => Promise.resolve()),
  normalizePhone: (s: string) => s,
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

import {
  _resetOAuthReplayCacheForTests,
  _markOAuthTokenSeenForTests,
} from '../routes/auth';

describe('OAuth replay cache', () => {
  beforeEach(() => {
    _resetOAuthReplayCacheForTests();
  });

  it('first sight of a key returns true (token usable)', () => {
    expect(_markOAuthTokenSeenForTests('g:jti-1')).toBe(true);
  });

  it('second sight of the SAME key returns false (replay rejected)', () => {
    expect(_markOAuthTokenSeenForTests('g:jti-1')).toBe(true);
    expect(_markOAuthTokenSeenForTests('g:jti-1')).toBe(false);
  });

  it('different keys do not collide', () => {
    expect(_markOAuthTokenSeenForTests('g:jti-1')).toBe(true);
    expect(_markOAuthTokenSeenForTests('g:jti-2')).toBe(true);
    expect(_markOAuthTokenSeenForTests('v:hash-1')).toBe(true);
    expect(_markOAuthTokenSeenForTests('y:hash-1')).toBe(true);
  });

  it('reset helper clears state — same key works again afterwards', () => {
    expect(_markOAuthTokenSeenForTests('g:jti-1')).toBe(true);
    expect(_markOAuthTokenSeenForTests('g:jti-1')).toBe(false);
    _resetOAuthReplayCacheForTests();
    expect(_markOAuthTokenSeenForTests('g:jti-1')).toBe(true);
  });

  it('per-provider key namespacing — same suffix is distinct across prefixes', () => {
    // sha256(VK) and sha256(Yandex) hashes could theoretically collide;
    // the prefix scheme prevents the wrong-provider replay window.
    expect(_markOAuthTokenSeenForTests('v:abc')).toBe(true);
    expect(_markOAuthTokenSeenForTests('y:abc')).toBe(true);
    expect(_markOAuthTokenSeenForTests('g:abc')).toBe(true);
    // each is its own slot — second sight of any specific one returns false:
    expect(_markOAuthTokenSeenForTests('v:abc')).toBe(false);
    expect(_markOAuthTokenSeenForTests('y:abc')).toBe(false);
    expect(_markOAuthTokenSeenForTests('g:abc')).toBe(false);
  });
});
