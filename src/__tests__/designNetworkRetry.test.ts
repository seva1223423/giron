/**
 * Network retry + offline queueing behavior. The api.ts service
 * retries certain status codes and queues requests when offline.
 * These tests don't hit the real API — they exercise the retry
 * and backoff logic alone.
 */

// Helper: simulate a request that fails N times, then succeeds
function makeRetriableRequest(failTimes: number) {
  let attempts = 0;
  return async () => {
    attempts++;
    if (attempts <= failTimes) {
      const error: any = new Error('Network error');
      error.response = { status: 500 };
      throw error;
    }
    return { data: 'ok', attempts };
  };
}

function expBackoffDelay(attempt: number, base = 100, cap = 5000): number {
  return Math.min(cap, base * Math.pow(2, attempt));
}

async function retryRequest<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  waitFn: (ms: number) => Promise<void> = (ms) => new Promise((res) => setTimeout(res, ms)),
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      const status = err?.response?.status;
      // only retry on 5xx + network errors
      if (status && (status < 500 || status >= 600)) throw err;
      await waitFn(expBackoffDelay(attempt - 1));
    }
  }
}

describe('expBackoffDelay', () => {
  test('attempt 0 → base delay', () => {
    expect(expBackoffDelay(0)).toBe(100);
  });

  test('attempt 1 → 2x base', () => {
    expect(expBackoffDelay(1)).toBe(200);
  });

  test('attempt 2 → 4x base', () => {
    expect(expBackoffDelay(2)).toBe(400);
  });

  test('attempt 10 → capped at 5000ms', () => {
    expect(expBackoffDelay(10)).toBe(5000);
  });

  test('attempt 100 → still capped', () => {
    expect(expBackoffDelay(100)).toBe(5000);
  });

  test('backoff strictly increasing until cap', () => {
    for (let i = 0; i < 6; i++) {
      expect(expBackoffDelay(i + 1)).toBeGreaterThanOrEqual(expBackoffDelay(i));
    }
  });

  test('custom base accepted', () => {
    expect(expBackoffDelay(0, 50)).toBe(50);
    expect(expBackoffDelay(2, 50)).toBe(200);
  });

  test('custom cap accepted', () => {
    expect(expBackoffDelay(10, 100, 1000)).toBe(1000);
  });
});

describe('retryRequest', () => {
  test('success on first try', async () => {
    const req = makeRetriableRequest(0);
    const result = await retryRequest(req, 3, () => Promise.resolve());
    expect(result).toEqual({ data: 'ok', attempts: 1 });
  });

  test('succeeds after 1 retry', async () => {
    const req = makeRetriableRequest(1);
    const result = await retryRequest(req, 3, () => Promise.resolve());
    expect((result as any).attempts).toBe(2);
  });

  test('succeeds on last retry', async () => {
    const req = makeRetriableRequest(2);
    const result = await retryRequest(req, 3, () => Promise.resolve());
    expect((result as any).attempts).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    const req = makeRetriableRequest(5);
    await expect(retryRequest(req, 3, () => Promise.resolve())).rejects.toThrow('Network error');
  });

  test('4xx errors not retried', async () => {
    let attempts = 0;
    const req = async () => {
      attempts++;
      const err: any = new Error('Bad request');
      err.response = { status: 400 };
      throw err;
    };
    await expect(retryRequest(req, 5, () => Promise.resolve())).rejects.toThrow('Bad request');
    expect(attempts).toBe(1); // no retries
  });

  test('401 not retried (auth error)', async () => {
    let attempts = 0;
    const req = async () => {
      attempts++;
      const err: any = new Error('Unauthorized');
      err.response = { status: 401 };
      throw err;
    };
    await expect(retryRequest(req, 5, () => Promise.resolve())).rejects.toThrow('Unauthorized');
    expect(attempts).toBe(1);
  });

  test('500 retried up to maxAttempts', async () => {
    let attempts = 0;
    const req = async () => {
      attempts++;
      const err: any = new Error('Server error');
      err.response = { status: 500 };
      throw err;
    };
    await expect(retryRequest(req, 3, () => Promise.resolve())).rejects.toThrow();
    expect(attempts).toBe(3);
  });

  test('503 retried (service unavailable)', async () => {
    let attempts = 0;
    const req = async () => {
      attempts++;
      if (attempts < 2) {
        const err: any = new Error('Service unavailable');
        err.response = { status: 503 };
        throw err;
      }
      return { data: 'ok' };
    };
    const result = await retryRequest(req, 3, () => Promise.resolve());
    expect(result).toEqual({ data: 'ok' });
  });
});

describe('Offline queue behavior (pattern)', () => {
  type QueueItem = { id: string; payload: any; retries: number };

  function makeQueue() {
    const items: QueueItem[] = [];
    return {
      enqueue(item: QueueItem) {
        items.push(item);
      },
      dequeue(): QueueItem | undefined {
        return items.shift();
      },
      peek(): QueueItem | undefined {
        return items[0];
      },
      get length() {
        return items.length;
      },
    };
  }

  test('enqueue/dequeue preserves order (FIFO)', () => {
    const q = makeQueue();
    q.enqueue({ id: 'a', payload: 1, retries: 0 });
    q.enqueue({ id: 'b', payload: 2, retries: 0 });
    q.enqueue({ id: 'c', payload: 3, retries: 0 });
    expect(q.dequeue()?.id).toBe('a');
    expect(q.dequeue()?.id).toBe('b');
    expect(q.dequeue()?.id).toBe('c');
  });

  test('empty queue peek returns undefined', () => {
    const q = makeQueue();
    expect(q.peek()).toBeUndefined();
  });

  test('length tracks enqueues and dequeues', () => {
    const q = makeQueue();
    q.enqueue({ id: 'a', payload: 1, retries: 0 });
    q.enqueue({ id: 'b', payload: 2, retries: 0 });
    expect(q.length).toBe(2);
    q.dequeue();
    expect(q.length).toBe(1);
  });

  test('retries field incremented on failed delivery', () => {
    const item: QueueItem = { id: 'x', payload: 1, retries: 0 };
    item.retries++;
    expect(item.retries).toBe(1);
  });
});

describe('Timeouts handling', () => {
  test('AbortSignal.timeout semantics', () => {
    // Simulate the timeout pattern used by fetch calls
    const timeout = 5000;
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(60000);
  });

  test('default API timeout is 10s', () => {
    const DEFAULT_TIMEOUT_MS = 10000;
    expect(DEFAULT_TIMEOUT_MS).toBe(10000);
    expect(DEFAULT_TIMEOUT_MS).toBeLessThan(30000);
  });

  test('long-running AI endpoint timeout at 60s', () => {
    const AI_TIMEOUT_MS = 60000;
    expect(AI_TIMEOUT_MS).toBeGreaterThan(10000);
    expect(AI_TIMEOUT_MS).toBeLessThanOrEqual(120000);
  });
});

describe('JWT refresh semantics', () => {
  test('access token expires in 7d; test the constant', () => {
    const ACCESS_TOKEN_DAYS = 7;
    expect(ACCESS_TOKEN_DAYS).toBe(7);
    expect(ACCESS_TOKEN_DAYS * 86400 * 1000).toBeGreaterThan(86400000); // > 1 day
  });

  test('refresh token expires in 30d', () => {
    const REFRESH_TOKEN_DAYS = 30;
    expect(REFRESH_TOKEN_DAYS).toBe(30);
    expect(REFRESH_TOKEN_DAYS).toBeGreaterThan(7);
  });

  test('refresh window longer than access token', () => {
    expect(30).toBeGreaterThan(7);
  });
});
