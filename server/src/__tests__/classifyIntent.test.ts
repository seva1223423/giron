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
    // Round 155 additions
    'помни про мою травму колена',
    'помни что я веган',
    'не забывай про моё плечо',
    'не забывай о моих аллергиях',
  ])('classifies memory command "%s" as data_logging (round 102+155)', (msg) => {
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
    // Round 104 widened pattern: bare lift names after the verb work too.
    'убери жим',
    'замени присед',
    'убери становую',
    'поменяй тягу',
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
    // Round 104 widened pattern: noun-phrase between "техника" and lift root.
    'техника становой тяги',
    'техника румынской тяги',
    'техника подтягиваний',
  ])('classifies "%s" as technique_question', (msg) => {
    expect(classifyIntent(msg)).toBe('technique_question');
  });
});

// AI-5: backfill missing intent coverage. The original suite had only
// data_logging / program_creation / workout_modify / technique_question
// pinned. The other 5 intents (nutrition_query, analytics_query,
// greeting, complaint, motivation) had zero positive tests — a regex
// edit could silently break them. Pin the canonical phrasings.

describe('classifyIntent — nutrition_query', () => {
  test.each([
    'сколько белка мне нужно',
    'рассчитай КБЖУ',
    'что есть после тренировки',
    'дефицит калорий это что',
    'сколько калорий в банане',
    'питание до тренировки',
    'что съесть перед сном',
  ])('classifies "%s" as nutrition_query', (msg) => {
    expect(classifyIntent(msg)).toBe('nutrition_query');
  });
});

describe('classifyIntent — analytics_query', () => {
  test.each([
    'как мой прогресс',
    'покажи статистику',
    'мои рекорды',
    'сколько я жму',
    'мои силовые',
    'оцени мой прогресс',
    'динамика жима',
    'насколько я вырос за месяц',
  ])('classifies "%s" as analytics_query', (msg) => {
    expect(classifyIntent(msg)).toBe('analytics_query');
  });
});

describe('classifyIntent — greeting', () => {
  test.each([
    'привет',
    'здравствуй',
    'хай',
    'доброе утро',
    'добрый день',
    'добрый вечер',
    'как дела',
    'привет, как дела?',
  ])('classifies "%s" as greeting', (msg) => {
    expect(classifyIntent(msg)).toBe('greeting');
  });

  test('greeting only fires for short anchored greetings, not embedded ones', () => {
    // "привет" inside a longer message should NOT win against more
    // specific intents — the greeting regex is anchored ^...$.
    expect(classifyIntent('привет, составь программу')).toBe('program_creation');
  });
});

describe('classifyIntent — complaint', () => {
  test.each([
    'болит колено',
    'травма плеча',
    'дискомфорт в пояснице',
    'перетренировался',
    'хруст в плече',
    'повредил плечо',
    'защемило поясницу',
  ])('classifies "%s" as complaint', (msg) => {
    expect(classifyIntent(msg)).toBe('complaint');
  });

  // "не могу делать <упражнение>" is genuinely ambiguous (pain vs
  // tool-modification request). Existing test pins it to workout_modify
  // (line 87) — when it precedes an exercise name the user usually
  // wants the program adjusted. Documented here so a future regex
  // edit doesn't quietly flip the routing.
  test('"не могу делать <упражнение>" stays in workout_modify (intentional)', () => {
    expect(classifyIntent('не могу делать приседания')).toBe('workout_modify');
  });
});

describe('classifyIntent — motivation', () => {
  test.each([
    'нет мотивации',
    'не хочу тренироваться',
    'лень идти в зал',
    'надоело',
    'хочу бросить',
    'не вижу результатов',
    'давно не тренировался',
    'выгорание',
    'напомни мне зачем это',
  ])('classifies "%s" as motivation', (msg) => {
    expect(classifyIntent(msg)).toBe('motivation');
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

describe('questions about data are not logging', () => {
  // "съел" matched data_logging, which is checked first, so any QUESTION
  // containing it — "сколько калорий я съел сегодня?" — classified as a food
  // entry. The guard skips a logging match on question-shaped messages; the
  // loop then reaches the query intents' own patterns.

  test.each([
    ['сколько калорий я съел сегодня?', 'nutrition_query'],
    ['сколько я съел белка?', 'nutrition_query'],
    ['сколько воды я выпил сегодня?', 'nutrition_query'],
  ])('%s → %s', (msg, expected) => {
    expect(classifyIntent(msg)).toBe(expected);
  });

  test('an explicit command stays a log even with a question mark', () => {
    expect(classifyIntent('запиши: съел 200г курицы?')).toBe('data_logging');
    expect(classifyIntent('удали завтрак')).toBe('data_logging');
  });

  test('statements keep logging exactly as before', () => {
    for (const msg of ['вешу 80', 'съел 200г курицы', 'выпил стакан воды', 'спал 7 часов']) {
      expect(classifyIntent(msg)).toBe('data_logging');
    }
  });
});
