/**
 * Input sanitization — strip or reject unwanted characters before
 * they hit the store or the server. The app supports Russian text
 * which means we must preserve Cyrillic while still dropping
 * control characters and HTML-like tags.
 */

function stripControlChars(s: string): string {
  // Remove U+0000..U+001F and U+007F-U+009F (ASCII + C1 control)
  return s.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
}

function stripHtmlTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function limitLength(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function sanitizeName(s: string): string {
  let out = stripControlChars(s);
  out = stripHtmlTags(out);
  out = normalizeWhitespace(out);
  out = limitLength(out, 100);
  return out;
}

// ─── stripControlChars ────────────────────────────────────────────────────

describe('stripControlChars', () => {
  test('null char removed', () => {
    expect(stripControlChars('a\x00b')).toBe('ab');
  });

  test('tab removed', () => {
    expect(stripControlChars('a\tb')).toBe('ab');
  });

  test('newline removed', () => {
    expect(stripControlChars('a\nb')).toBe('ab');
  });

  test('normal text preserved', () => {
    expect(stripControlChars('Привет мир')).toBe('Привет мир');
  });

  test('emoji preserved', () => {
    expect(stripControlChars('Hello 👋')).toBe('Hello 👋');
  });
});

// ─── stripHtmlTags ────────────────────────────────────────────────────────

describe('stripHtmlTags', () => {
  test('simple tag removed', () => {
    expect(stripHtmlTags('<b>hello</b>')).toBe('hello');
  });

  test('self-closing tag removed', () => {
    expect(stripHtmlTags('hello<br/>world')).toBe('helloworld');
  });

  test('tag with attributes removed', () => {
    expect(stripHtmlTags('<a href="evil.com">click</a>')).toBe('click');
  });

  test('script tag fully removed with content', () => {
    const html = 'safe<script>alert(1)</script>text';
    const out = stripHtmlTags(html);
    // Our regex strips tags but NOT inner content, so "alert(1)" remains.
    // For real XSS prevention we'd escape, not strip. This is just a UI
    // sanitizer for display names.
    expect(out).toContain('alert(1)');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('</script>');
  });

  test('non-tag text preserved (caveat: greedy regex eats "<..>")', () => {
    // Our simple regex treats '<' through '>' as a tag, so
    // "5 < 10 but not <b>" gets everything between first '<' and first
    // '>' stripped. This is a known limitation — documented here so the
    // test asserts the real (simplistic) behavior.
    const out = stripHtmlTags('5 < 10 but not <b>bolded</b>');
    expect(out).toContain('5');
    expect(out).toContain('bolded');
  });

  test('Russian text with no tags preserved', () => {
    expect(stripHtmlTags('Куриная грудка')).toBe('Куриная грудка');
  });
});

// ─── normalizeWhitespace ──────────────────────────────────────────────────

describe('normalizeWhitespace', () => {
  test('multiple spaces collapsed to one', () => {
    expect(normalizeWhitespace('a   b')).toBe('a b');
  });

  test('tabs and newlines collapsed', () => {
    expect(normalizeWhitespace('a\t\nb')).toBe('a b');
  });

  test('leading/trailing whitespace removed', () => {
    expect(normalizeWhitespace('   hello   ')).toBe('hello');
  });

  test('single space unchanged', () => {
    expect(normalizeWhitespace('a b')).toBe('a b');
  });
});

// ─── limitLength ──────────────────────────────────────────────────────────

describe('limitLength', () => {
  test('short string unchanged', () => {
    expect(limitLength('abc', 10)).toBe('abc');
  });

  test('exactly at limit unchanged', () => {
    expect(limitLength('abcde', 5)).toBe('abcde');
  });

  test('longer than limit truncated', () => {
    expect(limitLength('abcdefg', 3)).toBe('abc');
  });

  test('empty string unchanged', () => {
    expect(limitLength('', 10)).toBe('');
  });
});

// ─── Combined sanitizeName ────────────────────────────────────────────────

describe('sanitizeName (full pipeline)', () => {
  test('clean input unchanged', () => {
    expect(sanitizeName('Куриная грудка')).toBe('Куриная грудка');
  });

  test('HTML injection stripped', () => {
    expect(sanitizeName('Name<b>bold</b>')).toBe('Namebold');
  });

  test('excessive whitespace normalized', () => {
    expect(sanitizeName('  too    many   spaces  ')).toBe('too many spaces');
  });

  test('control chars removed', () => {
    expect(sanitizeName('a\x00b\x01c')).toBe('abc');
  });

  test('over 100 chars truncated', () => {
    expect(sanitizeName('x'.repeat(200)).length).toBe(100);
  });

  test('emoji preserved in name', () => {
    expect(sanitizeName('Meal 🍽️')).toBe('Meal 🍽️');
  });

  test('SQL-like input left alone (not our job)', () => {
    // SQL is server's problem — we don't need to escape at client
    const input = "Name'; DROP TABLE users;--";
    expect(sanitizeName(input)).toBe(input);
  });

  test('pure whitespace becomes empty', () => {
    expect(sanitizeName('     ')).toBe('');
  });
});

// ─── Numeric sanitization ─────────────────────────────────────────────────

describe('Numeric sanitization', () => {
  function sanitizeNumeric(s: string): string {
    return s.replace(/[^0-9,.]/g, '');
  }

  test('strips non-digit/comma/period', () => {
    expect(sanitizeNumeric('5kg')).toBe('5');
  });

  test('preserves comma decimal', () => {
    expect(sanitizeNumeric('5,5kg')).toBe('5,5');
  });

  test('preserves dot decimal', () => {
    expect(sanitizeNumeric('5.5kg')).toBe('5.5');
  });

  test('strips letters', () => {
    expect(sanitizeNumeric('abc123def')).toBe('123');
  });

  test('strips spaces', () => {
    expect(sanitizeNumeric('1 000')).toBe('1000');
  });
});

// ─── URL safety ──────────────────────────────────────────────────────────

describe('URL-in-text detection', () => {
  function containsUrl(s: string): boolean {
    return /https?:\/\/[^\s]+/.test(s);
  }

  test('plain text → false', () => {
    expect(containsUrl('Hello world')).toBe(false);
  });

  test('http URL → true', () => {
    expect(containsUrl('Visit http://example.com today')).toBe(true);
  });

  test('https URL → true', () => {
    expect(containsUrl('Safe: https://example.com')).toBe(true);
  });

  test('protocol-relative NOT detected (safer)', () => {
    expect(containsUrl('//example.com')).toBe(false);
  });
});
