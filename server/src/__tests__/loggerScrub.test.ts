/**
 * Logger PII scrubbing — defense-in-depth contract tests.
 *
 * Routes are supposed to never log credentials, but a single forgotten
 * `logger.info('user', user)` would leak emails into the production log
 * stream. The scrub layer catches it. These tests pin the contract so a
 * future "oh let's just remove the slow scrub step" doesn't silently
 * regress production telemetry.
 */
import { _internal } from '../utils/logger';

const { scrub, scrubString, REDACT_KEYS } = _internal;

describe('logger.scrub — key-based redaction', () => {
  it('redacts password / token / secret keys (any case)', () => {
    const input = {
      userId: 42,
      password: 'hunter2',
      Token: 'abc.def.ghi',
      REFRESHTOKEN: 'rt-xyz',
      apiKey: 'sk-prod-...',
      Authorization: 'Bearer eyJ...',
      totpSecret: 'JBSWY3DPEHPK3PXP',
    };
    const out = scrub(input) as Record<string, unknown>;
    expect(out.userId).toBe(42);
    expect(out.password).toBe('[REDACTED]');
    expect(out.Token).toBe('[REDACTED]');
    expect(out.REFRESHTOKEN).toBe('[REDACTED]');
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.Authorization).toBe('[REDACTED]');
    expect(out.totpSecret).toBe('[REDACTED]');
  });

  it('does NOT redact userId (substring "id" must not match)', () => {
    const out = scrub({ userId: 'u-1', deviceId: 'd-2', sessionId: 's-3' }) as Record<string, unknown>;
    expect(out.userId).toBe('u-1');
    expect(out.deviceId).toBe('d-2');
    expect(out.sessionId).toBe('s-3');
  });

  it('walks nested objects', () => {
    const input = { req: { body: { email: 'a@b.co', password: 'p' }, headers: { authorization: 'Bearer x' } } };
    const out = scrub(input) as { req: { body: { email: string; password: string }; headers: { authorization: string } } };
    expect(out.req.body.password).toBe('[REDACTED]');
    expect(out.req.headers.authorization).toBe('[REDACTED]');
    // Email value (not key) goes through the string scrubber:
    expect(out.req.body.email).toBe('[REDACTED_EMAIL]');
  });

  it('redacts emails appearing inside string values anywhere in the tree', () => {
    const out = scrub({ msg: 'Invalid login attempt for user@example.com at 10:00' }) as { msg: string };
    expect(out.msg).toBe('Invalid login attempt for [REDACTED_EMAIL] at 10:00');
  });

  it('redacts JWT-shaped tokens inside string values', () => {
    const out = scrub({ msg: 'token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c' }) as { msg: string };
    expect(out.msg).toContain('[REDACTED_TOKEN]');
  });

  it('handles cycles without stack overflow', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a.self = a;
    expect(() => scrub(a)).not.toThrow();
    const out = scrub(a) as { name: string; self: unknown };
    expect(out.name).toBe('a');
    expect(out.self).toBe('[Circular]');
  });

  it('preserves Error name + scrubs Error.message and stack', () => {
    const e = new Error('Login failed for user@example.com');
    const out = scrub(e) as { name: string; message: string; stack?: string };
    expect(out.name).toBe('Error');
    expect(out.message).toBe('Login failed for [REDACTED_EMAIL]');
    if (out.stack) expect(out.stack).toMatch(/\[REDACTED_EMAIL\]/);
  });

  it('handles arrays', () => {
    const out = scrub([{ password: 'x' }, 'plain', 1]) as unknown[];
    expect((out[0] as Record<string, unknown>).password).toBe('[REDACTED]');
    expect(out[1]).toBe('plain');
    expect(out[2]).toBe(1);
  });

  it('caps recursion depth instead of blowing up on huge graphs', () => {
    let deep: unknown = { leaf: 'x' };
    for (let i = 0; i < 20; i++) deep = { wrap: deep };
    const out = scrub(deep);
    // MAX_DEPTH = 6. After 6 .wrap unwraps we should hit the placeholder
    // (depth-0 input is processed; depth-6 returns the string sentinel).
    let cur: unknown = out;
    for (let i = 0; i < 6; i++) cur = (cur as Record<string, unknown>).wrap;
    expect(cur).toBe('[Object — max depth]');
  });

  it('passes primitives through unchanged', () => {
    expect(scrub(null)).toBe(null);
    expect(scrub(undefined)).toBe(undefined);
    expect(scrub(42)).toBe(42);
    expect(scrub(true)).toBe(true);
    expect(scrub('plain')).toBe('plain');
  });

  it('REDACT_KEYS includes the high-value keys', () => {
    for (const k of ['password', 'token', 'refreshtoken', 'authorization', 'cookie', 'apikey', 'totpsecret']) {
      expect(REDACT_KEYS.has(k)).toBe(true);
    }
  });

  it('scrubString redacts both emails and JWTs', () => {
    // Realistic JWT shape: 8+/12+/8+ base64url segments. Ours: 10/16/10.
    expect(scrubString('mail a@b.com and tok aaaaaaaaaa.bbbbbbbbbbbbbbbb.cccccccccc'))
      .toMatch(/\[REDACTED_EMAIL\].*\[REDACTED_TOKEN\]/);
  });
});
