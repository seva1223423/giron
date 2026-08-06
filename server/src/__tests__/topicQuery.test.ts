/**
 * Keeping a topic alive across a follow-up.
 *
 * Around 1400 knowledge blocks gate themselves on a keyword regex over the
 * user's message. Ask "стоит ли пить креатин?" and the creatine block fires.
 * Ask "а сколько грамм?" one second later and it does not — the follow-up has
 * no keyword in it, so every block switches off precisely when the person is
 * digging further into the topic they just raised.
 *
 * The rule is deliberately blunt: a message too short to stand on its own is
 * matched together with the question before it. These pin both halves of that
 * — the carrying, and the not-carrying, because a topic that never lets go is
 * its own failure.
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

import { buildTopicQuery } from '../routes/ai';

const CREATINE = 'стоит ли пить креатин?';

describe('buildTopicQuery', () => {
  test('a short follow-up keeps the question it follows', () => {
    const q = buildTopicQuery('а сколько грамм?', CREATINE);
    expect(q).toContain('креатин');
    expect(q).toContain('сколько грамм');
  });

  test('a one-word follow-up too', () => {
    expect(buildTopicQuery('почему?', CREATINE)).toContain('креатин');
  });

  test('a full question stands on its own', () => {
    // Otherwise the previous topic's block would fire alongside the new one
    // on every turn, and the prompt would accumulate topics all conversation.
    const long = 'расскажи подробно как правильно приседать со штангой на спине';
    expect(buildTopicQuery(long, CREATINE)).toBe(long);
  });

  test('the first message of a conversation has nothing to carry', () => {
    expect(buildTopicQuery('привет', '')).toBe('привет');
  });

  test('a previous message of only whitespace is not carried', () => {
    expect(buildTopicQuery('а сколько?', '   ')).toBe('а сколько?');
  });

  test('carries the keywords of a long question, not the whole essay', () => {
    const essay = 'креатин ' + 'x'.repeat(2000);
    const q = buildTopicQuery('а сколько?', essay);
    expect(q).toContain('креатин');
    expect(q.length).toBeLessThan(400);
  });

  test('the message itself is never altered, only prefixed', () => {
    const q = buildTopicQuery('а сколько грамм?', CREATINE);
    expect(q.endsWith('а сколько грамм?')).toBe(true);
  });

  test('length is judged on the trimmed message', () => {
    // A message padded with newlines by a keyboard is still a follow-up.
    const q = buildTopicQuery('   а сколько?   \n', CREATINE);
    expect(q).toContain('креатин');
  });

  test('a message exactly at the threshold still counts as a follow-up', () => {
    const fifty = 'а'.repeat(50);
    expect(buildTopicQuery(fifty, CREATINE)).toContain('креатин');
  });

  test('one character past it does not', () => {
    const fiftyOne = 'а'.repeat(51);
    expect(buildTopicQuery(fiftyOne, CREATINE)).toBe(fiftyOne);
  });
});
