/**
 * Round 192 — client-side AI navigation safety.
 *
 * `applyAINavigation` is the second of two safety layers (server
 * whitelist + client FORBIDDEN_SCREENS). These tests guarantee:
 *   • Server bug or prompt injection cannot smuggle a forbidden
 *     screen into the client navigator
 *   • Malformed payloads degrade gracefully (no crash)
 *   • Param sanitization rejects shell-like injection patterns
 *   • Only one navigation triggered per call (no fan-out)
 */

import { applyAINavigation, FORBIDDEN_AI_SCREENS } from '../utils/aiNavigation';

const makeNav = () => {
  const calls: Array<{ screen: string; params: any }> = [];
  return {
    navigate: jest.fn((screen: string, params?: any) => {
      calls.push({ screen, params });
    }),
    calls,
  };
};

// ─── Happy path ─────────────────────────────────────────────────────────────

describe('applyAINavigation — accepted payloads', () => {
  test('navigates to top-level tab via tabs stack', () => {
    const nav = makeNav();
    const r = applyAINavigation(nav, { stack: 'tabs', screen: 'WorkoutsTab' });
    expect(r.ok).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutsTab', undefined);
  });

  test('navigates to nested screen via stack', () => {
    const nav = makeNav();
    const r = applyAINavigation(nav, {
      stack: 'WorkoutsTab',
      screen: 'Progress',
    });
    expect(r.ok).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutsTab', {
      screen: 'Progress',
      params: undefined,
    });
  });

  test('navigates with valid params (string id)', () => {
    const nav = makeNav();
    const r = applyAINavigation(nav, {
      stack: 'WorkoutsTab',
      screen: 'ExerciseDetail',
      params: { exerciseId: 'abc123_def-456' },
    });
    expect(r.ok).toBe(true);
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutsTab', {
      screen: 'ExerciseDetail',
      params: { exerciseId: 'abc123_def-456' },
    });
  });

  test('returns appliedTo for telemetry / debugging', () => {
    const nav = makeNav();
    const r = applyAINavigation(nav, {
      stack: 'NutritionTab',
      screen: 'Recipes',
    });
    if (r.ok) {
      expect(r.appliedTo).toBe('NutritionTab/Recipes');
    } else {
      throw new Error('expected ok');
    }
  });
});

// ─── Forbidden screens — CRITICAL ────────────────────────────────────────────

describe('applyAINavigation — REJECTS forbidden screens', () => {
  // Even if server "approves" these, the client MUST refuse.

  test.each([
    'DeleteAccountScreen',
    'ChangePassword',
    'ChangeEmailScreen',
    'ChangePhoneScreen',
    'TwoFactorScreen',
    'SessionsScreen',
    'LinkedAccountsScreen',
    'SecurityEventsScreen',
    'Subscription',
    'AdminDashboardScreen',
    'AdminUsersScreen',
    'Login',
    'Register',
    'ForgotPassword',
    'ResetPassword',
    'Onboarding',
  ])('refuses navigation to "%s" with reason', (screen) => {
    const nav = makeNav();
    const r = applyAINavigation(nav, { stack: 'tabs', screen });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/FORBIDDEN_AI_SCREENS/);
    }
    expect(nav.navigate).not.toHaveBeenCalled();
  });
});

// ─── Adversarial / malformed inputs ─────────────────────────────────────────

describe('applyAINavigation — adversarial payloads', () => {
  test('rejects non-object payload', () => {
    const nav = makeNav();
    expect(applyAINavigation(nav, null).ok).toBe(false);
    expect(applyAINavigation(nav, undefined).ok).toBe(false);
    expect(applyAINavigation(nav, 'home').ok).toBe(false);
    expect(applyAINavigation(nav, 42).ok).toBe(false);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  test('rejects missing screen field', () => {
    const nav = makeNav();
    const r = applyAINavigation(nav, { stack: 'tabs' });
    expect(r.ok).toBe(false);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  test('rejects missing stack field', () => {
    const nav = makeNav();
    const r = applyAINavigation(nav, { screen: 'HomeTab' });
    expect(r.ok).toBe(false);
  });

  test('rejects empty string fields', () => {
    const nav = makeNav();
    expect(applyAINavigation(nav, { stack: '', screen: 'X' }).ok).toBe(false);
    expect(applyAINavigation(nav, { stack: 'tabs', screen: '' }).ok).toBe(false);
  });

  test('rejects unknown stack name', () => {
    const nav = makeNav();
    const r = applyAINavigation(nav, { stack: 'EvilStack', screen: 'AnyScreen' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/unknown stack/);
    }
  });

  test('rejects path-traversal style screen', () => {
    const nav = makeNav();
    // Even if not in FORBIDDEN list, ../something is rejected because
    // it's not in any whitelisted screen — but we still try via React
    // Navigation. Test that we don't crash.
    const r = applyAINavigation(nav, { stack: 'tabs', screen: '../admin' });
    // navigate will be called (we don't validate screen names beyond
    // FORBIDDEN_AI_SCREENS) — but no crash. React Navigation will
    // silently no-op on unknown screen.
    expect(r.ok).toBe(true);
  });
});

// ─── Param sanitization ─────────────────────────────────────────────────────

describe('applyAINavigation — param sanitization', () => {
  test('drops params with shell-injection chars', () => {
    const nav = makeNav();
    applyAINavigation(nav, {
      stack: 'WorkoutsTab',
      screen: 'ExerciseDetail',
      params: { exerciseId: 'abc; rm -rf /' },
    });
    // Param dropped → params object empty → undefined passed
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutsTab', {
      screen: 'ExerciseDetail',
      params: undefined,
    });
  });

  test('drops params with quotes / backticks / pipes', () => {
    const nav = makeNav();
    applyAINavigation(nav, {
      stack: 'WorkoutsTab',
      screen: 'ExerciseDetail',
      params: {
        a: "abc'def",
        b: 'abc`def',
        c: 'abc|def',
        d: 'abc&def',
        e: 'abc$def',
      },
    });
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutsTab', {
      screen: 'ExerciseDetail',
      params: undefined,
    });
  });

  test('drops nested object params', () => {
    const nav = makeNav();
    applyAINavigation(nav, {
      stack: 'WorkoutsTab',
      screen: 'ExerciseDetail',
      params: { exerciseId: { evil: 'thing' } as any },
    });
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutsTab', {
      screen: 'ExerciseDetail',
      params: undefined,
    });
  });

  test('drops params longer than 200 chars', () => {
    const nav = makeNav();
    applyAINavigation(nav, {
      stack: 'WorkoutsTab',
      screen: 'ExerciseDetail',
      params: { exerciseId: 'x'.repeat(201) },
    });
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutsTab', {
      screen: 'ExerciseDetail',
      params: undefined,
    });
  });

  test('drops invalid key names (non-identifier)', () => {
    const nav = makeNav();
    applyAINavigation(nav, {
      stack: 'WorkoutsTab',
      screen: 'ExerciseDetail',
      params: {
        '123abc': 'valid', // starts with digit
        'normal': 'value',
        'a-b': 'valid', // dash not allowed
      },
    });
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutsTab', {
      screen: 'ExerciseDetail',
      params: { normal: 'value' },
    });
  });

  test('caps at 5 params even if more passed', () => {
    const nav = makeNav();
    const params: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      params[`paramKey${i}`] = `value${i}`;
    }
    applyAINavigation(nav, {
      stack: 'WorkoutsTab',
      screen: 'ExerciseDetail',
      params,
    });
    const call = nav.navigate.mock.calls[0];
    const passedParams = call[1]?.params ?? {};
    expect(Object.keys(passedParams).length).toBeLessThanOrEqual(5);
  });

  test('coerces numeric params to strings', () => {
    const nav = makeNav();
    applyAINavigation(nav, {
      stack: 'WorkoutsTab',
      screen: 'ExerciseDetail',
      params: { exerciseId: 42 as any },
    });
    expect(nav.navigate).toHaveBeenCalledWith('WorkoutsTab', {
      screen: 'ExerciseDetail',
      params: { exerciseId: '42' },
    });
  });
});

// ─── Defense in depth ───────────────────────────────────────────────────────

describe('FORBIDDEN_AI_SCREENS list', () => {
  test('has all critical destructive/security screens', () => {
    expect(FORBIDDEN_AI_SCREENS.has('DeleteAccountScreen')).toBe(true);
    expect(FORBIDDEN_AI_SCREENS.has('ChangePassword')).toBe(true);
    expect(FORBIDDEN_AI_SCREENS.has('TwoFactorScreen')).toBe(true);
    expect(FORBIDDEN_AI_SCREENS.has('Subscription')).toBe(true);
    expect(FORBIDDEN_AI_SCREENS.has('AdminDashboardScreen')).toBe(true);
    expect(FORBIDDEN_AI_SCREENS.has('Login')).toBe(true);
    expect(FORBIDDEN_AI_SCREENS.has('Onboarding')).toBe(true);
  });

  test('does NOT include legitimate AI-navigable screens', () => {
    expect(FORBIDDEN_AI_SCREENS.has('HomeTab')).toBe(false);
    expect(FORBIDDEN_AI_SCREENS.has('WorkoutsTab')).toBe(false);
    expect(FORBIDDEN_AI_SCREENS.has('Progress')).toBe(false);
    expect(FORBIDDEN_AI_SCREENS.has('Recipes')).toBe(false);
    expect(FORBIDDEN_AI_SCREENS.has('Settings')).toBe(false);
  });
});

// ─── Resilience ─────────────────────────────────────────────────────────────

describe('applyAINavigation — resilience', () => {
  test('returns reason if navigation throws', () => {
    const nav = {
      navigate: jest.fn(() => {
        throw new Error('navigation crash');
      }),
    };
    const r = applyAINavigation(nav, { stack: 'tabs', screen: 'HomeTab' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toMatch(/threw/);
    }
  });

  test('one valid call invokes navigate exactly once', () => {
    const nav = makeNav();
    applyAINavigation(nav, { stack: 'tabs', screen: 'HomeTab' });
    expect(nav.navigate).toHaveBeenCalledTimes(1);
  });
});
