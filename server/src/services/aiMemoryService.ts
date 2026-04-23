/**
 * AI long-term memory service (MEGA-AI-05).
 *
 * Thin, testable wrapper around the AIMemory Prisma model. Every AI
 * interaction should be able to:
 *   1. Read the most relevant facts about a user before generating a response
 *      (getContextForPrompt).
 *   2. Promote observations from the conversation into durable facts
 *      (upsertFact / bumpConfidence).
 *   3. Forget stale facts without leaking user control (forget / pruneLowConfidence).
 *
 * Kept separate from the monolithic ai.ts so the memory mechanics can be
 * rewritten (vector-backed RAG, fact expiry windows) without touching
 * the chat flow.
 */

import { prisma } from '../db';
import { reportError } from '../utils/errorReporter';

/** Known fact categories. Plain strings on the Prisma side so the schema
 *  stays flexible; the enum here is advisory for callers + type-narrowing
 *  in tests. */
export type AIMemoryCategory =
  | 'preference'
  | 'habit'
  | 'injury'
  | 'allergy'
  | 'schedule'
  | 'personality'
  | 'goal'
  | 'equipment'
  | 'milestone';

export interface FactRecord {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
  updatedAt: Date;
}

export interface UpsertFactInput {
  userId: string;
  category: AIMemoryCategory | string;
  key: string;
  value: string;
  /** 0..1. When absent, a newly-inserted fact defaults to 0.5 (inferred);
   *  a repeated upsert of the same key bumps confidence by 0.2 (capped
   *  at 1.0) so facts the user confirms get promoted over time. */
  confidence?: number;
  /** 'stated' (user wrote it literally), 'inferred' (model deduced),
   *  'observed' (derived from logged actions). */
  source?: 'stated' | 'inferred' | 'observed';
}

const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;
const CONFIDENCE_BUMP = 0.2;

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  if (n < MIN_CONFIDENCE) return MIN_CONFIDENCE;
  if (n > MAX_CONFIDENCE) return MAX_CONFIDENCE;
  return n;
}

/**
 * Upsert a fact. Repeated upserts of the same (userId, key) bump
 * confidence — this is how "told us once → treat as preference; told us
 * three times → treat as strong signal" plays out without a client flag.
 *
 * If `confidence` is provided explicitly, it replaces the stored value
 * (caller knows best). Otherwise the existing confidence is bumped.
 */
export async function upsertFact(input: UpsertFactInput): Promise<FactRecord> {
  const source = input.source ?? 'inferred';
  const explicit = input.confidence !== undefined;

  const existing = await prisma.aIMemory.findUnique({
    where: { userId_key: { userId: input.userId, key: input.key } },
    select: { confidence: true },
  });

  const nextConfidence = explicit
    ? clamp(input.confidence!)
    : clamp((existing?.confidence ?? 0.5) + (existing ? CONFIDENCE_BUMP : 0));

  const row = await prisma.aIMemory.upsert({
    where: { userId_key: { userId: input.userId, key: input.key } },
    create: {
      userId: input.userId,
      category: input.category,
      key: input.key,
      value: input.value,
      confidence: nextConfidence,
      source,
    },
    update: {
      category: input.category,
      value: input.value,
      confidence: nextConfidence,
      source,
    },
    select: { id: true, category: true, key: true, value: true, confidence: true, source: true, updatedAt: true },
  });
  return row;
}

/**
 * Retrieve every fact for a user grouped by category. Used by the AI
 * context builder to inject a compact memory block into the system
 * prompt. `minConfidence` filters out noisy low-confidence inferences so
 * the prompt doesn't bloat with "maybe the user is left-handed".
 */
export async function getFactsByUser(
  userId: string,
  opts: { minConfidence?: number; limit?: number } = {},
): Promise<Record<string, FactRecord[]>> {
  const minConfidence = opts.minConfidence ?? 0.3;
  const limit = opts.limit ?? 100;
  try {
    const rows = await prisma.aIMemory.findMany({
      where: { userId, confidence: { gte: minConfidence } },
      orderBy: [{ confidence: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      select: { id: true, category: true, key: true, value: true, confidence: true, source: true, updatedAt: true },
    });
    return groupByCategory(rows);
  } catch (err) {
    reportError(err, { userId, tags: { origin: 'aiMemoryService.getFactsByUser' } });
    return {};
  }
}

function groupByCategory(rows: FactRecord[]): Record<string, FactRecord[]> {
  const out: Record<string, FactRecord[]> = {};
  for (const row of rows) {
    if (!out[row.category]) out[row.category] = [];
    out[row.category].push(row);
  }
  return out;
}

/**
 * Render the fact map as a compact multi-line string suitable for system-
 * prompt injection. Keeps the layout deterministic so caching upstream
 * works (same facts → same prompt → same cached response).
 *
 * Example output:
 *   [MEMORY]
 *   injury: knee_right = "pain on left squat, mild", conf=0.9
 *   preference: dislikes_burpees = "skip if possible", conf=0.7
 *   goal: target_bench_100 = "by July 2026", conf=0.8
 */
export function formatFactsForPrompt(facts: Record<string, FactRecord[]>, maxChars = 1200): string {
  const lines: string[] = ['[MEMORY]'];
  let used = lines[0].length + 1;
  for (const category of Object.keys(facts).sort()) {
    for (const row of facts[category]) {
      const line = `${category}: ${row.key} = "${row.value}", conf=${row.confidence.toFixed(2)}`;
      if (used + line.length + 1 > maxChars) {
        lines.push('… (truncated for length)');
        return lines.join('\n');
      }
      lines.push(line);
      used += line.length + 1;
    }
  }
  return lines.join('\n');
}

/**
 * Drop a single fact — used when the user says "forget that I said X".
 * Returns true if something was deleted, false otherwise.
 */
export async function forget(userId: string, key: string): Promise<boolean> {
  const { count } = await prisma.aIMemory.deleteMany({
    where: { userId, key },
  });
  return count > 0;
}

/**
 * House-cleaning: drop facts whose confidence stayed below threshold for
 * a while. Cheap enough to run in the existing cleanup interval
 * (server/src/index.ts setInterval every 6h).
 */
export async function pruneLowConfidence(
  userId: string,
  threshold = 0.25,
  olderThanMs = 30 * 24 * 60 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const { count } = await prisma.aIMemory.deleteMany({
    where: {
      userId,
      confidence: { lt: threshold },
      updatedAt: { lt: cutoff },
    },
  });
  return count;
}

/** Convenience: returns `null` if user has no facts yet, else the
 *  formatted memory block. Used by the prompt builder. */
export async function getContextForPrompt(userId: string): Promise<string | null> {
  const facts = await getFactsByUser(userId);
  if (Object.keys(facts).length === 0) return null;
  return formatFactsForPrompt(facts);
}
