/**
 * One failing panel must not blank the whole admin screen.
 *
 * The dashboard and the analytics screen each loaded everything through a
 * single bare `Promise.all` with no catch. One rejected request — a cold
 * Render dyno taking too long, a 500 on a side panel — rejected the lot, the
 * primary state stayed null, and the render did `if (!stats) return null`.
 * The result was a blank screen with no error and no way to retry except
 * leaving and coming back. That is what "the buttons don't work" looked like.
 *
 * These pin the shape of the fix rather than the pixels: the required call is
 * awaited on its own, every supplementary call carries its own catch, and
 * neither screen can reach `return null` without an error state behind it.
 */

import * as fs from 'fs';
import * as path from 'path';

const read = (f: string) =>
  fs.readFileSync(path.join(__dirname, '../screens/admin', f), 'utf8');

const dashboard = read('AdminDashboardScreen.tsx');
const analytics = read('AdminAnalyticsScreen.tsx');
const support = read('AdminSupportScreen.tsx');

/** Every call inside a Promise.all([...]) block must end in .catch(...). */
function unguardedInsidePromiseAll(source: string): string[] {
  const bad: string[] = [];
  const re = /Promise\.all\(\[([\s\S]*?)\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    for (const line of m[1].split('\n')) {
      const call = line.trim();
      if (!call.startsWith('adminService.') && !call.startsWith('supportService.')) continue;
      if (!call.includes('.catch(')) bad.push(call);
    }
  }
  return bad;
}

describe('admin screens survive a partial failure', () => {
  test('dashboard: nothing inside Promise.all is unguarded', () => {
    expect(unguardedInsidePromiseAll(dashboard)).toEqual([]);
  });

  test('analytics: nothing inside Promise.all is unguarded', () => {
    expect(unguardedInsidePromiseAll(analytics)).toEqual([]);
  });

  test('support: the chips above the list cannot take the list down', () => {
    expect(unguardedInsidePromiseAll(support)).toEqual([]);
  });

  test('the required call is awaited outside the parallel block', () => {
    // getStats / getAnalytics are the one thing each screen cannot render
    // without, so they are awaited separately and their failure is caught.
    expect(dashboard).toMatch(/const statsData = await adminService\.getStats\(\)/);
    expect(analytics).toMatch(/const res = await adminService\.getAnalytics\(period\)/);
  });

  test('both loaders catch, not just finally', () => {
    // `try { … } finally { … }` with no catch is what turned a failed request
    // into an unhandled rejection and a blank screen.
    for (const src of [dashboard, analytics]) {
      const loader = src.match(/const load = useCallback\(async[\s\S]*?\n  \}, \[/)?.[0] ?? '';
      expect(loader).toContain('} catch {');
      expect(loader).toContain('setLoadError');
    }
  });

  test('neither screen returns bare null when its data is missing', () => {
    expect(dashboard).not.toMatch(/if \(!stats\) return null;/);
    expect(analytics).not.toMatch(/if \(!data\) return null;/);
    for (const src of [dashboard, analytics]) {
      expect(src).toContain('Повторить');
    }
  });

  test('bulk ticket updates report what actually happened', () => {
    // Promise.all stopped at the first rejection, so successfully updated
    // tickets were never reflected and the screen stayed in select mode.
    expect(support).toContain('Promise.allSettled');
    expect(support).toMatch(/rejected/);
    expect(support).toContain('exitSelectMode');
  });
});

describe('the same shape outside admin', () => {
  test('sessions stay visible when trusted devices fail to load', () => {
    // Sessions answer "am I signed in somewhere I don't recognise" — the one
    // list on this screen someone worried about their account actually needs.
    // Unguarded, a failing trusted-devices call took sessions down with it.
    const src = fs.readFileSync(
      path.join(__dirname, '../screens/profile/SessionsScreen.tsx'),
      'utf8',
    );
    expect(src).toMatch(/getTrustedDevices\(\)\.catch\(/);
    // The security-critical call must NOT be silently swallowed — its failure
    // goes through the outer catch and shows the error alert.
    expect(src).not.toMatch(/getSessions\(\)\.catch\(/);
  });
});
