/**
 * Prompt-injection pattern detector (MEGA-AI-04).
 *
 * Complements inputSanitizer.ts — the sanitizer strips unicode tricks,
 * this module flags semantic attacks expressed in plain ASCII. Detection
 * is advisory: we DON'T block the request, we log + tag the message so
 * Sentry surfaces patterns and the AI moderator can review real user
 * traffic over time.
 *
 * Why not block?
 *  - Real users sometimes type "ignore previous instruction" verbatim
 *    about fitness coaching ("ignore what the last coach said…").
 *  - Silent server-side mitigations (req.userId enforcement on every
 *    tool, input sanitization, system-prompt hardening) are the actual
 *    defense. Pattern matching is a monitoring hook, not a wall.
 *
 * When a match fires: reportError with tag 'prompt-injection' so the
 * operator can review in Sentry + triage whether to enable harder
 * blocking per-pattern later.
 */

/** A single detection rule. Keeps rules introspectable (we can enumerate
 *  them in tests and docs) rather than burying them in a mega-regex. */
export interface InjectionPattern {
  /** Short slug used in logs + metric labels. */
  id: string;
  /** Matches a single line, case-insensitive. `/u` flag so unicode
   *  classes work. Patterns should be narrow enough that legitimate
   *  Russian/English fitness chat doesn't light them up routinely. */
  pattern: RegExp;
  /** Human description for docs. */
  description: string;
  /** Severity — controls whether we emit a warn log or an error report.
   *  'low' is noise-tolerant, 'high' shows up in Sentry. */
  severity: 'low' | 'high';
}

export const PATTERNS: InjectionPattern[] = [
  {
    id: 'ignore_previous',
    // Covers "ignore previous X", "ignore all previous X", "ignore the above X",
    // where X is a handful of synonyms optionally prefixed by a filler word
    // ("the foregoing", "my previous").
    pattern: /\bignore\s+(?:\w+\s+){0,2}(?:previous|prior|above|earlier|foregoing)\s+(?:\w+\s+){0,2}(?:instruction|directive|rule|context|prompt|message|command)/iu,
    description: 'Classic "ignore previous instructions" / "override"',
    severity: 'high',
  },
  {
    id: 'ignore_previous_ru',
    // \b doesn't match Cyrillic word boundaries in JS regex — use explicit
    // start-of-string / non-letter prefix instead.
    pattern: /(?:^|[^а-яё])игнорируй\s+(?:\S+\s+){0,2}(?:предыдущ|прошл|вышестоящ|ранее)/iu,
    description: 'Russian variant of "ignore previous"',
    severity: 'high',
  },
  {
    id: 'reveal_system_prompt',
    pattern: /\b(?:show|reveal|print|output|display|leak|repeat|give)\s+(?:me\s+|us\s+)?(?:your|the|that)\s+(?:\w+\s+){0,2}(?:system|initial|original|secret)\s*(?:\w+\s+){0,1}(?:prompt|instruction|rule|directive|message)/iu,
    description: 'Attempt to extract the system prompt',
    severity: 'high',
  },
  {
    id: 'reveal_system_prompt_ru',
    pattern: /(?:^|[^а-яё])(?:покажи|выведи|скажи|повтори|дай|раскрой)\s+(?:мне\s+|нам\s+)?(?:свой|твой|твоё|свои|ваш|ваше|ваши)?\s*(?:\S+\s+){0,2}(?:систем|начальн|исходн|секретн)\w*\s*(?:\S+\s+){0,1}(?:промпт|инструкц|правил|директив|сообщен)/iu,
    description: 'Russian system-prompt extraction',
    severity: 'high',
  },
  {
    id: 'jailbreak_persona',
    pattern: /\b(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be|roleplay\s+as|behave\s+as|simulate)\s+(?:an?\s+)?(?:DAN|developer\s+mode|admin|jailbro\w+|unrestricted|unfiltered|evil|uncensored|unlimited)/iu,
    description: 'Classic jailbreak persona switches (DAN, developer mode)',
    severity: 'high',
  },
  {
    id: 'admin_escape',
    pattern: /\b(?:admin|developer|debug|god|root|sudo)\s+(?:mode|access|privilege|command|override)/iu,
    description: 'Pretending to grant elevated privileges',
    severity: 'high',
  },
  {
    id: 'ignore_safety',
    pattern: /\b(?:disable|turn\s+off|bypass|circumvent|disregard|override)\s+(?:your\s+|all\s+|the\s+|any\s+)?(?:safety|guard|filter|moderation|restriction|censor)/iu,
    description: 'Asking to bypass safety guardrails',
    severity: 'high',
  },
  {
    id: 'forget_everything',
    pattern: /\b(forget|erase|clear|wipe|delete)\s+(everything|all|all\s+(your|the)\s+(instruction|rule|context|memory))/iu,
    description: '"Forget everything I told you" prefix',
    severity: 'high',
  },
  {
    id: 'other_user_reference',
    pattern: /\b(user|account|user_?id|id)\s*[:=]\s*(admin|root|[\w-]{10,})\b/iu,
    description: 'Claim to act on another user\'s account (e.g. user_id=admin-1)',
    severity: 'high',
  },
  {
    id: 'tool_hijack',
    pattern: /\b(call|invoke|execute|run)\s+(tool|function|method)\s*[:=]?\s*(delete|drop|remove)_/iu,
    description: 'Direct tool-call manipulation in prose',
    severity: 'high',
  },
  // ── Round 108: Russian-language variants of the high-severity patterns ──
  // Each pattern uses (?:^|[^а-яё]) as the start anchor since JS \b doesn't
  // fire between Cyrillic word chars. Trailing class loose to handle case
  // inflections without breaking under ё / ä / etc.
  {
    id: 'jailbreak_persona_ru',
    pattern: /(?:^|[^а-яё])(?:веди\s*себя\s*как|представь\s*что\s*ты|притворись|играй\s*роль|симулир|стань)\s+(?:DAN|админом?|разработчик|jailbro\w+|неограничен\w*|без\s*цензур\w*|без\s*фильтр\w*|злым)/iu,
    description: 'Russian jailbreak persona switch',
    severity: 'high',
  },
  {
    id: 'admin_escape_ru',
    pattern: /(?:^|[^а-яё])(?:админ(?:ский|ист)|разработчик(?:а|ий|ск)?|режим\s*разработчик|режим\s*админ|режим\s*бога|root\s*доступ)/iu,
    description: 'Russian privilege-escalation attempt',
    severity: 'high',
  },
  {
    id: 'ignore_safety_ru',
    pattern: /(?:^|[^а-яё])(?:отключи|обойди|сними|убери|игнорируй)\s+(?:свои?\s+|все\s+|все\s+твои\s+)?(?:фильтр|защит|ограничен|правил\s+безопасн|цензур|модерац)/iu,
    description: 'Russian "disable safety / bypass restrictions"',
    severity: 'high',
  },
  {
    id: 'forget_everything_ru',
    pattern: /(?:^|[^а-яё])(?:забудь|сотри|удали|очисти)\s+(?:всё|все|память|свои?\s+(?:инструкц|правил|контекст))/iu,
    description: 'Russian "forget everything I told you"',
    severity: 'high',
  },
  {
    id: 'tool_hijack_ru',
    pattern: /(?:^|[^а-яё])(?:вызови|запусти|выполни|invoke)\s+(?:функцию|инструмент|tool|method)\s*[:=]?\s*(?:delete|drop|remove)_/iu,
    description: 'Russian tool-call manipulation',
    severity: 'high',
  },
  // Lower-severity flags — worth logging for pattern analysis but noisy
  // enough that we don't want every hit in Sentry.
  {
    id: 'sql_keyword',
    pattern: /\b(SELECT\s+\*\s+FROM|DROP\s+TABLE|UNION\s+SELECT|';\s*--)/i,
    description: 'SQL injection shape (probably a tutorial, but logged)',
    severity: 'low',
  },
  {
    id: 'script_tag',
    pattern: /<script[\s>]/i,
    description: 'HTML script tag in a message',
    severity: 'low',
  },
];

export interface InjectionDetection {
  matched: boolean;
  patterns: Array<{ id: string; severity: 'low' | 'high' }>;
  /** Highest severity matched. `null` when matched === false. */
  highestSeverity: 'low' | 'high' | null;
}

/** Scan a user message against every known pattern. Runs all regexes —
 *  cheap, ~0.2ms for a 2k message, so no early-exit optimization
 *  required. */
export function detectInjection(message: string): InjectionDetection {
  if (typeof message !== 'string' || message.length === 0) {
    return { matched: false, patterns: [], highestSeverity: null };
  }
  const matched: Array<{ id: string; severity: 'low' | 'high' }> = [];
  for (const p of PATTERNS) {
    if (p.pattern.test(message)) {
      matched.push({ id: p.id, severity: p.severity });
    }
  }
  if (matched.length === 0) {
    return { matched: false, patterns: [], highestSeverity: null };
  }
  const highestSeverity: 'low' | 'high' = matched.some((m) => m.severity === 'high') ? 'high' : 'low';
  return { matched: true, patterns: matched, highestSeverity };
}
