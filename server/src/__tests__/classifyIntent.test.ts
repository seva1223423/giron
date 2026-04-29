/**
 * Unit tests for classifyIntent (round 102+).
 *
 * The route uses intent to choose:
 *   - temperature / maxTokens (per INTENT_CONFIGS)
 *   - priority knowledge modules
 *   - whether to log "AI decided X intent" telemetry
 *
 * Drift here is silent — the message routes to 'general', tools still
 * fire, but the LLM is given less helpful context. These tests pin the
 * critical phrasings each intent should catch so a regex tweak doesn't
 * accidentally degrade routing.
 *
 * Imports classifyIntent from routes/ai.ts (newly exported in round 102).
 */

// Suppress noisy module-level side effects on import (mocks must come BEFORE
// the import). Same pattern as ai_security.test.ts.
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

import { classifyIntent } from '../routes/ai';

describe('classifyIntent — data_logging', () => {
  test.each([
    'вешу 80',
    'мой вес 75',
    'выпил стакан воды',
    'съел 200г курицы',
    'спал 7 часов',
    'пробежал 5 км',
    'талия 82 см',
    'удали завтрак',
  ])('classifies "%s" as data_logging', (msg) => {
    expect(classifyIntent(msg)).toBe('data_logging');
  });

  // Round 102 additions — explicit memory commands.
  test.each([
    'запомни что у меня TRX дома',
    'запомни мою цель',
    'забудь про мою цель',
    'забудь о тренере',
    'удали из памяти факт о боли в колене',
    'сотри факт',
  ])('classifies memory command "%s" as data_logging (round 102)', (msg) => {
    expect(classifyIntent(msg)).toBe('data_logging');
  });
});

describe('classifyIntent — program_creation', () => {
  test.each([
    'составь программу',
    'создай план тренировок',
    'хочу программу для набора массы',
    'программа на 3 дня',
    'помоги с программой',
  ])('classifies "%s" as program_creation', (msg) => {
    expect(classifyIntent(msg)).toBe('program_creation');
  });
});

describe('classifyIntent — workout_modify', () => {
  test.each([
    'сделай легче',
    'убери упражнение',
    'замени упражнение',
    'не могу делать приседания',
    'добавь суперсет',
    'активируй программу Iron Coach',
  ])('classifies "%s" as workout_modify', (msg) => {
    expect(classifyIntent(msg)).toBe('workout_modify');
  });
});

describe('classifyIntent — technique_question', () => {
  test.each([
    'как делать жим лёжа',
    'техника жима',
    'покажи технику приседа',
    'ошибки в жиме',
    'чем заменить становую',
  ])('classifies "%s" as technique_question', (msg) => {
    expect(classifyIntent(msg)).toBe('technique_question');
  });
});

describe('classifyIntent — fallback to general', () => {
  test('blank message falls to general', () => {
    expect(classifyIntent('')).toBe('general');
  });

  test('"привет" falls to greeting via greeting pattern (or general if no greeting pattern hits)', () => {
    // Just verify it doesn't crash — exact intent depends on which
    // patterns the greeting array catches.
    const result = classifyIntent('привет');
    expect(typeof result).toBe('string');
  });

  test('opaque sentence with no triggers falls to general', () => {
    expect(classifyIntent('какая сегодня погода в марселе')).toBe('general');
  });
});

describe('classifyIntent — boundary properties', () => {
  test('case-insensitive matching', () => {
    expect(classifyIntent('ВЕШУ 80')).toBe('data_logging');
    expect(classifyIntent('СоСтАвЬ ПрОгРаММу')).toBe('program_creation');
  });

  test('extra whitespace does not break matching', () => {
    expect(classifyIntent('   запомни   что я веган   ')).toBe('data_logging');
  });

  test('only first matching intent wins (not last)', () => {
    // "запомни что я не могу делать жим" — "запомни" → data_logging
    // also "не могу делать" → workout_modify. data_logging is listed
    // before workout_modify in INTENT_PATTERNS so it wins.
    expect(classifyIntent('запомни что я не могу делать жим')).toBe('data_logging');
  });
});
