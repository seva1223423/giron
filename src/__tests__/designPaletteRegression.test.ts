/**
 * Direction A palette regression pin (audit R-2026-05-22).
 *
 * The CLAUDE.md rule: legacy palette `#8B5CF6` / `#A78BFA` / `#7C3AED` /
 * `#6366F1` / `#F59E0B` / `#EF4444` / `#10B981` must NOT appear in
 * `src/` outside the source-of-truth `theme/colors.ts`.
 *
 * Reality on 2026-05-22 audit: 407 occurrences across 28 files. Most
 * (372) live in admin screens (`src/screens/admin/`) that haven't been
 * migrated to Direction A yet — they're internal-only and lower
 * priority. The remaining 25 are scattered across user-facing screens
 * (support, security, profile, tracker, etc.).
 *
 * This test does two things:
 *   1. Locks the CURRENT per-file count as an upper bound — no file
 *      can grow its banned-palette usage from here. New code must use
 *      `colors.error` / `colors.warning` / `colors.success` from the
 *      Direction A theme (warm terracotta / amber / sage tones).
 *   2. Confirms the source-of-truth + docs files are correctly
 *      allow-listed (theme/colors.ts can mention old purple in
 *      comments; brandColors.ts documents the third-party allowlist;
 *      tests are allowed to reference banned hex).
 *
 * When a file's count DROPS (someone migrated it), update the cap
 * here. Never bump a cap UP without explicit design-team sign-off.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');
const BANNED = /#(?:8B5CF6|A78BFA|7C3AED|6366F1|F59E0B|EF4444|10B981)\b/gi;

/** Files that are ALLOWED to mention banned palette (source of truth,
 *  comments, tests, and the brand-allowlist file). */
const ALLOWLIST = new Set([
  'theme/colors.ts',
  'theme/brandColors.ts',
  'components/ErrorBoundary.tsx',          // historical-migration comment
  'components/ForceUpdateModal.tsx',       // historical-migration comment
  'screens/home/HomeScreen.tsx',           // 1 historical-migration comment (R-233)
  '__tests__/designPalette.test.ts',
  '__tests__/designColorTokenValidity.test.ts',
  '__tests__/designPaletteRegression.test.ts',
  // Lists the banned hexes in order to assert the admin screens contain none.
  '__tests__/adminPaletteIntegrity.test.ts',
]);

/** Per-file caps (upper bound — new code can't push these higher).
 *  Lowering is encouraged: when a file is migrated, drop its cap. */
const FILE_CAPS: Record<string, number> = {
  // ── Admin screens — internal tooling, lower-priority migration ──────
  'screens/admin/AdminAnnouncementsScreen.tsx': 19,
  'screens/admin/AdminDashboardScreen.tsx': 88,
  'screens/admin/AdminAnalyticsScreen.tsx': 72,
  'screens/admin/AdminGuard.tsx': 4,
  'screens/admin/AdminLogsScreen.tsx': 17,
  'screens/admin/AdminSecurityEventsScreen.tsx': 4,
  'screens/admin/AdminMetricsKeyScreen.tsx': 18,
  'screens/admin/AdminSupportScreen.tsx': 42,
  'screens/admin/AdminSubscriptionsScreen.tsx': 23,
  'screens/admin/AdminUserDetailScreen.tsx': 67,
  'screens/admin/AdminUsersScreen.tsx': 43,
  // ── User-facing screens (1-4 instances each — migrate next) ─────────
  'screens/auth/RegisterScreen.tsx': 1,           // password strength meter
  'screens/profile/SecurityEventsScreen.tsx': 4,  // security event colors
  'screens/profile/ProfileScreen.tsx': 4,         // admin badges + warning icon
  'screens/profile/ChangePasswordScreen.tsx': 1,  // password strength meter
  'screens/support/SupportTicketScreen.tsx': 4,   // ticket status palette
  'screens/support/SupportScreen.tsx': 3,         // ticket status palette
  'screens/tracker/components/WorkoutHeader.tsx': 3,    // muscle group palette
  'screens/tracker/components/RestTimerOverlay.tsx': 1, // urgent state
  'screens/tracker/components/PRToast.tsx': 3,    // PR confetti palette (decorative — 3 banned hex in CONFETTI_COLORS array)
  'screens/nutrition/history/MacroTrendsChart.tsx': 1,  // over-budget marker
  // Note: HomeScreen.tsx had 2; one was a comment (allowed), one was
  // EF4444 in inline style — fixed in audit R-2026-05-22 commit.
};

function listFiles(dir: string, ext: RegExp = /\.(tsx|ts)$/): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listFiles(full, ext));
    } else if (ext.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

function relPath(abs: string): string {
  return path.relative(SRC, abs).replace(/\\/g, '/');
}

function countViolations(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf8');
  const matches = content.match(BANNED);
  return matches ? matches.length : 0;
}

describe('Direction A palette regression', () => {
  const allFiles = listFiles(SRC);
  const violators = allFiles
    .map((f) => ({ file: relPath(f), count: countViolations(f) }))
    .filter((v) => v.count > 0 && !ALLOWLIST.has(v.file));

  test('no NEW files contain banned palette (must be allow-listed or capped)', () => {
    const unknown = violators.filter((v) => !(v.file in FILE_CAPS));
    if (unknown.length > 0) {
      const msg = unknown
        .map((u) => `  ${u.file}: ${u.count} hits`)
        .join('\n');
      throw new Error(
        `New banned-palette violations detected — add to ALLOWLIST or FILE_CAPS:\n${msg}\n\n` +
          `Either migrate to Direction A (colors.error / colors.warning / colors.success) ` +
          `or add an explicit cap to FILE_CAPS in this test file with a justification comment.`,
      );
    }
  });

  test('every capped file is at or below its cap (no growth allowed)', () => {
    const overruns: string[] = [];
    for (const [file, cap] of Object.entries(FILE_CAPS)) {
      const actual = violators.find((v) => v.file === file)?.count ?? 0;
      if (actual > cap) {
        overruns.push(`  ${file}: cap=${cap}, actual=${actual} (+${actual - cap})`);
      }
    }
    if (overruns.length > 0) {
      throw new Error(
        `Banned-palette count grew in:\n${overruns.join('\n')}\n\n` +
          `If the growth is intentional, raise the cap in FILE_CAPS with a reason. ` +
          `Otherwise migrate to colors.error / colors.warning / colors.success.`,
      );
    }
  });

  test('files where the cap has been brought to ZERO no longer appear in violators', () => {
    // When a file gets migrated, drop it from FILE_CAPS. This test
    // catches the inverse: a file in FILE_CAPS with cap=0 that still
    // has violations.
    for (const [file, cap] of Object.entries(FILE_CAPS)) {
      if (cap === 0) {
        const actual = violators.find((v) => v.file === file)?.count ?? 0;
        expect(actual).toBe(0);
      }
    }
  });
});
