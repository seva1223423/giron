/**
 * A colour map must keep telling its categories apart.
 *
 * The Direction A migration replaced 886 literals across the admin screens by
 * lookup — old hex in, new token out. That is safe for backgrounds and safe
 * for text, and wrong for any map where two DIFFERENT old colours carried two
 * DIFFERENT meanings: indigo and purple both became gold, red and orange both
 * became terracotta. Support's six category chips collapsed to four colours,
 * the activity timeline stopped separating tickets from AI, and two of the
 * four analytics charts came out identical.
 *
 * Nothing failed. Nothing threw. The screens just quietly stopped
 * distinguishing things, which is the kind of regression a type-checker and a
 * render test both sail straight past.
 */

import * as fs from 'fs';
import * as path from 'path';

const DIR = path.join(__dirname, '../screens/admin');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.tsx'));

/** Direction A + the two in-family shades the maps needed. */
const ALLOWED = new Set([
  '#0E0E0F', '#17171A', '#1E1E22', '#2A2A2F',
  '#F4F1EA', '#A8A49C', '#6E6A63', '#FFFFFF', '#FFF',
  '#D4B07A', '#B8945F', '#9AC28C', '#E8A36A', '#E07A6B',
  '#0077FF', '#000000', // VK brand blue; black is the modal scrim — a third party's identity, not ours to restyle
]);

/** Keys that describe the same surface, so sharing a colour is intended. */
const SAME_SURFACE = /^(background|border|borderLeft|borderTop|borderBottom|shadow|tint)Color$/;

function hexMaps(source: string): Array<{ line: number; pairs: Array<[string, string]> }> {
  const out: Array<{ line: number; pairs: Array<[string, string]> }> = [];
  const re = /\{([^{}]*?#[0-9A-Fa-f]{3,6}[^{}]*?)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const pairs = [...m[1].matchAll(/(\w+)\s*:\s*['"](#[0-9A-Fa-f]{3,8})['"]/g)]
      .map((p) => [p[1], p[2].slice(0, 7).toUpperCase()] as [string, string])
      .filter(([k]) => !SAME_SURFACE.test(k));
    if (pairs.length >= 2) out.push({ line: source.slice(0, m.index).split('\n').length, pairs });
  }
  return out;
}

describe('admin palette integrity', () => {
  test('every colour in the admin screens is a Direction A token', () => {
    const strays: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      for (const m of src.matchAll(/['"](#[0-9A-Fa-f]{6})(?:[0-9A-Fa-f]{2})?['"]/g)) {
        const hex = m[1].toUpperCase();
        if (!ALLOWED.has(hex)) strays.push(`${f}: ${hex}`);
      }
      // Opacity suffixes like '#D4B07A33' are fine; the base must still be a token.
      for (const m of src.matchAll(/(#[0-9A-Fa-f]{6})[0-9A-Fa-f]{2}\b/g)) {
        const hex = m[1].toUpperCase();
        if (!ALLOWED.has(hex)) strays.push(`${f}: ${hex} (with opacity)`);
      }
    }
    expect([...new Set(strays)]).toEqual([]);
  });

  test('no banned legacy colour survives anywhere in admin', () => {
    const BANNED = ['#8B5CF6', '#A78BFA', '#7C3AED', '#6366F1', '#F59E0B', '#EF4444', '#10B981'];
    const found: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      for (const b of BANNED) if (src.toUpperCase().includes(b)) found.push(`${f}: ${b}`);
    }
    expect(found).toEqual([]);
  });

  test('a map of distinct keys never gives two of them the same colour', () => {
    const collisions: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      for (const { line, pairs } of hexMaps(src)) {
        const byColour = new Map<string, string[]>();
        for (const [k, v] of pairs) byColour.set(v, [...(byColour.get(v) ?? []), k]);
        for (const [v, keys] of byColour) {
          if (keys.length > 1) collisions.push(`${f}:${line} — ${keys.join(' + ')} all ${v}`);
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  test('the four analytics charts are four different colours', () => {
    const src = fs.readFileSync(path.join(DIR, 'AdminAnalyticsScreen.tsx'), 'utf8');
    const series = [...src.matchAll(/<MiniBarChart[^>]*?color="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]);
    expect(series.length).toBeGreaterThanOrEqual(4);
    // Charts in the same section must not share a colour.
    const topFour = series.slice(0, 4);
    expect(new Set(topFour).size).toBe(topFour.length);
  });

  test('support category chips stay six distinct colours', () => {
    const src = fs.readFileSync(path.join(DIR, 'AdminSupportScreen.tsx'), 'utf8');
    const block = src.match(/CAT_COLORS: Record<string, string> = \{([\s\S]*?)\}/)?.[1] ?? '';
    const colours = [...block.matchAll(/'(#[0-9A-Fa-f]{6})'/g)].map((m) => m[1]);
    expect(colours.length).toBe(6);
    expect(new Set(colours).size).toBe(6);
  });
});

describe('no emoji in admin UI', () => {
  test('the pictograph sweep stays at zero', () => {
    // CLAUDE.md: 39 SVG icons, no emoji. 163 had accumulated across these
    // files — decorating labels that already said the thing, and serving as
    // icon slots where the Icon set was sitting unused. Typographic marks
    // (✓ ✕ ✗ → ·) are monochrome glyphs, inherit text colour, and stay.
    const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B50}\u{23F0}-\u{23FA}\u{2795}\u{2705}\u{2757}\u{2696}\u{FE0F}]/u;
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      src.split('\n').forEach((line, i) => {
        if (EMOJI.test(line)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
