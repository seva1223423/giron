/**
 * Round 192 — AI navigation safety tests.
 *
 * Verifies the whitelist-based navigation system cannot be abused
 * to:
 *   • Open destructive screens (DeleteAccount, etc.)
 *   • Bypass auth/onboarding/admin gates
 *   • Inject path-traversal or arbitrary strings as screen names
 *   • Pass malformed params that crash the client navigator
 *   • Smuggle extra fields through the validator
 *
 * The whitelist is the defense — these tests guarantee it stays
 * tight as new screens are added.
 */

import {
  NAV_WHITELIST,
  validateNavigation,
  FORBIDDEN_SCREENS,
  type NavTarget,
} from '../ai/navigationWhitelist';

// ─── Whitelist contents ──────────────────────────────────────────────────────

describe('NAV_WHITELIST contents — known-safe screens only', () => {
  test('contains all 4 main tabs', () => {
    expect(NAV_WHITELIST.home).toBeDefined();
    expect(NAV_WHITELIST.workouts).toBeDefined();
    expect(NAV_WHITELIST.nutrition).toBeDefined();
    expect(NAV_WHITELIST.profile).toBeDefined();
  });

  test('every entry has stack + screen + label', () => {
    for (const [alias, entry] of Object.entries(NAV_WHITELIST)) {
      expect(entry.stack).toBeDefined();
      expect(entry.screen).toBeDefined();
      expect(entry.label).toBeDefined();
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  test('aliases are snake_case lowercase only', () => {
    for (const alias of Object.keys(NAV_WHITELIST)) {
      expect(alias).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  test('stack values are limited to known navigators', () => {
    const validStacks = ['tabs', 'WorkoutsTab', 'NutritionTab', 'ProfileTab'];
    for (const entry of Object.values(NAV_WHITELIST)) {
      expect(validStacks).toContain(entry.stack);
    }
  });

  test('NO destructive/security screen appears in whitelist', () => {
    const aliasNames = Object.keys(NAV_WHITELIST);
    const screenNames = Object.values(NAV_WHITELIST).map((e) => e.screen);
    const allRefs = [...aliasNames, ...screenNames];

    // Critical: these MUST NOT appear in whitelist
    const FORBIDDEN_SUBSTRINGS = [
      'DeleteAccount',
      'ChangePassword',
      'ChangeEmail',
      'ChangePhone',
      'TwoFactor',
      'Sessions',
      'LinkedAccounts',
      'Subscription',
      'Admin',
      'Login',
      'Register',
      'ResetPassword',
      'Onboarding',
    ];
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      const hits = allRefs.filter((r) => r.toLowerCase().includes(forbidden.toLowerCase()));
      expect(hits).toEqual([]);
    }
  });
});

// ─── validateNavigation — happy path ────────────────────────────────────────

describe('validateNavigation — accepted targets', () => {
  test('home alias → main tabs / HomeTab', () => {
    const r = validateNavigation('home', undefined);
    expect('payload' in r).toBe(true);
    if ('payload' in r) {
      expect(r.payload.stack).toBe('tabs');
      expect(r.payload.screen).toBe('HomeTab');
      expect(r.label).toBe('Главная');
    }
  });

  test('workouts → tabs / WorkoutsTab', () => {
    const r = validateNavigation('workouts', undefined);
    if ('payload' in r) {
      expect(r.payload.stack).toBe('tabs');
      expect(r.payload.screen).toBe('WorkoutsTab');
    }
  });

  test('progress → WorkoutsTab / Progress', () => {
    const r = validateNavigation('progress', undefined);
    if ('payload' in r) {
      expect(r.payload.stack).toBe('WorkoutsTab');
      expect(r.payload.screen).toBe('Progress');
    }
  });

  test('food_scanner → NutritionTab / FoodScanner', () => {
    const r = validateNavigation('food_scanner', undefined);
    if ('payload' in r) {
      expect(r.payload.stack).toBe('NutritionTab');
      expect(r.payload.screen).toBe('FoodScanner');
    }
  });

  test('settings → ProfileTab / Settings', () => {
    const r = validateNavigation('settings', undefined);
    if ('payload' in r) {
      expect(r.payload.stack).toBe('ProfileTab');
      expect(r.payload.screen).toBe('Settings');
    }
  });
});

// ─── validateNavigation — normalization ─────────────────────────────────────

describe('validateNavigation — input normalization', () => {
  test('uppercase HOME normalizes to home', () => {
    const r = validateNavigation('HOME', undefined);
    expect('payload' in r).toBe(true);
  });

  test('CamelCase Home normalizes', () => {
    const r = validateNavigation('Home', undefined);
    expect('payload' in r).toBe(true);
  });

  test('hyphen instead of underscore — exercise-detail → exercise_detail', () => {
    const r = validateNavigation('exercise-detail', { exerciseId: 'abc123' });
    expect('payload' in r).toBe(true);
    if ('payload' in r) {
      expect(r.payload.screen).toBe('ExerciseDetail');
    }
  });

  test('space instead of underscore — workout history → workout_history', () => {
    const r = validateNavigation('workout history', undefined);
    expect('payload' in r).toBe(true);
  });
});

// ─── validateNavigation — rejected targets (CRITICAL) ──────────────────────

describe('validateNavigation — REJECTS forbidden screens', () => {
  // These are the screens that must NEVER be reachable via AI nav.
  // If any of these starts succeeding, the whitelist is broken.

  test('rejects DeleteAccountScreen', () => {
    const r = validateNavigation('DeleteAccountScreen', undefined);
    expect('error' in r).toBe(true);
  });

  test('rejects delete_account', () => {
    const r = validateNavigation('delete_account', undefined);
    expect('error' in r).toBe(true);
  });

  test('rejects ChangePassword', () => {
    expect('error' in validateNavigation('ChangePassword', undefined)).toBe(true);
    expect('error' in validateNavigation('change_password', undefined)).toBe(true);
  });

  test('rejects ChangeEmail / ChangePhone', () => {
    expect('error' in validateNavigation('change_email', undefined)).toBe(true);
    expect('error' in validateNavigation('change_phone', undefined)).toBe(true);
  });

  test('rejects 2FA setup screen', () => {
    expect('error' in validateNavigation('two_factor', undefined)).toBe(true);
    expect('error' in validateNavigation('TwoFactorScreen', undefined)).toBe(true);
  });

  test('rejects Subscription / paywall', () => {
    expect('error' in validateNavigation('subscription', undefined)).toBe(true);
    expect('error' in validateNavigation('paywall', undefined)).toBe(true);
  });

  test('rejects all Admin* screens', () => {
    const adminTargets = [
      'admin', 'admin_dashboard', 'admin_users', 'admin_logs',
      'admin_metrics', 'AdminDashboardScreen', 'AdminUsersScreen',
    ];
    for (const target of adminTargets) {
      expect('error' in validateNavigation(target, undefined)).toBe(true);
    }
  });

  test('rejects auth flow screens', () => {
    expect('error' in validateNavigation('login', undefined)).toBe(true);
    expect('error' in validateNavigation('register', undefined)).toBe(true);
    expect('error' in validateNavigation('reset_password', undefined)).toBe(true);
    expect('error' in validateNavigation('onboarding', undefined)).toBe(true);
  });

  test('rejects LinkedAccounts (security-adjacent)', () => {
    expect('error' in validateNavigation('linked_accounts', undefined)).toBe(true);
  });

  test('rejects sessions screen (security audit)', () => {
    expect('error' in validateNavigation('sessions', undefined)).toBe(true);
  });
});

// ─── validateNavigation — adversarial inputs ────────────────────────────────

describe('validateNavigation — adversarial / malformed inputs', () => {
  test('rejects empty target', () => {
    const r = validateNavigation('', undefined);
    expect('error' in r).toBe(true);
  });

  test('rejects undefined target', () => {
    const r = validateNavigation(undefined, undefined);
    expect('error' in r).toBe(true);
  });

  test('rejects path traversal attempt', () => {
    expect('error' in validateNavigation('../admin', undefined)).toBe(true);
    expect('error' in validateNavigation('home/../admin', undefined)).toBe(true);
  });

  test('rejects non-string target', () => {
    const r = validateNavigation(123 as any, undefined);
    expect('error' in r).toBe(true);
  });

  test('rejects target with special chars', () => {
    expect('error' in validateNavigation('home; rm -rf /', undefined)).toBe(true);
    expect('error' in validateNavigation("home' OR 1=1", undefined)).toBe(true);
    expect('error' in validateNavigation('home ', undefined)).toBe(true);
  });

  test('rejects extremely long target string', () => {
    const r = validateNavigation('x'.repeat(1000), undefined);
    expect('error' in r).toBe(true);
  });

  test('does not accept partial match', () => {
    expect('error' in validateNavigation('hom', undefined)).toBe(true);
    expect('error' in validateNavigation('home_extra', undefined)).toBe(true);
  });
});

// ─── Param validation ───────────────────────────────────────────────────────

describe('validateNavigation — params validation', () => {
  test('exercise_detail requires exerciseId', () => {
    const r = validateNavigation('exercise_detail', undefined);
    expect('error' in r).toBe(true);
    if ('error' in r) {
      expect(r.error).toMatch(/exerciseId/);
    }
  });

  test('exercise_detail accepts valid alphanumeric exerciseId', () => {
    const r = validateNavigation('exercise_detail', { exerciseId: 'abc123_def-456' });
    expect('payload' in r).toBe(true);
    if ('payload' in r) {
      expect(r.payload.params?.exerciseId).toBe('abc123_def-456');
    }
  });

  test('rejects exerciseId with SQL chars', () => {
    const r = validateNavigation('exercise_detail', { exerciseId: "abc'; DROP TABLE--" });
    expect('error' in r).toBe(true);
  });

  test('rejects exerciseId with path traversal', () => {
    const r = validateNavigation('exercise_detail', { exerciseId: '../etc/passwd' });
    expect('error' in r).toBe(true);
  });

  test('rejects exerciseId longer than 64 chars', () => {
    const r = validateNavigation('exercise_detail', { exerciseId: 'x'.repeat(100) });
    expect('error' in r).toBe(true);
  });

  test('rejects exerciseId with whitespace / control chars', () => {
    expect('error' in validateNavigation('exercise_detail', { exerciseId: 'abc def' })).toBe(true);
    expect('error' in validateNavigation('exercise_detail', { exerciseId: 'abc\ndef' })).toBe(true);
    expect('error' in validateNavigation('exercise_detail', { exerciseId: 'abc ' })).toBe(true);
  });

  test('rejects extra params beyond schema (silently drops)', () => {
    const r = validateNavigation('home', { evilParam: 'rm -rf /' });
    expect('payload' in r).toBe(true);
    if ('payload' in r) {
      // home doesn't accept params; validator drops them
      expect(r.payload.params).toBeUndefined();
    }
  });

  test('program_detail requires programId', () => {
    const r1 = validateNavigation('program_detail', undefined);
    expect('error' in r1).toBe(true);

    const r2 = validateNavigation('program_detail', { programId: 'prog_abc123' });
    expect('payload' in r2).toBe(true);
  });

  test('recipe_detail requires recipeId', () => {
    const r1 = validateNavigation('recipe_detail', {});
    expect('error' in r1).toBe(true);

    const r2 = validateNavigation('recipe_detail', { recipeId: 'rec_abc123' });
    expect('payload' in r2).toBe(true);
  });
});

// ─── FORBIDDEN_SCREENS list ─────────────────────────────────────────────────

describe('FORBIDDEN_SCREENS — client-side defense in depth', () => {
  test('list includes all critical screens', () => {
    expect(FORBIDDEN_SCREENS).toContain('DeleteAccountScreen');
    expect(FORBIDDEN_SCREENS).toContain('ChangePassword');
    expect(FORBIDDEN_SCREENS).toContain('ChangeEmailScreen');
    expect(FORBIDDEN_SCREENS).toContain('ChangePhoneScreen');
    expect(FORBIDDEN_SCREENS).toContain('TwoFactorScreen');
    expect(FORBIDDEN_SCREENS).toContain('Subscription');
    expect(FORBIDDEN_SCREENS).toContain('AdminDashboardScreen');
    expect(FORBIDDEN_SCREENS).toContain('Login');
    expect(FORBIDDEN_SCREENS).toContain('Onboarding');
  });

  test('every screen in NAV_WHITELIST is NOT in FORBIDDEN_SCREENS', () => {
    const whitelisted = Object.values(NAV_WHITELIST).map((e) => e.screen);
    for (const screen of whitelisted) {
      expect(FORBIDDEN_SCREENS).not.toContain(screen as any);
    }
  });
});

// ─── Coverage assertions ────────────────────────────────────────────────────

describe('Whitelist coverage stats', () => {
  test('has at least 25 safe targets (rich enough for AI)', () => {
    expect(Object.keys(NAV_WHITELIST).length).toBeGreaterThanOrEqual(25);
  });

  test('has all 4 tab roots', () => {
    const tabsCount = Object.values(NAV_WHITELIST).filter((e) => e.stack === 'tabs').length;
    expect(tabsCount).toBeGreaterThanOrEqual(4);
  });

  test('has param-required targets (exercise/program/recipe details)', () => {
    const withParams = Object.values(NAV_WHITELIST).filter((e) => e.paramSchema);
    expect(withParams.length).toBeGreaterThanOrEqual(3);
  });
});
