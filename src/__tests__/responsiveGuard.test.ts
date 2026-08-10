/**
 * Responsive guard: pins the layout properties the 2026-08 device audit
 * verified, so they cannot silently regress.
 *
 * The audit's verdict was that the codebase is already resilient — modest
 * spacing tokens, flex layouts, numberOfLines on every hot list row, zero
 * horizontal overflow on a 320px viewport. What this test does is freeze the
 * three habits that would undo that state one convenient hardcode at a time:
 *
 *  1. no new fixed widths >200 in screens/components (a 320dp viewport minus
 *     paddings is ~288 — anything wider clips on small phones);
 *  2. no new raw Dimensions.get in screens — useResponsive() re-renders on
 *     fold/split-screen changes, a module-level get() does not;
 *  3. the toast keeps its %-based width (was `width: 320`, clipped on
 *     Galaxy Fold cover screens).
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const SCREEN_FILES = walk(path.join(ROOT, 'screens'));
const COMPONENT_FILES = walk(path.join(ROOT, 'components'));

const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');

/**
 * Fixed sizes that are the artifact ITSELF, not the layout:
 *  - ShareImageCard renders a share image at a fixed canvas size by design;
 *  - the 2FA QR code is a 200×200 scannable square;
 *  - NotificationsSection's Dimensions.get predates the audit — allowed as
 *    the frozen legacy count of exactly one.
 */
const FIXED_WIDTH_ALLOWLIST = new Set([
  'screens/workouts/summary/ShareImageCard.tsx',
  'screens/profile/TwoFactorScreen.tsx',
]);
const DIMENSIONS_ALLOWLIST = new Set([
  'screens/settings/components/NotificationsSection.tsx',
]);

describe('responsive guard', () => {
  test('нет новых фикс-width > 200 в screens/ и components/', () => {
    const offenders: string[] = [];
    for (const file of [...SCREEN_FILES, ...COMPONENT_FILES]) {
      if (FIXED_WIDTH_ALLOWLIST.has(rel(file))) continue;
      const src = fs.readFileSync(file, 'utf8');
      const re = /width:\s*(\d+)\s*[,}]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const w = parseInt(m[1], 10);
        if (w > 200) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${rel(file)}:${line} — width: ${w}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('нет новых голых Dimensions.get в screens/', () => {
    const offenders: string[] = [];
    for (const file of SCREEN_FILES) {
      if (DIMENSIONS_ALLOWLIST.has(rel(file))) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (src.includes('Dimensions.get(')) offenders.push(rel(file));
    }
    expect(offenders).toEqual([]);
  });

  test('тост остаётся процентным по ширине (фикс аудита 2026-08)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'components/app-modal/toast.tsx'), 'utf8');
    expect(src).toContain("width: '92%'");
    expect(src).toContain('maxWidth: 320');
    expect(src).not.toMatch(/width:\s*320\s*,/);
  });
});
