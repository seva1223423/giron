/**
 * A follow-up continues the conversation's topic.
 *
 * The classifier is per-message regex, so "а вчера?" asked right after
 * "сколько я съел сегодня?" fell to `general` — nutrition blocks were not
 * built, the tuning was generic, and the answer ignored what the person was
 * obviously still asking about. The fix lets classification see one turn
 * back, under tight rules, because inheriting too eagerly is worse than not
 * inheriting: a write-intent must never fire on a message with nothing in it
 * to write.
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});
jest.mock('../db', () => ({
  prisma: { user: { findUnique: jest.fn() }, aIMemory: { findMany: jest.fn().mockResolvedValue([]) } },
}));
jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { classifyIntent, classifyIntentWithContext, isShortFollowUp } from '../routes/ai';

describe('the baseline miss this exists to fix', () => {
  test('"а вчера?" alone is general — the classifier cannot know the topic', () => {
    expect(classifyIntent('а вчера?')).toBe('general');
  });
});

describe('follow-ups inherit the topic', () => {
  test('"а вчера?" after a nutrition question stays nutrition', () => {
    // Found while writing this: "сколько калорий я съел сегодня?" classifies
    // as data_logging — "съел" outweighs the question mark. A question about
    // food reads as a food log. Documented below; the premise here uses a
    // phrasing the classifier genuinely routes to nutrition.
    const prev = 'сколько белка в твороге?';
    expect(classifyIntent(prev)).toBe('nutrition_query'); // guard: the premise holds
    const r = classifyIntentWithContext('а вчера?', prev);
    expect(r).toEqual({ intent: 'nutrition_query', inherited: true });
  });

  test('KNOWN MISROUTE, documented: a question containing "съел" reads as logging', () => {
    // Not fixed here — reordering INTENT_PATTERNS would ripple through a
    // hundred pinned classifications. Recorded so the next person knows this
    // is a known limitation, not an accident.
    expect(classifyIntent('сколько калорий я съел сегодня?')).toBe('data_logging');
  });

  test('"а почему?" after a technique question stays technique', () => {
    const r = classifyIntentWithContext('а почему?', 'как правильно делать становую тягу?');
    expect(r.intent).toBe('technique_question');
    expect(r.inherited).toBe(true);
  });

  test('"и сколько?" after an analytics question stays analytics', () => {
    const prev = classifyIntent('покажи мой прогресс за месяц');
    expect(prev).toBe('analytics_query'); // guard: the premise holds
    const r = classifyIntentWithContext('и сколько?', 'покажи мой прогресс за месяц');
    expect(r).toEqual({ intent: 'analytics_query', inherited: true });
  });
});

describe('when inheriting would be wrong, it does not happen', () => {
  test('a message with its own topic keeps it, whatever came before', () => {
    const r = classifyIntentWithContext('вчера пробежал 5 км, запиши', 'сколько белка в твороге?');
    expect(r.inherited).toBe(false);
    expect(r.intent).not.toBe('nutrition_query');
  });

  test('a long message is not a follow-up even if it starts like one', () => {
    const r = classifyIntentWithContext(
      'а вообще расскажи мне что-нибудь интересное про историю олимпийских игр',
      'сколько калорий я съел?',
    );
    expect(r).toEqual({ intent: 'general', inherited: false });
  });

  test('write-intents are never inherited', () => {
    // "запиши мне 100 кг" was data_logging; "а вчера?" after it must NOT
    // become data_logging — there is nothing in it to log.
    const prev = classifyIntent('запиши вес 100 кг');
    expect(prev).toBe('data_logging'); // guard: the premise holds
    const r = classifyIntentWithContext('а вчера?', 'запиши вес 100 кг');
    expect(r.inherited).toBe(false);
  });

  test('greeting before a follow-up gives nothing to inherit', () => {
    const r = classifyIntentWithContext('а почему?', 'привет');
    expect(r).toEqual({ intent: 'general', inherited: false });
  });

  test('no previous message, no inheritance', () => {
    expect(classifyIntentWithContext('а вчера?', null)).toEqual({ intent: 'general', inherited: false });
    expect(classifyIntentWithContext('а вчера?', undefined)).toEqual({ intent: 'general', inherited: false });
  });
});

describe('isShortFollowUp', () => {
  test.each([
    'а вчера?', 'и сколько?', 'почему?', 'а раньше', 'ещё', 'когда лучше?', 'точно?',
  ])('recognises %p', (m) => {
    expect(isShortFollowUp(m)).toBe(true);
  });

  test.each([
    'составь мне программу тренировок на неделю',
    'а вообще расскажи про историю олимпийских игр подробно',
    '',
  ])('rejects %p', (m) => {
    expect(isShortFollowUp(m)).toBe(false);
  });
});

describe('freshness window', () => {
  const NOW = new Date('2026-08-08T12:00:00Z');
  const prev = 'сколько белка в твороге?';

  test('a follow-up five minutes later continues the topic', () => {
    const r = classifyIntentWithContext('а вчера?', prev, new Date('2026-08-08T11:55:00Z'), NOW);
    expect(r.inherited).toBe(true);
  });

  test('the same words three days later are a fresh opener', () => {
    // "а вчера?" as the first message after days is not a continuation of
    // anything — inheriting a stale topic would answer a question that was
    // never asked.
    const r = classifyIntentWithContext('а вчера?', prev, new Date('2026-08-05T11:00:00Z'), NOW);
    expect(r).toEqual({ intent: 'general', inherited: false });
  });

  test('exactly at the boundary still counts as the same conversation', () => {
    const r = classifyIntentWithContext('а вчера?', prev, new Date('2026-08-08T11:30:00Z'), NOW);
    expect(r.inherited).toBe(true);
  });

  test('no timestamp available — behave as before, inherit', () => {
    // Older rows or a degraded fetch: absence of evidence about staleness
    // must not disable the feature.
    const r = classifyIntentWithContext('а вчера?', prev, null, NOW);
    expect(r.inherited).toBe(true);
  });
});
