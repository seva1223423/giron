/**
 * Input sanitization for user-facing text that will be fed back to an LLM.
 *
 * Why this exists: the AI chat route accepts free-form user messages and
 * passes them (alongside system prompt + tool definitions) to Mistral /
 * YandexGPT / GigaChat. A bare-bones `z.string()` check blocks nothing —
 * an attacker can embed zero-width joiners, bidirectional overrides, and
 * control characters to attempt prompt injection, system-prompt
 * extraction, or role-escape ("you are now in admin mode").
 *
 * Approach: normalize to NFC (canonical unicode), strip everything that
 * has no reason to appear in a chat message, cap length. This is not a
 * complete defense (LLMs can be socially engineered in plain text) — it
 * is hygiene that closes the cheap attack surface.
 *
 * Stripped:
 *   U+0000..U+0008       — NUL + control chars before TAB
 *   U+000B..U+000C       — VT, FF (not whitespace we want)
 *   U+000E..U+001F       — remaining C0 controls
 *   U+007F..U+009F       — DEL + C1 controls
 *   U+200B..U+200F       — zero-width space, joiner, non-joiner, LRM, RLM
 *   U+202A..U+202E       — bidirectional overrides (jailbreak classic)
 *   U+2060..U+2064       — word joiner + inv. formats
 *   U+2066..U+2069       — directional isolates
 *   U+FEFF               — zero-width no-break space / BOM
 *
 * Kept: \n (U+000A), \r (U+000D), \t (U+0009) — legitimate whitespace,
 * users paste code/tables.
 */

const CONTROL_AND_FORMAT_RE = new RegExp(
  [
    '[\\u0000-\\u0008]',
    '[\\u000B-\\u000C]',
    '[\\u000E-\\u001F]',
    '[\\u007F-\\u009F]',
    '[\\u200B-\\u200F]',
    '[\\u202A-\\u202E]',
    '[\\u2060-\\u2064]',
    '[\\u2066-\\u2069]',
    '\\uFEFF',
  ].join('|'),
  'gu',
);

export interface SanitizeOptions {
  /** Hard cap on output length. Applied AFTER stripping, so attackers can't
   *  bypass by padding with control chars. Default 4000 to match Zod schema. */
  maxLength?: number;
  /** If true, collapse runs of 3+ identical chars to 3 (mitigates
   *  "aaaaaa" token-flooding). Default false — most legit messages are fine. */
  collapseRepeats?: boolean;
}

/**
 * Strip dangerous unicode + normalize NFC + truncate. Idempotent:
 * sanitizeInput(sanitizeInput(x)) === sanitizeInput(x).
 */
export function sanitizeInput(raw: string, opts: SanitizeOptions = {}): string {
  if (typeof raw !== 'string') return '';
  const maxLength = opts.maxLength ?? 4000;

  // NFC normalizes composed/decomposed forms so "é" (U+00E9) and
  // "e" + U+0301 (combining acute) compare equal. This also handles
  // exotic compatibility chars that render identical but hash differently.
  let s = raw.normalize('NFC');

  // Strip control + format chars. Multiple passes because the regex is
  // global but `replace` doesn't rescan — one call is enough with `/g`.
  s = s.replace(CONTROL_AND_FORMAT_RE, '');

  if (opts.collapseRepeats) {
    // Collapse runs of 3+ identical characters to exactly 3. Preserves
    // legit uses like "вoooot" while defusing "aaaaaaa..." token floods.
    s = s.replace(/(.)\1{3,}/gsu, '$1$1$1');
  }

  // Trim leading/trailing whitespace AFTER stripping — otherwise a message
  // full of zero-width chars would survive the trim as non-empty.
  s = s.trim();

  if (s.length > maxLength) {
    s = s.slice(0, maxLength);
  }

  return s;
}

/** Quick predicate for validation layers that don't want to mutate input. */
export function containsSuspiciousChars(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  CONTROL_AND_FORMAT_RE.lastIndex = 0; // reset /g state across calls
  return CONTROL_AND_FORMAT_RE.test(raw);
}
