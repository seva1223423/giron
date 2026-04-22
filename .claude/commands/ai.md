---
description: Validate the Iron Gym AI subsystem after any change to ai.ts or knowledge/ files. Checks intent coverage, tool count, rate limits, analytics context timing, knowledge modules, cache config, disclaimer, and fallback chain.
---

You are validating the Iron Gym AI subsystem.

**Files:** `server/src/routes/ai.ts` · `server/src/knowledge/` (25 modules) · `server/src/services/deepseekAI.ts`

## 1 — Intent Coverage

```bash
grep -n "data_logging\|program_creation\|workout_modify\|technique_question\|nutrition_query\|analytics_query\|greeting\|complaint\|motivation\|general" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | grep -v "^\s*//" | wc -l
```

All 10 intents must appear in the handler chain. Flag any referenced in classification but absent from the switch/if.

## 2 — Tool Count & Schema

```bash
grep -c "type: 'function'" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts
```

Expected: **26 tools**. For each tool verify: `name` matches its `executeTool` case, `required[]` covers non-optional params, handler validates input before DB write, no `userId` in params (must use `req.userId`).

## 3 — Per-User Rate Limit

```bash
grep -n "perUserAiBuckets\|PER_USER_AI_LIMIT\|PER_USER_AI_WINDOW\|\.unref()" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | head -10
```

Verify:
- `Map<string, { count: number; resetAt: number }>` at module level
- Limit: 30 req/min, keyed on `req.userId` (not body)
- Check is AFTER daily quota, BEFORE SSE headers (so 429 returns JSON)
- Prune interval uses `.unref()`

```bash
grep -n "BUG-AI-003\|perUser" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/__tests__/ai_security.test.ts
```

Regression tests for BUG-AI-003 must exist.

## 4 — Analytics Context Timing

```bash
grep -n "_t0ContextPrimary\|_t0ContextSecondary\|> 2000\|primaryContextMs\|secondaryContextMs" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | head -8
```

Two `Promise.all` blocks (~180 total queries). Must have:
- `_t0ContextPrimary` / `_t0ContextSecondary` timestamps before each block
- `logger.warn` if either block > 2000ms with `userId` for correlation

## 5 — Knowledge Modules

```bash
ls C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/knowledge/ | wc -l
```

Expected: **25 modules**. Flag if count changed without CLAUDE.md update.

## 6 — Daily Limit & Subscription Gate

```bash
grep -n "daily\|10\|ChatMessage.*count\|quota\|free.*tier\|FoodScanLog" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/nutrition.ts | grep -v "^\s*//" | head -15
```

- AI: 10 msg/day for free users — checked from DB (not client), before API call
- Nutrition: 5 food scans/day — checked in `nutrition.ts`
- Premium users bypass both limits via `getSubStatus`

## 7 — Cache & Disclaimer

```bash
grep -n "TTL\|max.*200\|14400\|4.*hour" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | head -5
grep -in "не является\|не медицин\|disclaimer" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/knowledge/ -r | head -5
```

Cache: max 200 entries, TTL 4h. Disclaimer: medical disclaimer must be in system prompt.

## 8 — Fallback Chain

```bash
grep -n "mistral\|deepseek\|ollama\|fallback\|catch\|retry" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/services/deepseekAI.ts | head -15
```

Order: Mistral → DeepSeek (if `DEEPSEEK_API_KEY`) → Ollama. Each step logged. All fail → error to client (no silent hang).

---

```
AI VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Intent coverage:        X/10 [missing: list]
Tool count:             X (expected 26)
Per-user rate limit:    PRESENT / MISSING — keyed on: [JWT userId / body (WRONG)]
                        .unref(): YES / NO
Analytics timing guard: PRESENT / MISSING — threshold: [Xms]
Knowledge modules:      X/25
Daily AI limit:         ENFORCED / MISSING
Cache:                  200 max, 4h TTL — CORRECT / DRIFT
Disclaimer:             PRESENT / MISSING
Fallback chain:         complete / gap at [file:line]

Status: PASS / FAIL
Issues: [specific file:line for each]
```
