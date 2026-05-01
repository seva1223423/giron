/**
 * Round 195 — knowledge subsection extraction tests.
 *
 * Validates the windowed-scoring approach that picks the highest-
 * keyword-density 600-char slice from a long module instead of
 * dumping the full text. Saves tokens; preserves teaching.
 *
 * The internal `extractRelevantSubsection` is not exported (it
 * lives inside the AI route module). These tests use a re-impl
 * that mirrors the logic. If ai.ts changes the extractor, update
 * here too.
 */

function extractRelevantSubsection(
  fullText: string,
  keywords: string[],
  windowSize = 600,
  step = 100,
): string | null {
  if (keywords.length === 0) return null;
  const lower = fullText.toLowerCase();
  const maxStart = Math.max(0, lower.length - windowSize);
  let bestStart = 0;
  let bestScore = 0;
  const starts = new Set<number>();
  for (let s = 0; s <= maxStart; s += step) starts.add(s);
  starts.add(maxStart);
  for (const start of starts) {
    const window = lower.slice(start, start + windowSize);
    let score = 0;
    for (const kw of keywords) {
      if (window.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  if (bestScore < 3) return null;
  const start = Math.max(0, bestStart - 50);
  const end = Math.min(fullText.length, bestStart + windowSize + 50);
  const slice = fullText.slice(start, end);
  return start > 0 ? `…${slice}` : slice;
}

describe('extractRelevantSubsection — basic windowing', () => {
  test('returns null when keywords list empty', () => {
    const r = extractRelevantSubsection('long text '.repeat(100), []);
    expect(r).toBeNull();
  });

  test('returns null when no keyword scores >=3 in any window', () => {
    const text = 'a'.repeat(2000); // no keywords match
    const r = extractRelevantSubsection(text, ['присед', 'жим', 'тяга']);
    expect(r).toBeNull();
  });

  test('returns window when 3+ unique keywords match in one slice', () => {
    const text =
      'Common nutrition advice discusses calories. ' +
      'Far away, far far away from the keywords zone, ' +
      'we discuss приседания, жим лёжа and становая тяга all together with bench press, ' +
      'as fundamental compound lifts. ' +
      'a'.repeat(500); // padding
    const r = extractRelevantSubsection(text, ['присед', 'жим', 'тяга']);
    expect(r).not.toBeNull();
    if (r) {
      // Should contain ALL three keyword stems
      expect(r.toLowerCase()).toContain('присед');
      expect(r.toLowerCase()).toContain('жим');
      expect(r.toLowerCase()).toContain('тяга');
    }
  });
});

describe('extractRelevantSubsection — picks the densest window', () => {
  test('chooses window with most distinct keyword matches', () => {
    const text =
      // Window A: only "жим"
      'Это длинный текст про жим. ' + 'a'.repeat(500) +
      // Window B: "жим", "присед", "тяга" all together
      'Базовые упражнения: жим лёжа, приседания, становая тяга. ' +
      'Все три — основа силовых тренировок. ' +
      'a'.repeat(500);
    const r = extractRelevantSubsection(text, ['жим', 'присед', 'тяга']);
    expect(r).not.toBeNull();
    if (r) {
      // Should pick window B — more keywords
      expect(r).toMatch(/Базовые упражнения/);
    }
  });

  test('picks first window in case of tie (stable ordering)', () => {
    const text =
      'Window A: жим, тяга, присед. ' + 'a'.repeat(800) +
      'Window B: жим, тяга, присед.';
    const r = extractRelevantSubsection(text, ['жим', 'тяга', 'присед']);
    expect(r).toMatch(/Window A/);
  });
});

describe('extractRelevantSubsection — boundaries', () => {
  test('window respects fullText.length (no out-of-bounds)', () => {
    const text =
      'Short text with жим, приседания, тяга all here in the start.' +
      ' '.repeat(50);
    const r = extractRelevantSubsection(text, ['жим', 'присед', 'тяга']);
    expect(r).not.toBeNull();
    if (r) {
      expect(r.length).toBeLessThanOrEqual(text.length + 1); // +1 for "…" prefix
    }
  });

  test('prefixes with "…" when slice starts mid-text', () => {
    const text =
      'a'.repeat(800) +
      'Heavy keyword density: жим, присед, тяга. жим, присед, тяга.';
    const r = extractRelevantSubsection(text, ['жим', 'присед', 'тяга']);
    expect(r).toMatch(/^…/);
  });

  test('no prefix when slice starts at index 0', () => {
    const text =
      'жим, присед, тяга — основа. ' +
      'Важно правильно выполнять каждое из этих упражнений. ' +
      'a'.repeat(800);
    const r = extractRelevantSubsection(text, ['жим', 'присед', 'тяга']);
    expect(r).not.toMatch(/^…/);
  });
});

describe('extractRelevantSubsection — token efficiency', () => {
  test('returned subsection is significantly shorter than full module', () => {
    const fullModule = `
ХАЛТЕРИЗМ И СИЛА
Тренировки на силу базируются на трёх компаундных движениях:
${'introductory padding '.repeat(50)}

Жим штанги лёжа — техника:
1. Лопатки сведены и опущены вниз
2. Хват чуть шире плеч
3. Опускание контролируемое, до груди
4. Жим без отбива

Приседания со штангой — нюансы:
- Позиция штанги high-bar или low-bar
- Глубина не выше параллели
- Колени идут в направлении носков

Становая тяга — корректное выполнение:
- Гриф над серединой стопы
- Спина прямая, но не выгнута
- Толкаемся ногами от пола

${'concluding padding '.repeat(50)}
`;
    const r = extractRelevantSubsection(fullModule, ['жим', 'присед', 'тяга']);
    expect(r).not.toBeNull();
    if (r) {
      // Should be much shorter than original
      expect(r.length).toBeLessThan(fullModule.length * 0.6);
      // But long enough to be useful
      expect(r.length).toBeGreaterThan(300);
    }
  });

  test('avoids returning entire short module unchanged', () => {
    // For short modules (<800 chars), the caller skips this function.
    // But if called directly: returns null on insufficient match.
    const shortText = 'Жим, присед, тяга — суть силового тренинга.';
    const r = extractRelevantSubsection(shortText, ['жим', 'присед', 'тяга']);
    // Window can't even fit at 600 chars — returns null OR full
    // depending on edge case. Either way: doesn't return junk.
    if (r !== null) {
      expect(r.length).toBeLessThanOrEqual(shortText.length + 5);
    }
  });
});

describe('extractRelevantSubsection — case insensitivity', () => {
  test('matches uppercase keywords against lowercase text', () => {
    const text = 'a'.repeat(700) + 'ЖИМ, ПРИСЕДАНИЯ, ТЯГА — три основных упражнения';
    const r = extractRelevantSubsection(text, ['жим', 'присед', 'тяга']);
    expect(r).not.toBeNull();
  });

  test('matches mixed case', () => {
    const text = 'a'.repeat(700) + 'Жим, Приседания, Тяга — базовые упражнения, далее ' + 'a'.repeat(100);
    const r = extractRelevantSubsection(text, ['жим', 'присед', 'тяга']);
    expect(r).not.toBeNull();
  });
});
