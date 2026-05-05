/**
 * DESIGN — unused / orphaned component detector.
 * ───────────────────────────────────────────────
 * Per design.md §27 audit finding: HomeScreen used to import 11
 * components from `home/components/` that were never rendered (~1300
 * LOC dead bundle weight). Wave 4 trimmed those imports but the
 * COMPONENT FILES still exist. If they remain unused for too long,
 * developers re-introduce them as imports without realizing they're
 * dead — re-creating the visual debt.
 *
 * This test scans `src/screens/home/components/index.ts` exports and
 * fails if any export is not imported anywhere outside the home/components
 * folder itself.
 *
 * Allow-list: components reserved for future use (rare).
 */
import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = join(__dirname, '..');
const HOME_COMPONENTS_INDEX = join(ROOT, 'screens', 'home', 'components', 'index.ts');

// Empty: all "reserved for future re-introduction" entries deleted
// per CLAUDE.md §2 Simplicity First (no speculative future variants
// without an active request).
const ALLOW_LIST = new Set<string>([]);

function* walkAll(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === '__snapshots__' || name === '__tests__' || name === 'node_modules') continue;
      yield* walkAll(full);
    } else if (st.isFile() && /\.(tsx?|jsx?)$/.test(name)) {
      yield full;
    }
  }
}

function parseExports(indexPath: string): string[] {
  if (!existsSync(indexPath)) return [];
  const text = readFileSync(indexPath, 'utf8');
  const exports: string[] = [];
  // Match `export { Name1, Name2 } from './x';`
  const reBraces = /export\s*\{\s*([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = reBraces.exec(text)) !== null) {
    const list = m[1].split(',').map((s) => s.trim().replace(/^\s*type\s+/, '').replace(/\s+as\s+\w+/, '').trim());
    for (const name of list) if (name) exports.push(name);
  }
  // Match `export { default as Name } from './x';`
  const reDefault = /export\s*\{\s*default\s+as\s+(\w+)/g;
  while ((m = reDefault.exec(text)) !== null) {
    exports.push(m[1]);
  }
  return exports;
}

function findUsages(name: string): { file: string; line: number }[] {
  const re = new RegExp(`\\b${name}\\b`);
  const usages: { file: string; line: number }[] = [];
  for (const file of walkAll(ROOT)) {
    const rel = relative(ROOT, file).split(sep).join('/');
    // Skip the index.ts that exports it + the component file itself
    if (rel.includes('screens/home/components/')) continue;
    if (rel.includes('__tests__')) continue;
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        usages.push({ file: rel, line: i + 1 });
        break; // one usage per file is enough
      }
    }
  }
  return usages;
}

describe('Direction A — unused home components', () => {
  const exports = parseExports(HOME_COMPONENTS_INDEX);

  it('every home/components/* export is imported somewhere outside home/components/', () => {
    if (exports.length === 0) {
      // index.ts not present or no exports — nothing to verify
      expect(exports.length).toBeGreaterThanOrEqual(0);
      return;
    }
    const orphaned: string[] = [];
    for (const name of exports) {
      if (ALLOW_LIST.has(name)) continue;
      const usages = findUsages(name);
      if (usages.length === 0) orphaned.push(name);
    }
    if (orphaned.length > 0) {
      throw new Error(
        `Found ${orphaned.length} orphaned export(s) from src/screens/home/components/:\n\n` +
          orphaned.map((n) => `  ${n}`).join('\n') +
          `\n\nEither delete these components, OR add them to ALLOW_LIST in this test\n` +
          `with a comment explaining why they're reserved.`,
      );
    }
    expect(orphaned).toHaveLength(0);
  });
});
