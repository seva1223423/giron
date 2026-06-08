import crypto from 'crypto';
import { logger } from './logger';

// Application-layer encryption for long-lived auth secrets stored in the DB (audit
// 2026-06-07 L8). The TOTP seed (User.totpSecret) is the one long-lived auth secret that
// CANNOT be hashed — the server must recompute codes from it — so it was kept as plaintext
// base32. A DB leak (Neon backup/replica, SQLi, an insider opening Prisma Studio) would
// hand an attacker every account's 2FA seed, defeating 2FA entirely. AES-256-GCM with a
// server-held key (TOTP_ENC_KEY, kept OUT of the DB) makes a raw DB read useless.
//
// SAFE ROLLOUT: when TOTP_ENC_KEY is unset, encryptSecret() is a no-op (stores plaintext,
// identical to today's behaviour) and decryptSecret() returns values as-is — so this is
// safe to deploy BEFORE the key is configured. decryptSecret() also transparently reads
// legacy plaintext rows (no enc: prefix), so existing secrets keep working after the key is
// set; they get re-encrypted the next time they're written (e.g. on 2FA re-setup).

const RAW_KEY = process.env.TOTP_ENC_KEY || '';
// Derive a fixed 32-byte AES key from the env secret of any length (>= 32 chars advised).
const KEY: Buffer | null = RAW_KEY ? crypto.createHash('sha256').update(RAW_KEY).digest() : null;
const PREFIX = 'enc:v1:';

if (RAW_KEY && RAW_KEY.length < 32) {
  logger.warn('[secretCrypto] TOTP_ENC_KEY is set but shorter than 32 chars — use a longer key for stronger at-rest encryption.');
}

/** True when at-rest encryption is active (TOTP_ENC_KEY configured). */
export function secretEncryptionEnabled(): boolean {
  return KEY !== null;
}

/** Encrypt a secret for storage. Returns ciphertext (`enc:v1:iv:tag:ct`, base64 parts)
 *  when TOTP_ENC_KEY is set; otherwise returns the plaintext unchanged. */
export function encryptSecret(plain: string): string {
  if (!KEY) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + iv.toString('base64') + ':' + tag.toString('base64') + ':' + ct.toString('base64');
}

/** Decrypt a stored secret. Values without the enc: prefix are returned as-is (legacy
 *  plaintext / pre-key-rollout), so this is backward-compatible. Throws only if an
 *  encrypted value is present but the key is missing/wrong (a real misconfiguration). */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext — pass through
  if (!KEY) throw new Error('[secretCrypto] encrypted secret present but TOTP_ENC_KEY is not set');
  const parts = stored.split(':'); // ['enc','v1', iv, tag, ct]
  const iv = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  const ct = Buffer.from(parts[4], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
