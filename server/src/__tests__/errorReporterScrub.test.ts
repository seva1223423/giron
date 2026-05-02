/**
 * Sentry beforeSend scrub — round 234/235 contract tests.
 *
 * Pins:
 *   1. Token-aware key matching (round 235): `cardio` no longer false-
 *      positives on `card`; `pageGoal`/`subscriptionGoal` still scrubbed
 *      because training goals are спец-категория PD.
 *   2. event.user / event.request / breadcrumbs scrubbed (round 234).
 *   3. query_string stripped from event.request.
 *   4. Concat patterns (apikey, totpsecret, idtoken) match without
 *      separators.
 */
import { _internal } from '../utils/errorReporter';

const { shouldScrubKey, scrubObject, scrubSentryEvent, tokenizeKey } = _internal;

describe('errorReporter — token-aware key matching (round 235)', () => {
  it.each([
    'password',
    'userPassword',
    'user_password',
    'newPassword',
    'CURRENT_PASSWORD',
    'totpCode',
    'totpsecret',
    'totp_secret',
    'apiKey',
    'api_key',
    'idToken',
    'id_token',
    'refreshToken',
    'authorization',
    'Cookie',
    'set-cookie',
    'sessionId',
    'sessionToken',
    'email',
    'userEmail',
    'phone',
    'phoneNumber',
    'firstName',
    'fullName',
    // Health (152-ФЗ)
    'weight',
    'currentWeight',
    'height',
    'pulse',
    'goal',
    'pageGoal',           // intentional — goals are health data
    'subscriptionGoal',   // same
    'injury',
    'injuries',
    'injured',
    'allergy',
    'allergies',
    'medication',
    'medications',
    // Payment
    'card',
    'cardNumber',
    'cardHolder',
    'cvv',
    'iban',
    'pan',
  ])('SCRUBS %s', (key) => {
    expect(shouldScrubKey(key)).toBe(true);
  });

  it.each([
    'cardio',          // round 235 fix — `card` substring used to false-positive
    'pinned',          // `pin` substring used to false-positive
    'shipping',
    'pancake',         // `pan` substring used to false-positive
    'panel',
    'orientation',     // `iban` etc. should not hit
    'userId',
    'createdAt',
    'updatedAt',
    'name',
    'count',
    'duration',
    'reps',
    'sets',
  ])('does NOT scrub %s', (key) => {
    expect(shouldScrubKey(key)).toBe(false);
  });

  it('cardioSession IS scrubbed (session token wins) — documented trade-off', () => {
    // `cardioSession` tokenizes to ['cardio', 'session']. The `session`
    // token matches because session-IDs are auth credentials. Cost is
    // losing CardioSession breadcrumb context in Sentry — accepted as a
    // safer-default trade-off (we never want auth sessions leaking, and
    // training-session telemetry is replayable from the DB anyway).
    expect(shouldScrubKey('cardioSession')).toBe(true);
    expect(shouldScrubKey('workoutSession')).toBe(true);
    expect(shouldScrubKey('trainerSession')).toBe(true);
  });

  it('tokenizeKey splits camelCase, snake_case, and kebab-case', () => {
    expect(tokenizeKey('userPasswordHash')).toEqual(['user', 'password', 'hash']);
    expect(tokenizeKey('user_password_hash')).toEqual(['user', 'password', 'hash']);
    expect(tokenizeKey('User-Agent')).toEqual(['user', 'agent']);
    expect(tokenizeKey('cardioSession')).toEqual(['cardio', 'session']);
  });
});

describe('errorReporter — scrubObject', () => {
  it('replaces sensitive values with [scrubbed]', () => {
    const obj: Record<string, unknown> = {
      userId: 'u-1',
      password: 'hunter2',
      cardio: { duration: 30 },
      cardNumber: '4111-1111-1111-1111',
    };
    scrubObject(obj);
    expect(obj.userId).toBe('u-1');
    expect(obj.password).toBe('[scrubbed]');
    expect((obj.cardio as { duration: number }).duration).toBe(30);
    expect(obj.cardNumber).toBe('[scrubbed]');
  });

  it('walks nested objects', () => {
    const obj = { req: { body: { email: 'a@b.com', age: 30 } } };
    scrubObject(obj);
    expect(obj.req.body.email).toBe('[scrubbed]');
    expect(obj.req.body.age).toBe(30);
  });

  it('respects MAX_SCRUB_DEPTH (no infinite recursion)', () => {
    let deep: Record<string, unknown> = { leaf: 'x', password: 'p' };
    for (let i = 0; i < 20; i++) deep = { wrap: deep };
    expect(() => scrubObject(deep)).not.toThrow();
  });

  it('handles arrays', () => {
    const arr = [{ password: 'a' }, { name: 'b' }];
    scrubObject(arr);
    expect(arr[0].password).toBe('[scrubbed]');
    expect((arr[1] as { name: string }).name).toBe('b');
  });

  it('null + non-object inputs are no-ops', () => {
    expect(() => scrubObject(null)).not.toThrow();
    expect(() => scrubObject(undefined)).not.toThrow();
    expect(() => scrubObject('plain' as unknown as object)).not.toThrow();
    expect(() => scrubObject(42 as unknown as object)).not.toThrow();
  });
});

describe('errorReporter — scrubSentryEvent', () => {
  it('scrubs event.request.data / headers / cookies', () => {
    const event = {
      request: {
        data: { email: 'x@y.co', message: 'ok' },
        headers: { Authorization: 'Bearer abc', 'User-Agent': 'jest' },
        cookies: { session: 's', other: 'o' },
      },
    };
    scrubSentryEvent(event);
    expect(event.request.data.email).toBe('[scrubbed]');
    expect(event.request.data.message).toBe('ok');
    expect(event.request.headers.Authorization).toBe('[scrubbed]');
    expect(event.request.headers['User-Agent']).toBe('jest');
    expect(event.request.cookies.session).toBe('[scrubbed]');
    expect(event.request.cookies.other).toBe('o');
  });

  it('strips event.request.query_string entirely', () => {
    const event = { request: { query_string: 'token=abc&reset=xyz' } };
    scrubSentryEvent(event);
    expect(event.request.query_string).toBe('[scrubbed]');
  });

  it('removes event.user.email / .ip_address / .username (round 234)', () => {
    const event = {
      user: { id: 'u-1', email: 'a@b.com', ip_address: '1.2.3.4', username: 'foo' },
    };
    scrubSentryEvent(event);
    expect(event.user.id).toBe('u-1');
    expect((event.user as { email?: string }).email).toBeUndefined();
    expect((event.user as { ip_address?: string }).ip_address).toBeUndefined();
    expect((event.user as { username?: string }).username).toBeUndefined();
  });

  it('walks event.extra / contexts / tags', () => {
    const event = {
      extra: { password: 'p', count: 5 },
      contexts: { runtime: { name: 'node', secret: 's' } },
      tags: { route: '/api/x', email: 'a@b.com' },
    };
    scrubSentryEvent(event);
    expect((event.extra as { password: string }).password).toBe('[scrubbed]');
    expect((event.extra as { count: number }).count).toBe(5);
    expect((event.contexts.runtime as { secret: string }).secret).toBe('[scrubbed]');
    expect((event.tags as { email: string }).email).toBe('[scrubbed]');
  });

  it('walks breadcrumb data', () => {
    const event = {
      breadcrumbs: [
        { category: 'http', data: { token: 't', url: '/api/x' } },
        { category: 'console', message: 'ok' },
      ],
    };
    scrubSentryEvent(event);
    const data = (event.breadcrumbs[0] as { data: { token: string; url: string } }).data;
    expect(data.token).toBe('[scrubbed]');
    expect(data.url).toBe('/api/x');
  });

  it('null / non-object inputs are no-ops', () => {
    expect(() => scrubSentryEvent(null)).not.toThrow();
    expect(() => scrubSentryEvent(undefined)).not.toThrow();
    expect(() => scrubSentryEvent({})).not.toThrow();
  });
});
