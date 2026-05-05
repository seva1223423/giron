/**
 * Unit tests for src/services/api.ts.
 *
 * The api module sets up the central axios client every screen uses.
 * Bugs here ripple to every API call. Highest-stakes branches:
 *
 *   1. JWT auto-refresh on 401:
 *      - Single 401 → /auth/refresh → retry original with new token
 *      - Refresh fails → tokens cleared + logout fires + "Сессия истекла" alert
 *      - Already-retried request (_retry=true) → does NOT loop into refresh again
 *   2. 426 CLIENT_TOO_OLD → emit onClientTooOld(payload), still reject
 *   3. 403 BANNED → force logout (no refresh attempt)
 *   4. Transient retry on 502/503/504 GET only (POST is NOT retried — write
 *      idempotency isn't guaranteed)
 *   5. setOnlineStatus toggles based on network/timeout vs HTTP errors
 *   6. getApiError mapping: server message > status fallback > generic
 *
 * Strategy: mock `axios.create` to capture the interceptor handlers. Because
 * Jest hoists `jest.mock()` factories above all `const` declarations, the
 * factory creates its own state internally and stashes references on
 * `globalThis.__apiMockState` for the test to read.
 */

jest.mock('axios', () => {
  const apiInstance: any = jest.fn();
  const handlers: any = {
    request: null,
    responseSuccess: null,
    responseError: null,
  };
  apiInstance.interceptors = {
    request: { use: jest.fn((onFulfilled: any) => { handlers.request = onFulfilled; }) },
    response: {
      use: jest.fn((onFulfilled: any, onRejected: any) => {
        handlers.responseSuccess = onFulfilled;
        handlers.responseError = onRejected;
      }),
    },
  };
  const post = jest.fn();
  const create = jest.fn(() => apiInstance);
  const isAxiosError = (e: unknown): boolean =>
    !!(e && typeof e === 'object' && 'isAxiosError' in (e as Record<string, unknown>));

  // Stash refs so the test can read them after import resolves.
  (globalThis as any).__apiMockState = { apiInstance, post, handlers };

  const mod: any = { create, post, isAxiosError };
  return { __esModule: true, default: mod, ...mod };
});

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Alert: { alert: jest.fn() },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3' } },
}));

jest.mock('../utils/secureStorage', () => {
  const tokenStorage = {
    getAccessToken: jest.fn(),
    getRefreshToken: jest.fn(),
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  };
  (globalThis as any).__tokenStorageMock = tokenStorage;
  return { tokenStorage };
});

jest.mock('../store/useConnectionStore', () => {
  const setOnlineStatus = jest.fn();
  (globalThis as any).__setOnlineStatusMock = setOnlineStatus;
  return { setOnlineStatus };
});

jest.mock('../store', () => {
  const state = { logout: jest.fn(), updateTokens: jest.fn() };
  (globalThis as any).__authStoreMock = state;
  return {
    useAuthStore: { getState: () => state },
  };
});

import { onClientTooOld, getApiError } from '../services/api';

// api.ts uses lazy require('../store') inside the interceptor; force the
// factory to run NOW so __authStoreMock is populated before tests read it.
require('../store');

// ── Pull mock state from globalThis (populated when api.ts loaded) ──────────

interface Handlers {
  request: ((c: any) => any) | null;
  responseSuccess: ((r: any) => any) | null;
  responseError: ((e: any) => any) | null;
}

const apiMock = (globalThis as any).__apiMockState as {
  apiInstance: jest.Mock;
  post: jest.Mock;
  handlers: Handlers;
};

const tokenStorageMock = (globalThis as any).__tokenStorageMock as {
  getAccessToken: jest.Mock; getRefreshToken: jest.Mock;
  setTokens: jest.Mock; clearTokens: jest.Mock;
};

const setOnlineStatusMock = (globalThis as any).__setOnlineStatusMock as jest.Mock;
const authStoreMock = (globalThis as any).__authStoreMock as {
  logout: jest.Mock; updateTokens: jest.Mock;
};

beforeEach(() => {
  apiMock.apiInstance.mockReset();
  apiMock.post.mockReset();
  tokenStorageMock.getAccessToken.mockReset();
  tokenStorageMock.getRefreshToken.mockReset();
  tokenStorageMock.setTokens.mockReset();
  tokenStorageMock.clearTokens.mockReset();
  setOnlineStatusMock.mockReset();
  authStoreMock.logout.mockReset();
  authStoreMock.updateTokens.mockReset();
  apiMock.apiInstance.mockResolvedValue({ data: 'replayed' });
});

afterEach(() => {
  // The "Сессия истекла" alert sets a module-level flag
  // (sessionExpiredAlertShown) on first fire, intentionally suppressing
  // subsequent ones in the same session. The flag only resets when the
  // user taps OK. In tests Alert is mocked so onPress is never called —
  // simulate it here so each test starts from the unfired state.
  const { Alert } = require('react-native');
  const calls = (Alert.alert as jest.Mock).mock.calls;
  for (const call of calls) {
    const buttons = call[2];
    if (Array.isArray(buttons) && typeof buttons[0]?.onPress === 'function') {
      buttons[0].onPress();
    }
    const opts = call[3];
    if (opts && typeof opts.onDismiss === 'function') {
      opts.onDismiss();
    }
  }
  (Alert.alert as jest.Mock).mockClear();
});

function makeAxiosError(status: number, data?: any, config?: any) {
  return {
    isAxiosError: true,
    response: { status, data },
    config: config ?? { method: 'get', headers: {} },
  };
}

// ── Request interceptor: attach JWT ────────────────────────────────────────

describe('request interceptor', () => {
  test('attaches Bearer header when token exists', async () => {
    tokenStorageMock.getAccessToken.mockResolvedValueOnce('jwt-abc');
    const config: any = { headers: {} };
    const out = await apiMock.handlers.request!(config);
    expect(out.headers.Authorization).toBe('Bearer jwt-abc');
  });

  test('leaves headers untouched when no token (anonymous calls)', async () => {
    tokenStorageMock.getAccessToken.mockResolvedValueOnce(null);
    const config: any = { headers: {} };
    const out = await apiMock.handlers.request!(config);
    expect(out.headers.Authorization).toBeUndefined();
  });
});

// ── Response success: marks online ─────────────────────────────────────────

describe('response success interceptor', () => {
  test('successful response sets online=true and passes through', () => {
    const resp = { data: { ok: true } };
    const out = apiMock.handlers.responseSuccess!(resp);
    expect(setOnlineStatusMock).toHaveBeenCalledWith(true);
    expect(out).toBe(resp);
  });
});

// ── setOnlineStatus toggling ───────────────────────────────────────────────

describe('response error: setOnlineStatus toggling', () => {
  test('ECONNABORTED (timeout) → offline', async () => {
    const err = { isAxiosError: true, code: 'ECONNABORTED', config: { method: 'get', headers: {} } };
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(setOnlineStatusMock).toHaveBeenCalledWith(false);
  });

  test('ERR_NETWORK → offline', async () => {
    const err = { isAxiosError: true, code: 'ERR_NETWORK', config: { method: 'get', headers: {} } };
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(setOnlineStatusMock).toHaveBeenCalledWith(false);
  });

  test('no `response` (network failure) → offline', async () => {
    const err = { isAxiosError: true, config: { method: 'get', headers: {} } };
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(setOnlineStatusMock).toHaveBeenCalledWith(false);
  });

  test('HTTP error (404) → online stays true', async () => {
    const err = makeAxiosError(404);
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(setOnlineStatusMock).toHaveBeenCalledWith(true);
  });
});

// ── 502/503/504 transient retry ────────────────────────────────────────────

describe('response error: 502/503/504 transient retry on GET', () => {
  test('503 GET → retried (1st attempt) with backoff', async () => {
    jest.useFakeTimers();
    const err = makeAxiosError(503, {}, { method: 'get', headers: {}, _retryCount: 0 });
    const promise = apiMock.handlers.responseError!(err);
    await jest.runAllTimersAsync();
    const result = await promise;
    jest.useRealTimers();

    expect(result).toEqual({ data: 'replayed' });
    expect(apiMock.apiInstance).toHaveBeenCalledTimes(1);
    expect(err.config._retryCount).toBe(1);
  });

  test('503 POST → NOT retried (write idempotency unsafe)', async () => {
    const err = makeAxiosError(503, {}, { method: 'post', headers: {} });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(apiMock.apiInstance).not.toHaveBeenCalled();
  });

  test('after 2 retries (3 attempts total) → reject', async () => {
    const err = makeAxiosError(503, {}, { method: 'get', headers: {}, _retryCount: 2 });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(apiMock.apiInstance).not.toHaveBeenCalled();
  });

  test('500 (non-transient) GET → NOT retried', async () => {
    const err = makeAxiosError(500, {}, { method: 'get', headers: {} });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(apiMock.apiInstance).not.toHaveBeenCalled();
  });
});

// ── 403 BANNED → force logout ──────────────────────────────────────────────

describe('response error: 403 BANNED', () => {
  test('403 with code:BANNED → logout fires + reject (no refresh attempt)', async () => {
    const err = makeAxiosError(403, { code: 'BANNED', error: 'banned' });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(authStoreMock.logout).toHaveBeenCalledTimes(1);
    expect(apiMock.post).not.toHaveBeenCalled(); // refresh NOT attempted
  });

  test('403 without code:BANNED → no logout (just reject)', async () => {
    const err = makeAxiosError(403, { error: 'no access' });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(authStoreMock.logout).not.toHaveBeenCalled();
  });
});

// ── 426 CLIENT_TOO_OLD → emit ForceUpdate event ────────────────────────────

describe('response error: 426 CLIENT_TOO_OLD', () => {
  test('426 with code:CLIENT_TOO_OLD → emits payload to subscribers', async () => {
    const handler = jest.fn();
    const unsubscribe = onClientTooOld(handler);

    const err = makeAxiosError(426, {
      code: 'CLIENT_TOO_OLD',
      clientVersion: '1.0.0',
      minVersion: '1.5.0',
      updateUrl: 'https://store.example.com/app',
      error: 'Версия устарела',
    });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      clientVersion: '1.0.0',
      minVersion: '1.5.0',
      updateUrl: 'https://store.example.com/app',
      message: 'Версия устарела',
    });
    unsubscribe();
  });

  test('426 with missing fields uses safe defaults (still emits)', async () => {
    const handler = jest.fn();
    const unsubscribe = onClientTooOld(handler);

    const err = makeAxiosError(426, { code: 'CLIENT_TOO_OLD' });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);

    expect(handler).toHaveBeenCalledWith({
      clientVersion: '1.2.3', // expoConfig.version fallback
      minVersion: '?',
      updateUrl: null,
      message: 'Версия приложения устарела',
    });
    unsubscribe();
  });

  test('426 without code:CLIENT_TOO_OLD → does NOT emit', async () => {
    const handler = jest.fn();
    const unsubscribe = onClientTooOld(handler);

    const err = makeAxiosError(426, { error: 'something else' });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('one bad subscriber does not break the others', async () => {
    const goodHandler = jest.fn();
    const badHandler = jest.fn(() => { throw new Error('subscriber boom'); });
    const unsubGood = onClientTooOld(goodHandler);
    const unsubBad = onClientTooOld(badHandler);

    const err = makeAxiosError(426, { code: 'CLIENT_TOO_OLD' });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);

    expect(goodHandler).toHaveBeenCalledTimes(1);
    expect(badHandler).toHaveBeenCalledTimes(1);
    unsubGood(); unsubBad();
  });
});

// ── 401 → refresh → retry ──────────────────────────────────────────────────

describe('response error: 401 + JWT auto-refresh', () => {
  test('401 with refresh token → POST /auth/refresh, retry with new token', async () => {
    tokenStorageMock.getRefreshToken.mockResolvedValueOnce('refresh-old');
    apiMock.post.mockResolvedValueOnce({ data: { token: 'new-jwt', refreshToken: 'new-refresh' } });

    const err = makeAxiosError(401, {}, { method: 'get', headers: {} });
    const result = await apiMock.handlers.responseError!(err);

    expect(apiMock.post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      { refreshToken: 'refresh-old' },
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Client-Version': '1.2.3',
          'X-Client-Platform': 'android',
        }),
      }),
    );
    expect(tokenStorageMock.setTokens).toHaveBeenCalledWith('new-jwt', 'new-refresh');
    expect(authStoreMock.updateTokens).toHaveBeenCalledWith('new-jwt', 'new-refresh');
    expect(apiMock.apiInstance).toHaveBeenCalledTimes(1);
    const retriedConfig = apiMock.apiInstance.mock.calls[0][0];
    expect(retriedConfig.headers.Authorization).toBe('Bearer new-jwt');
    expect(retriedConfig._retry).toBe(true);
    expect(result).toEqual({ data: 'replayed' });
  });

  test('401 with NO refresh token → clear + logout + reject', async () => {
    tokenStorageMock.getRefreshToken.mockResolvedValueOnce(null);

    const err = makeAxiosError(401, {}, { method: 'get', headers: {} });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBeDefined();

    expect(apiMock.post).not.toHaveBeenCalled();
    expect(tokenStorageMock.clearTokens).toHaveBeenCalledTimes(1);
    expect(authStoreMock.logout).toHaveBeenCalledTimes(1);
  });

  test('refresh request fails → clear + logout + show "Сессия истекла" alert', async () => {
    tokenStorageMock.getRefreshToken.mockResolvedValueOnce('refresh-old');
    apiMock.post.mockRejectedValueOnce(new Error('refresh denied'));

    const { Alert } = require('react-native');
    (Alert.alert as jest.Mock).mockClear();

    const err = makeAxiosError(401, {}, { method: 'get', headers: {} });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBeDefined();

    expect(tokenStorageMock.clearTokens).toHaveBeenCalledTimes(1);
    expect(authStoreMock.logout).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Сессия истекла',
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
  });

  test('already-retried request (_retry=true) does NOT loop into refresh', async () => {
    const err = makeAxiosError(401, {}, { method: 'get', headers: {}, _retry: true });
    await expect(apiMock.handlers.responseError!(err)).rejects.toBe(err);
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(tokenStorageMock.getRefreshToken).not.toHaveBeenCalled();
  });
});

// ── getApiError mapping ────────────────────────────────────────────────────

describe('getApiError', () => {
  test('uses server-side error message verbatim when present', () => {
    const e = makeAxiosError(409, { error: 'Уже существует', code: 'DUPLICATE' });
    expect(getApiError(e)).toEqual({
      message: 'Уже существует',
      status: 409,
      code: 'DUPLICATE',
    });
  });

  test('falls back to STATUS_MESSAGES[401] when no server message', () => {
    const e = makeAxiosError(401, {});
    expect(getApiError(e).message).toMatch(/Сессия истекла/);
    expect(getApiError(e).status).toBe(401);
  });

  test('STATUS_MESSAGES[402] = subscription paywall message', () => {
    const e = makeAxiosError(402, {});
    expect(getApiError(e).message).toMatch(/платных подписчиков/);
  });

  test('unknown status (e.g. 599) → "Ошибка <code>" generic', () => {
    const e = makeAxiosError(599, {});
    expect(getApiError(e).message).toBe('Ошибка 599');
  });

  test('network error (no response) → status:0, "Нет подключения"', () => {
    const e = { isAxiosError: true, response: undefined };
    const result = getApiError(e);
    expect(result.status).toBe(0);
    expect(result.message).toMatch(/Нет подключения|Ошибка/);
  });

  test('non-axios Error → "Неизвестная ошибка"', () => {
    expect(getApiError(new Error('plain js error'))).toEqual({
      message: 'Неизвестная ошибка',
      status: 0,
    });
  });

  test('null/undefined input → "Неизвестная ошибка"', () => {
    expect(getApiError(null).message).toBe('Неизвестная ошибка');
    expect(getApiError(undefined).message).toBe('Неизвестная ошибка');
  });

  test('STATUS_MESSAGES covers 400/408/410/413/415/423/451 (Round 233 backfill)', () => {
    const codes = [400, 408, 410, 413, 415, 423, 451];
    for (const code of codes) {
      const e = makeAxiosError(code, {});
      const msg = getApiError(e).message;
      expect(msg).not.toMatch(/^Ошибка/);
      expect(msg.length).toBeGreaterThan(10);
    }
  });
});
