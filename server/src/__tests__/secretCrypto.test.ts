// Unit tests for the L8 at-rest encryption helper (utils/secretCrypto).
//
// The module captures the key from TOTP_ENC_KEY at import time, so we load it via
// jest.isolateModules with the env set — the rest of the server suite runs WITHOUT the key
// (verifying the no-op/plaintext path implicitly), this file verifies the WITH-key path.

describe('secretCrypto — L8 at-rest TOTP encryption (key configured)', () => {
  const ORIG = process.env.TOTP_ENC_KEY;
  let mod: typeof import('../utils/secretCrypto');

  beforeAll(() => {
    process.env.TOTP_ENC_KEY = 'test-totp-encryption-key-at-least-32-characters';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('../utils/secretCrypto');
    });
  });
  afterAll(() => {
    if (ORIG === undefined) delete process.env.TOTP_ENC_KEY;
    else process.env.TOTP_ENC_KEY = ORIG;
  });

  it('reports encryption enabled when a key is set', () => {
    expect(mod.secretEncryptionEnabled()).toBe(true);
  });

  it('round-trips encrypt -> decrypt and tags the ciphertext', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const enc = mod.encryptSecret(secret);
    expect(enc).not.toBe(secret);
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(mod.decryptSecret(enc)).toBe(secret);
  });

  it('uses a random IV (distinct ciphertext per call) yet decrypts to the same value', () => {
    const s = 'KRSXG5CTMVRXEZLU';
    const a = mod.encryptSecret(s);
    const b = mod.encryptSecret(s);
    expect(a).not.toBe(b);
    expect(mod.decryptSecret(a)).toBe(s);
    expect(mod.decryptSecret(b)).toBe(s);
  });

  it('passes legacy plaintext (no enc: prefix) through unchanged — backward compatible', () => {
    expect(mod.decryptSecret('JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects a tampered ciphertext via the GCM auth tag', () => {
    const enc = mod.encryptSecret('JBSWY3DPEHPK3PXP');
    // Corrupt the FIRST char of the ciphertext segment (not the base64 padding, which
    // Node's lenient decoder would ignore) so the GCM auth tag genuinely fails.
    const parts = enc.split(':'); // ['enc','v1', iv, tag, ct]
    parts[4] = (parts[4][0] === 'A' ? 'B' : 'A') + parts[4].slice(1);
    expect(() => mod.decryptSecret(parts.join(':'))).toThrow();
  });
});
