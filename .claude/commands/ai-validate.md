---
description: Validate the Iron Gym AI system after changes. Checks intent classification coverage, tool schema correctness, knowledge module count, cache config, system prompt disclaimer, fallback chain, and rate limit enforcement. Run after any change to ai.ts or knowledge/ files.
---

You are validating the Iron Gym AI system integrity after recent changes. Check all AI subsystems for correctness and report issues.

## AI System Overview

- Main route: `server/src/routes/ai.ts`
- Knowledge modules: `server/src/knowledge/` (should be 25 modules)
- Services: `server/src/services/deepseekAI.ts`, `server/src/services/localAI.ts`
- Intents: data_logging, program_creation, workout_modify, technique_question, nutrition_query, analytics_query, greeting, complaint, motivation, general
- Tools: create_program, create_workout, log_meal, log_water, delete_meal, update_profile, log_body_weight, modify_workout, set_weekly_plan, update_nutrition_targets (10 tools)
- Cache: LRU 4h TTL, max 200 entries

## Validation Steps

### 1. Intent Coverage

```bash
grep -n "data_logging\|program_creation\|workout_modify\|technique_question\|nutrition_query\|analytics_query\|greeting\|complaint\|motivation\|general" server/src/routes/ai.ts | grep -v "^\s*//" | wc -l
```

Verify all 10 intents are handled. Flag any intent referenced in classification but missing from the handler switch/if chain.

### 2. Tool Schema Correctness

```bash
grep -n '"name":\|"description":\|"parameters":\|"required":' server/src/routes/ai.ts | head -60
```

For each tool function:
- `name` matches the function handler
- `parameters` schema matches what the handler expects
- `required` array includes all non-optional params
- Handler validates input before DB write (Zod or manual check)

### 3. Knowledge Module Count

```bash
ls server/src/knowledge/ | wc -l
ls server/src/knowledge/
```

Should be 25 modules. Flag if count changed (added/removed without updating CLAUDE.md).

```bash
grep -n "knowledge\|modules\|25\b" server/src/routes/ai.ts | head -10
```

Verify TF-IDF selection loop references the correct module array.

### 4. Cache Configuration

```bash
grep -n "LRU\|lru\|cache\|TTL\|maxSize\|max.*200\|4.*hour\|14400" server/src/routes/ai.ts | head -15
```

Verify:
- Cache max entries: 200
- TTL: 4 hours (14400 seconds)
- Cache key does NOT include sensitive data (must be deterministic from message + userId)
- Cache is invalidated correctly when user data changes

### 5. System Prompt Disclaimer

```bash
grep -in "disclaimer\|не является\|не медицин\|consult.*doctor\|врач\|медицинск" server/src/routes/ai.ts server/src/knowledge/ -r | head -10
```

Verify a medical disclaimer exists in the system prompt. Flag if absent.

### 6. Fallback Chain

```bash
grep -n "mistral\|deepseek\|ollama\|fallback\|catch\|retry" server/src/services/deepseekAI.ts | head -30
```

Verify:
1. Mistral is tried first
2. On failure → DeepSeek (if `DEEPSEEK_API_KEY` set)
3. On failure → Ollama (if available)
4. Each fallback attempt is logged
5. If all fail → returns error to client (no silent hang)

### 7. Rate Limit & Subscription Check

```bash
grep -n "10\|daily\|limit\|subscription\|premium\|free.*tier" server/src/routes/ai.ts | grep -v "^\s*//" | head -20
```

Verify:
- Daily message limit (10 for free) checked BEFORE Mistral API call
- Check reads from DB (not client-provided count)
- Premium users correctly bypass the limit
- `FoodScanLog` count check in `server/src/routes/nutrition.ts` (5 scans/day)

### 8. buildAnalyticsContext Performance Gate

```bash
grep -n "buildAnalyticsContext\|Promise\.all\|parallel" server/src/routes/ai.ts | head -20
```

Known issue: ~180 parallel DB queries per analytics context build. Verify:
- Only called when intent = `analytics_query` (not on every message)
- Has a timeout or partial result fallback

### 9. Report

```
AI VALIDATION RESULT:
- ai.ts last modified: [check git or file stats]
- Intent coverage: X/10 intents handled [list missing]
- Tool count: X tools defined [list if not 10]
- Knowledge modules: X/25 [list changes]
- Cache: [configured correctly / issues]
- Disclaimer: [PRESENT / MISSING — file:line]
- Fallback chain: [complete / gaps at file:line]
- Rate limit: [enforced before API call / MISSING]
- Analytics context: [guarded / called on all intents — RISK]
- Overall status: PASS / FAIL
- Issues to fix: [specific changes with file:line]
```
