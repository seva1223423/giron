---
description: Full Iron Gym system audit. Spawns 8 audit agents in parallel (security, performance, data-integrity, compliance, deployment, monitoring, tests, docs), deduplicates findings, produces a unified risk report sorted by business impact. Run before major releases or after big refactors. Optional argument: focus area ("security", "performance", etc.).
---

You are orchestrating a full Iron Gym audit. Argument: **$ARGUMENTS**

## Phase 1 — Baselines (run in parallel)

```bash
grep -c "^model " C:/Users/sevka/Desktop/1223/work/iron-gym/server/prisma/schema.prisma
ls C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/__tests__/*.test.ts | wc -l
ls C:/Users/sevka/Desktop/1223/work/iron-gym/src/__tests__/*.test.ts | wc -l
cd C:/Users/sevka/Desktop/1223/work/iron-gym && git status --short
```

Expected: 37 models · 31 server suites · 81 client suites (80 files in src/__tests__/ + 1 outside)

## Phase 2 — Spawn All Agents (parallel)

| Agent | Scope |
|-------|-------|
| `security` | Auth bypasses, IDOR, injection, rate limits, JWT claims |
| `performance` | N+1 queries, missing indexes, AI analytics context (2s budget), payload size |
| `data-integrity` | Orphaned records, cascade rules, type mismatches |
| `compliance` | 152-ФЗ, GDPR, AI disclaimer, YuKassa legality |
| `deployment` | Render config, env vars, schema drift, health check DB latency |
| `monitoring` | Logger coverage, unhandled errors, subscription limit enforcement |
| `tests` | Missing coverage, stale assertions, suite count drift vs CLAUDE.md |
| `docs` | CLAUDE.md drift: model count, route sizes, test baselines, stale paths |

Pass to each: project path `C:/Users/sevka/Desktop/1223/work/iron-gym`, focus `$ARGUMENTS`.

Wait for all 8 before Phase 3.

## Phase 3 — Unified Report

Deduplicate: if two agents flag the same issue, merge with "flagged by agent1 + agent2".
Escalate: cross-agent confirmation → raise severity one level.

```
AUDIT REPORT — Iron Gym
Date: [today]  Focus: [$ARGUMENTS or "comprehensive"]  Agents: 8/8

══ CRITICAL (fix before next deploy) ══════════════════════
1. [Issue] — [agents]
   File: [path:line]  Impact: [what breaks]  Fix: [action]

══ HIGH (current sprint) ═══════════════════════════════════

══ MEDIUM (next sprint) ════════════════════════════════════

══ CLEAN ════════════════════════════════════════════════════
- [item]: [why it's fine]

══ CROSS-AGENT PATTERNS ═════════════════════════════════════
- [issue]: flagged by [agent] + [agent]
```

**Merge rules:**
- security + compliance → admin audit log
- security + monitoring → per-user AI rate limit (30 req/min, `perUserAiBuckets`)
- performance + data-integrity → missing @@index
- tests + docs → suite count drift in CLAUDE.md
- deployment + compliance → privacy.html accessible in-app
