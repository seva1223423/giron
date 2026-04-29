/**
 * Unit tests for validateAIResponse (round 173).
 *
 * Different from validateResponse (deepseekAI.ts) — this is the
 * post-Mistral cleanup that strips emoji excess, English blocks,
 * length-trims by intent, and dedupes repeated sentences.
 *
 * Untested until now.
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

import { validateAIResponse } from '../routes/ai';

describe('validateAIResponse — happy path', () => {
  test('normal response returns no warnings', () => {
    const result = validateAIResponse(
      'Делай 4 подхода по 8 повторений с весом 80% от максимума.',
      'workout_modify',
    );
    expect(result.warnings).toEqual([]);
    expect(result.cleaned).toBeTruthy();
  });
});

describe('validateAIResponse — emoji excess', () => {
  test('flags > 8 emojis and trims to first 5', () => {
    const result = validateAIResponse(
      '💪🔥💯🎯⚡🏆🚀✨🎉🏋️ Программа готова',
      'general',
    );
    expect(result.warnings).toContain('excessive_emoji');
    // After cleanup, response should have ≤ 5 emojis
    const emojiCount = (result.cleaned.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || []).length;
    expect(emojiCount).toBeLessThanOrEqual(5);
  });

  test('5 emojis is fine (under threshold)', () => {
    const result = validateAIResponse(
      '💪🔥💯🎯⚡ Программа готова',
      'general',
    );
    expect(result.warnings).not.toContain('excessive_emoji');
  });
});

describe('validateAIResponse — length per intent', () => {
  test('program_creation allows up to 8000 chars', () => {
    const long = 'А'.repeat(7000);
    const result = validateAIResponse(long, 'program_creation');
    expect(result.warnings).not.toContain('too_long');
  });

  test('program_creation flags > 8000 chars', () => {
    const veryLong = 'А'.repeat(9000);
    const result = validateAIResponse(veryLong, 'program_creation');
    expect(result.warnings).toContain('too_long');
  });

  test('greeting flags shorter than program_creation', () => {
    // 4000 chars for greeting (limit is 3000) → too_long
    const long = 'А'.repeat(4000);
    const result = validateAIResponse(long, 'greeting');
    expect(result.warnings).toContain('too_long');
  });
});

describe('validateAIResponse — short response detection', () => {
  test('< 30 chars flags too_short for non-greeting intents', () => {
    const result = validateAIResponse('Делай!', 'workout_modify');
    expect(result.warnings).toContain('too_short');
  });

  test('greeting allows short response', () => {
    const result = validateAIResponse('Привет!', 'greeting');
    expect(result.warnings).not.toContain('too_short');
  });
});

describe('validateAIResponse — English block detection', () => {
  test('English block on its own line in non-technique intent flags english_detected', () => {
    // The detector uses /^[A-Za-z\s,.!?:;'"()-]{50,}$/m — must be a
    // dedicated line of pure English 50+ chars long. Testing with a
    // dedicated line of English content.
    const result = validateAIResponse(
      'Программа:\nHere is a long English block of text that exceeds fifty chars limit.\nДелай 5 подходов.',
      'general',
    );
    expect(result.warnings).toContain('english_detected');
  });

  test('technique_question allows English (exercise names often are)', () => {
    const result = validateAIResponse(
      'Программа:\nBench press is a compound exercise that targets the chest.',
      'technique_question',
    );
    // English allowed for technique_question
    expect(result.warnings).not.toContain('english_detected');
  });
});

describe('validateAIResponse — repeated sentences', () => {
  test('dedupe identical sentences (no markdown context)', () => {
    const repeated = 'Делай 5 подходов. Делай 5 подходов. Делай 5 подходов.';
    const result = validateAIResponse(repeated, 'general');
    // Cleaned should have fewer "Делай 5 подходов" occurrences
    const matches = result.cleaned.match(/Делай 5 подходов/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(2);
  });
});
