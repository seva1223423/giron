/**
 * Unit tests for detectMood (round 107).
 *
 * Mood detection feeds the moodDirective injected into the system prompt
 * — wrong mood = wrong tone for the response. The 'fatigued' mood added
 * in round 106 deserves coverage to prevent regression: a user saying
 * "выгораю" must NOT be tagged as 'frustrated' (anger directive) or
 * 'sad' (depression directive) — that misses the recovery signal.
 *
 * Pattern: same isolation strategy as classifyIntent.test.ts.
 */

jest.mock('express-rate-limit', () => {
  const passthrough = () => (_req: any, _res: any, next: any) => next();
  passthrough.ipKeyGenerator = (ip: string) => ip;
  return passthrough;
});

jest.mock('../db', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    aIMemory: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { detectMood } from '../routes/ai';

describe('detectMood — frustrated', () => {
  test.each([
    'заебал этот тренажёр',
    'бесит, ничего не получается',
    'надоело, я устал',
    'какого хрена опять не получилось',
  ])('classifies "%s" as frustrated', (msg) => {
    expect(detectMood(msg).mood).toBe('frustrated');
  });
});

describe('detectMood — excited', () => {
  test.each([
    'УРА, побил рекорд!',
    'наконец-то поднял 100кг',
    'новый рекорд 🔥',
    'я смог!',
  ])('classifies "%s" as excited', (msg) => {
    expect(detectMood(msg).mood).toBe('excited');
  });
});

describe('detectMood — anxious', () => {
  test.each([
    'боюсь сорвать спину',
    'не опасно ли это для коленей',
    'переживаю что не справлюсь',
    'а вдруг сломаю',
  ])('classifies "%s" as anxious', (msg) => {
    expect(detectMood(msg).mood).toBe('anxious');
  });
});

describe('detectMood — sad', () => {
  test.each([
    'грустно, ничего не выходит',
    'я неудачник',
    'все сильнее меня',
  ])('classifies "%s" as sad', (msg) => {
    expect(detectMood(msg).mood).toBe('sad');
  });
});

// ─── Round 106 'fatigued' regression coverage ────────────────────────────

describe('detectMood — fatigued (round 106)', () => {
  test.each([
    'выгораю на работе и в зале',
    'перетренировался',
    'нет сил даже на разминку',
    'я обессилел',
    'устал как собака',
    'выжат как лимон',
    'ноги ватные после вчерашнего',
    'разбит, не могу собраться',
    'туман в голове третий день',
    'нагрузка слишком большая',
    'нагрузка очень большая',
    'устал от тренировок',
  ])('classifies "%s" as fatigued', (msg) => {
    expect(detectMood(msg).mood).toBe('fatigued');
  });

  test('fatigued directive mentions recovery topics (sleep, deload, ACWR)', () => {
    const { directive } = detectMood('я обессилел, нет сил');
    expect(directive).toMatch(/восстановл|deload|сон|ACWR/i);
    expect(directive.length).toBeGreaterThan(50);
  });
});

describe('detectMood — curious', () => {
  test.each([
    'а почему так',
    'интересно, как работает',
    'объясни',
    'расскажи подробнее',
  ])('classifies "%s" as curious', (msg) => {
    expect(detectMood(msg).mood).toBe('curious');
  });
});

describe('detectMood — neutral fallback', () => {
  test('plain question with no mood markers → neutral', () => {
    expect(detectMood('сколько подходов делать').mood).toBe('neutral');
  });

  test('empty message → neutral', () => {
    expect(detectMood('').mood).toBe('neutral');
  });
});

describe('detectMood — boundary properties', () => {
  test('first matching mood wins (priority order in MOOD_PATTERNS)', () => {
    // "заебал, выгораю" — frustrated FIRST, fatigued SECOND in array.
    // Frustrated wins.
    expect(detectMood('заебал, выгораю').mood).toBe('frustrated');
  });

  test('returns directive non-empty for non-neutral moods', () => {
    expect(detectMood('я обессилел').directive.length).toBeGreaterThan(20);
    expect(detectMood('УРА').directive.length).toBeGreaterThan(20);
  });

  test('neutral returns empty directive (gets dropped from system prompt)', () => {
    expect(detectMood('сколько калорий в гречке').directive).toBe('');
  });
});
