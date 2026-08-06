/**
 * What the chat request actually carries.
 *
 * `activeWorkout` was a parameter of chatStream that never reached its body.
 * The screen passed the running session in, the streaming request dropped it,
 * and streaming is the path the chat uses — the fallback POST only fires when
 * streaming fails. So the coach was blind to the workout in front of the
 * person, while the code that reads it on the server looked correct.
 *
 * A missing field in an object literal is invisible to the type checker and to
 * every test that mocks the service. It has to be read off the wire.
 */

jest.mock('../services/api', () => ({
  api: { post: (...a: unknown[]) => mockPost(...a) },
  BASE_URL: 'https://example.test',
}));

jest.mock('../utils/secureStorage', () => ({
  tokenStorage: { getAccessToken: jest.fn(() => Promise.resolve('t')) },
}));

jest.mock('../utils/errorReporter', () => ({ reportError: jest.fn() }));

// Typed rest args so the mock accepts the spread in the module mock above —
// a bare jest.fn() infers a zero-arg signature and TS rejects `...a`.
const mockPost = jest.fn((..._a: unknown[]) => Promise.resolve({ data: { message: 'ok', actions: [] } }));

import { aiService } from '../services/aiService';

const ACTIVE = {
  name: 'Грудь + трицепс',
  startedAt: '2026-08-06T10:00:00.000Z',
  exercises: [
    { name: 'Жим лёжа', sets: [{ completed: true, weight: 100, reps: 8 }] },
  ],
};

/** Drain a chatStream without caring about the chunks. */
async function drain(gen: AsyncGenerator<string>) {
  // eslint-disable-next-line no-empty
  for await (const _ of gen) {}
}

const sseResponse = (body = 'data: {"type":"done","actions":[]}\n') => ({
  ok: true,
  body: null,                      // forces the text-parsing fallback branch
  text: () => Promise.resolve(body),
});

describe('chatStream request body', () => {
  let sent: any;

  beforeEach(() => {
    sent = undefined;
    (global as any).fetch = jest.fn((_url: string, init: any) => {
      sent = JSON.parse(init.body);
      return Promise.resolve(sseResponse());
    });
  });

  test('carries the running session', async () => {
    await drain(aiService.chatStream('сколько я сделал', undefined, undefined, undefined, ACTIVE as any));
    expect(sent.activeWorkout).toBeDefined();
    expect(sent.activeWorkout.name).toBe('Грудь + трицепс');
    expect(sent.activeWorkout.exercises[0].sets[0].weight).toBe(100);
  });

  test('sends nothing for it when no session is running', async () => {
    await drain(aiService.chatStream('привет', undefined, undefined, undefined, null));
    expect(sent.activeWorkout ?? null).toBeNull();
  });

  test('carries the timezone offset the daily quota resets on', async () => {
    await drain(aiService.chatStream('привет'));
    expect(typeof sent.clientTzOffsetMinutes).toBe('number');
    expect(sent.clientTzOffsetMinutes).toBe(-new Date().getTimezoneOffset());
  });

  test('still marks itself as a stream', async () => {
    await drain(aiService.chatStream('привет'));
    expect(sent.stream).toBe(true);
  });
});

describe('chat request body', () => {
  beforeEach(() => mockPost.mockClear());

  test('the non-streaming path carries the session too', async () => {
    await aiService.chat('сколько я сделал', undefined, undefined, undefined, ACTIVE as any);
    expect((mockPost.mock.calls[0] as any)[1].activeWorkout.name).toBe('Грудь + трицепс');
  });

  test('and the timezone offset', async () => {
    await aiService.chat('привет');
    expect(typeof (mockPost.mock.calls[0] as any)[1].clientTzOffsetMinutes).toBe('number');
  });
});
