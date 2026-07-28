/**
 * OAuth scope regression pin — keep social-login permission requests
 * at the minimum needed for "create or fetch the user" semantics.
 *
 * The threat we're pinning against: a future commit that silently widens
 * the OAuth scope to satisfy some new feature ("just add `friends` so we
 * can suggest workout buddies") would also widen the consent screen and
 * the data the provider hands back. By 152-ФЗ minimisation principle and
 * GDPR Art.5(1)(c), we collect ONLY what we need to identify the user.
 *
 * Current scope budget:
 *   - Google: ['openid', 'profile', 'email']
 *       openid → OIDC id_token, profile → name + given_name + family_name,
 *       email → verified email + email_verified flag.
 *   - VK: 'email'
 *       VK gives us id + first_name + last_name + photo automatically;
 *       email is the only extra permission we ask for.
 *   - Yandex: no `scope=` param at all
 *       Yandex default returns id + login + emails (default-permitted).
 *
 * If a real feature genuinely needs more (e.g. Calendar OAuth for an
 * actual scheduling integration), bump this list explicitly so the
 * review surface is visible.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

// ─── Google ─────────────────────────────────────────────────────────────────

describe('Google sign-in is gone', () => {
  test('no Google button, service call or server route remains', () => {
    // Removed on purpose: the app targets Russia, where Google sign-in is the
    // least useful of the three. Yandex covers the same ground. This pins the
    // removal so it cannot creep back in unnoticed — and so the scope rules
    // above do not need a component that no longer exists.
    expect(fs.existsSync(path.join(REPO_ROOT, 'src/components/GoogleAuthButton.tsx'))).toBe(false);
    expect(read('src/services/authService.ts')).not.toContain('/auth/google');
    expect(read('server/src/routes/auth.ts')).not.toContain("router.post('/google'");
    expect(read('server/package.json')).not.toContain('google-auth-library');
  });
});

// ─── VK ──────────────────────────────────────────────────────────────────────

describe('OAuth scope pin — VK (LoginScreen + RegisterScreen)', () => {
  const login = read('src/screens/auth/LoginScreen.tsx');
  const register = read('src/screens/auth/RegisterScreen.tsx');

  test('LoginScreen VK URL has scope=email and nothing more', () => {
    // The authorize URL string contains `scope=email&state=...` — the next
    // segment must be `&` (separator) or end-of-URL, NOT another scope
    // value comma-joined.
    expect(login).toContain('scope=email&state=');
  });

  test('RegisterScreen VK URL has scope=email and nothing more', () => {
    expect(register).toContain('scope=email&state=');
  });

  test('VK URL does NOT request high-risk permissions', () => {
    // VK has its own scope vocabulary — these are the ones we never want:
    // https://dev.vk.com/reference/access-rights
    const FORBIDDEN_VK = [
      'friends',
      'wall',
      'photos',
      'messages',
      'groups',
      'docs',
      'notes',
      'pages',
      'audio',
      'video',
      'stories',
      'market',
      'offline', // long-lived access token
    ];
    for (const scope of FORBIDDEN_VK) {
      // Look for it as part of a scope= or scope=email,xxx pattern.
      // The pattern `scope=...${scope}...` is too loose (false-positives on
      // unrelated `friends` in comments). Anchor on the VK authorize URL.
      const loginVkLine = login.split('\n').find((l) => l.includes('oauth.vk.com/authorize'));
      const regVkLine = register.split('\n').find((l) => l.includes('oauth.vk.com/authorize'));
      expect(loginVkLine || '').not.toMatch(new RegExp(`scope=[^&]*\\b${scope}\\b`));
      expect(regVkLine || '').not.toMatch(new RegExp(`scope=[^&]*\\b${scope}\\b`));
    }
  });
});

// ─── Yandex ──────────────────────────────────────────────────────────────────

describe('OAuth scope pin — Yandex (LoginScreen + RegisterScreen)', () => {
  const login = read('src/screens/auth/LoginScreen.tsx');
  const register = read('src/screens/auth/RegisterScreen.tsx');

  test('Yandex authorize URL has NO custom scope param (minimum defaults only)', () => {
    // Yandex authorize URL we build looks like:
    //   https://oauth.yandex.ru/authorize?response_type=token&client_id=...&redirect_uri=...&state=...
    // No `scope=` param means we accept the bare default permission set.
    const loginYa = login.split('\n').find((l) => l.includes('oauth.yandex.ru/authorize')) || '';
    const regYa = register.split('\n').find((l) => l.includes('oauth.yandex.ru/authorize')) || '';
    expect(loginYa).not.toMatch(/[&?]scope=/);
    expect(regYa).not.toMatch(/[&?]scope=/);
  });
});
