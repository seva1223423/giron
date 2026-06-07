/**
 * Tests for utils/throttledStorage — the wrapper that coalesces rapid
 * setItem calls into one write per N ms.
 *
 * Why this matters: workoutStore was running encrypt + AsyncStorage on
 * every ✓ during an active workout. The throttle drops that to ~1
 * write per 2s. Tests pin: (1) burst coalescing, (2) last-write-wins,
 * (3) read-your-writes (getItem sees pending value), (4) removeItem
 * cancels pending, (5) flushPending forces immediate write.
 */

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(),
  },
}));

import {
  createThrottledStorage,
  _resetForTest,
} from '../utils/throttledStorage';

interface MockStorage {
  data: Map<string, string>;
  getItem: jest.Mock<Promise<string | null>, [string]>;
  setItem: jest.Mock<Promise<void>, [string, string]>;
  removeItem: jest.Mock<Promise<void>, [string]>;
}

function makeMockStorage(): MockStorage {
  const data = new Map<string, string>();
  return {
    data,
    getItem: jest.fn(async (k: string) => data.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      data.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      data.delete(k);
    }),
  };
}

beforeEach(() => {
  _resetForTest();
});

describe('throttledStorage — basic pass-through', () => {
  test('getItem returns null for missing key', async () => {
    const inner = makeMockStorage();
    const throttled = createThrottledStorage(inner, 100);
    expect(await throttled.getItem('missing')).toBeNull();
  });

  test('getItem returns the value the inner storage has', async () => {
    const inner = makeMockStorage();
    inner.data.set('k', 'v');
    const throttled = createThrottledStorage(inner, 100);
    expect(await throttled.getItem('k')).toBe('v');
  });

  test('removeItem propagates immediately (no throttle for deletes)', async () => {
    const inner = makeMockStorage();
    inner.data.set('k', 'v');
    const throttled = createThrottledStorage(inner, 100);
    await throttled.removeItem('k');
    expect(inner.removeItem).toHaveBeenCalledWith('k');
    expect(inner.data.has('k')).toBe(false);
  });
});

describe('throttledStorage — write coalescing', () => {
  test('one setItem within the throttle window does NOT touch inner until flush time', async () => {
    jest.useFakeTimers();
    try {
      const inner = makeMockStorage();
      const throttled = createThrottledStorage(inner, 100);
      await throttled.setItem('k', 'v1');
      expect(inner.setItem).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      // setTimeout callback runs synchronously after advance; await one
      // microtask so the awaited inner.setItem promise resolves.
      await Promise.resolve();
      expect(inner.setItem).toHaveBeenCalledWith('k', 'v1');
    } finally {
      jest.useRealTimers();
    }
  });

  test('burst of setItem calls collapses to ONE write of the LAST value', async () => {
    jest.useFakeTimers();
    try {
      const inner = makeMockStorage();
      const throttled = createThrottledStorage(inner, 100);
      // 5 rapid writes within window
      await throttled.setItem('k', 'v1');
      await throttled.setItem('k', 'v2');
      await throttled.setItem('k', 'v3');
      await throttled.setItem('k', 'v4');
      await throttled.setItem('k', 'v5');
      expect(inner.setItem).not.toHaveBeenCalled();
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(inner.setItem).toHaveBeenCalledTimes(1);
      expect(inner.setItem).toHaveBeenCalledWith('k', 'v5');
    } finally {
      jest.useRealTimers();
    }
  });

  test('two writes in DIFFERENT windows produce two writes', async () => {
    jest.useFakeTimers();
    try {
      const inner = makeMockStorage();
      const throttled = createThrottledStorage(inner, 100);
      await throttled.setItem('k', 'first');
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await throttled.setItem('k', 'second');
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(inner.setItem).toHaveBeenCalledTimes(2);
      expect(inner.setItem).toHaveBeenNthCalledWith(1, 'k', 'first');
      expect(inner.setItem).toHaveBeenNthCalledWith(2, 'k', 'second');
    } finally {
      jest.useRealTimers();
    }
  });

  test('writes to DIFFERENT keys are independent', async () => {
    jest.useFakeTimers();
    try {
      const inner = makeMockStorage();
      const throttled = createThrottledStorage(inner, 100);
      await throttled.setItem('a', '1');
      await throttled.setItem('b', '2');
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(inner.setItem).toHaveBeenCalledTimes(2);
      expect(inner.data.get('a')).toBe('1');
      expect(inner.data.get('b')).toBe('2');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('throttledStorage — read-your-writes', () => {
  test('getItem returns the latest pending value (not the stale disk value)', async () => {
    jest.useFakeTimers();
    try {
      const inner = makeMockStorage();
      inner.data.set('k', 'old');
      const throttled = createThrottledStorage(inner, 100);
      await throttled.setItem('k', 'new');
      // Before flush, getItem should see 'new', not 'old'.
      expect(await throttled.getItem('k')).toBe('new');
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(await throttled.getItem('k')).toBe('new');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('throttledStorage — removeItem cancels pending writes', () => {
  test('removeItem on a pending key drops the write entirely', async () => {
    jest.useFakeTimers();
    try {
      const inner = makeMockStorage();
      const throttled = createThrottledStorage(inner, 100);
      await throttled.setItem('k', 'v');
      await throttled.removeItem('k');
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(inner.setItem).not.toHaveBeenCalled();
      expect(inner.removeItem).toHaveBeenCalledWith('k');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('throttledStorage — flushPending', () => {
  test('flushPending writes immediately without waiting for timer', async () => {
    const inner = makeMockStorage();
    const throttled = createThrottledStorage(inner, 100);
    await throttled.setItem('k', 'v');
    expect(inner.setItem).not.toHaveBeenCalled();
    await throttled.flushPending();
    expect(inner.setItem).toHaveBeenCalledWith('k', 'v');
  });

  test('flushPending flushes ALL pending keys in one call', async () => {
    const inner = makeMockStorage();
    const throttled = createThrottledStorage(inner, 1000);
    await throttled.setItem('a', '1');
    await throttled.setItem('b', '2');
    await throttled.setItem('c', '3');
    expect(inner.setItem).not.toHaveBeenCalled();
    await throttled.flushPending();
    expect(inner.setItem).toHaveBeenCalledTimes(3);
    expect(inner.data.get('a')).toBe('1');
    expect(inner.data.get('b')).toBe('2');
    expect(inner.data.get('c')).toBe('3');
  });
});
