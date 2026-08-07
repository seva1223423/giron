/**
 * Icon buttons must be big enough to hit.
 *
 * The existing accessibility suite checks what VoiceOver *says* — tab labels,
 * streak strings, paywall button text. Nothing checked how big anything is,
 * so a row of 40×40 send / mic / attach buttons sat in the chat input bar,
 * the most-used screen in the app, under the 44pt minimum that `HitTarget`
 * exists in this codebase to guarantee. Its own docstring says "use everywhere
 * small icon buttons appear"; the chat bar did not use it.
 *
 * Enlarging the button beats widening its hit area: an invisible 44pt target
 * around a 40pt circle still looks like a 40pt circle to someone aiming at it.
 * hitSlop stays the escape hatch for the cases where layout genuinely cannot
 * give up the pixels.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..');
const MIN = 44;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(p, out);
    } else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const files = [...walk(path.join(SRC, 'screens')), ...walk(path.join(SRC, 'components'))];

/** Style keys that clearly name a control, sized below the minimum. */
function undersizedControls(src: string): Array<{ key: string; w: number; h: number }> {
  const out: Array<{ key: string; w: number; h: number }> = [];
  for (const m of src.matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    const [, key, body] = m;
    // shadowOffset: { width: 0, height: 4 } is not a control.
    if (/^(shadowOffset|offset)$/.test(key)) continue;
    if (!/(btn|button)$/i.test(key)) continue;
    const w = Number(body.match(/\bwidth:\s*(\d+)/)?.[1]);
    const h = Number(body.match(/\bheight:\s*(\d+)/)?.[1]);
    if (!w || !h) continue;
    if (w < MIN || h < MIN) out.push({ key, w, h });
  }
  return out;
}

describe('touch targets', () => {
  test('no icon button is smaller than 44pt without an explicit hitSlop', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const { key, w, h } of undersizedControls(src)) {
        // A pressable that carries hitSlop, or a file built on HitTarget, is
        // already covered.
        const usedWithSlop = new RegExp(
          `styles\\.${key}\\b[\\s\\S]{0,400}?hitSlop|hitSlop[\\s\\S]{0,400}?styles\\.${key}\\b`,
        ).test(src);
        if (usedWithSlop || src.includes('HitTarget')) continue;
        // Only flag it if it is actually pressed.
        const isPressable = new RegExp(
          `<(TouchableOpacity|Pressable|AnimatedPressable)[\\s\\S]{0,500}?styles\\.${key}\\b`,
        ).test(src);
        if (!isPressable) continue;
        offenders.push(`${path.basename(f)}: ${key} ${w}x${h}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the chat input bar in particular is at the minimum', () => {
    // Named explicitly because it is the single most-tapped row in the app,
    // and because it was the one that failed.
    const src = fs.readFileSync(path.join(SRC, 'screens/ai/components/ChatInputBar.tsx'), 'utf8');
    for (const key of ['sendBtn', 'sideBtn', 'micBtn']) {
      const body = src.match(new RegExp(`${key}:\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(Number(body.match(/width:\s*(\d+)/)?.[1])).toBeGreaterThanOrEqual(MIN);
      expect(Number(body.match(/height:\s*(\d+)/)?.[1])).toBeGreaterThanOrEqual(MIN);
    }
  });

  test('a round button stays round after being enlarged', () => {
    // Bumping 40→44 without touching borderRadius leaves a squircle.
    const src = fs.readFileSync(path.join(SRC, 'screens/ai/components/ChatInputBar.tsx'), 'utf8');
    for (const key of ['sendBtn', 'sideBtn', 'micBtn']) {
      const body = src.match(new RegExp(`${key}:\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      const w = Number(body.match(/width:\s*(\d+)/)?.[1]);
      const r = Number(body.match(/borderRadius:\s*(\d+)/)?.[1]);
      if (!r) continue;
      expect(r).toBe(w / 2);
    }
  });
});
