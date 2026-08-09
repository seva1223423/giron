/**
 * Numeric honesty guard (observability only).
 *
 * The prompt orders the model to cite user numbers only from КЛЮЧЕВЫЕ ЧИСЛА,
 * but nothing ever measured whether it obeys. This module compares the
 * numbers a reply CLAIMS about the user's data against the canonical block
 * that was actually sent, and reports the ones that appear from nowhere.
 *
 * It deliberately does NOT block or rewrite the reply: a false accusation
 * that mutates output is worse than a hallucinated calorie in a log line.
 * Mismatches feed a daily counter + warn log; if the counter stays at zero
 * for weeks the discipline holds, if it climbs we know exactly where to look.
 *
 * Claim detection is intentionally narrow to keep the signal clean:
 *  - only sentences that talk about the person's own state (ты/у тебя/сегодня/
 *    съел/весишь …) — generic advice numbers («ешь 150-165 г белка») are not
 *    claims about data;
 *  - only units that map to canonical facts (ккал, г белка, кг, шаги);
 *  - a claim inside a numeric RANGE («1800-2000 ккал») is skipped — ranges are
 *    recommendations, not data readouts.
 */

export interface NumericClaim {
  value: number;
  unit: 'kcal' | 'protein_g' | 'kg' | 'steps';
  raw: string;
  sentence: string;
}

const USER_STATE_MARKER =
  /(^|[^а-яёa-z])(ты|тебя|тебе|твой|твоя|твои|у тебя|сегодня|вчера|съел|съела|выпил|выпила|прошёл|прошла|прошел|весишь|записал|залогировал)([^а-яёa-z]|$)/i;

const CLAIM_PATTERNS: Array<{ unit: NumericClaim['unit']; re: RegExp }> = [
  { unit: 'kcal', re: /(\d+(?:[.,]\d+)?)\s*ккал/gi },
  { unit: 'protein_g', re: /(\d+(?:[.,]\d+)?)\s*г(?:рамм[а-я]*)?\s+белк/gi },
  { unit: 'kg', re: /(\d+(?:[.,]\d+)?)\s*кг/gi },
  { unit: 'steps', re: /(\d[\d\s]*)\s*шаг/gi },
];

const toNumber = (s: string): number => parseFloat(s.replace(/\s+/g, '').replace(',', '.'));

/** Numbers a reply claims about the user's own state. */
export function extractClaims(reply: string): NumericClaim[] {
  const claims: NumericClaim[] = [];
  const sentences = reply.split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    if (!USER_STATE_MARKER.test(sentence)) continue;
    for (const { unit, re } of CLAIM_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(sentence)) !== null) {
        // Range («1800-2000 ккал», «80–90 кг») → recommendation, not a readout.
        const before = sentence.slice(Math.max(0, m.index - 1), m.index);
        if (before === '-' || before === '–' || before === '—') continue;
        const after = sentence.slice(m.index + m[1].length, m.index + m[1].length + 1);
        if (after === '-' || after === '–' || after === '—') continue;
        const value = toNumber(m[1]);
        if (!Number.isFinite(value) || value <= 0) continue;
        claims.push({ value, unit, raw: m[0].trim(), sentence: sentence.trim().slice(0, 120) });
      }
    }
  }
  return claims;
}

/** Every number present in the КЛЮЧЕВЫЕ ЧИСЛА block of the sent context. */
export function extractCanonicalNumbers(contextText: string): number[] {
  const start = contextText.indexOf('КЛЮЧЕВЫЕ ЧИСЛА');
  if (start === -1) return [];
  const rest = contextText.slice(start);
  const end = rest.indexOf('\n## ');
  const block = end === -1 ? rest : rest.slice(0, end);
  const numbers: number[] = [];
  const re = /(\d+(?:[.,]\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const v = toNumber(m[1]);
    if (Number.isFinite(v)) numbers.push(v);
  }
  return numbers;
}

/** A claim is covered when some canonical number sits within tolerance. */
function covered(value: number, canon: number[]): boolean {
  return canon.some((c) => Math.abs(c - value) <= Math.max(1, c * 0.02));
}

/**
 * Claims about user data that have no source in the canonical block.
 * Empty when the block itself is absent — no canon means no judgement.
 */
export function findNumericMismatches(reply: string, contextText: string): NumericClaim[] {
  const canon = extractCanonicalNumbers(contextText);
  if (canon.length === 0) return [];
  return extractClaims(reply).filter((c) => !covered(c.value, canon));
}
