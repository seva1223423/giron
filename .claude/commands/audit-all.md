---
description: Full-project Iron Gym audit. Spawns all specialist agents in parallel and compiles a unified risk report. Run before major releases or after large refactors. Argument: optional focus area (e.g. "focus on security and compliance").
---

You are running a comprehensive multi-agent audit of the Iron Gym project. Your job is to orchestrate all specialist agents, collect their findings, deduplicate, and produce a unified risk report.

Focus area (if specified): **$ARGUMENTS**

## Phase 1 — Gather Context

Before spawning agents, establish current baselines:

```bash
# Model count
grep -c "^model " C:/Users/sevka/Desktop/1223/work/iron-gym/server/prisma/schema.prisma

# Agent count (expected: 13)
ls C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/agents/ | wc -l

# Command count (expected: 13)
ls C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/commands/ | wc -l

# Server route sizes
wc -l C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/*.ts

# Server test suite count (expected: 19 suites, 554 tests)
ls C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/__tests__/*.test.ts | wc -l

# Client test suite count (expected: 29 suites, 555 tests)
ls C:/Users/sevka/Desktop/1223/work/iron-gym/src/__tests__/*.test.ts | wc -l

# Pending git changes
cd C:/Users/sevka/Desktop/1223/work/iron-gym && git status --short
```

## Phase 2 — Spawn Specialist Agents

Spawn ALL of the following agents in parallel. Each agent is in `.claude/agents/`:

| Agent | Focus |
|-------|-------|
| `performance` | N+1 queries, cache, pagination, payload size |
| `security` | Auth bypasses, injection, IDOR, rate limits |
| `data-integrity` | Orphaned records, cascade rules, type mismatches |
| `compliance` | 152-ФЗ, GDPR, AI disclaimer, payment legality |
| `deployment` | Render config, env vars, schema drift, health check |
| `monitoring` | Logs, error handling, rate limits, subscription enforcement |
| `tests` | Missing test coverage, stale assertions, test count drift |
| `docs` | Stale CLAUDE.md counts, broken file paths, out-of-date README |

Pass each agent this context:
- Project path: `C:/Users/sevka/Desktop/1223/work/iron-gym`
- Focus area: `$ARGUMENTS` (or "comprehensive" if not specified)
- Known model count: [from Phase 1]

Wait for all 8 agents to complete before proceeding.

## Phase 3 — Compile Unified Report

After all agents complete, deduplicate their findings:

1. **Remove duplicates**: If security.md and monitoring.md both flag "no per-user AI rate limit", merge into one entry, noting "flagged by 2 agents".
2. **Escalate cross-agent issues**: If performance finds missing index AND database agent confirms it, escalate to CRITICAL.
3. **Sort by business impact**: issues that could cause data loss, security breach, or legal penalty rank highest.

## Output Format

```
UNIFIED AUDIT REPORT — Iron Gym
Date: [today]
Focus: [argument or "comprehensive"]
Agents run: 8/8

══════════════════════════════════════════
CRITICAL (address before next deploy)
══════════════════════════════════════════
[number]. [Issue] — [agents that flagged it]
   File: [file:line]
   Impact: [what breaks or who is at risk]
   Fix: [specific action]

══════════════════════════════════════════
HIGH (fix in current sprint)
══════════════════════════════════════════
...

══════════════════════════════════════════
MEDIUM (schedule for next sprint)
══════════════════════════════════════════
...

══════════════════════════════════════════
ALREADY OPTIMIZED / NO ACTION NEEDED
══════════════════════════════════════════
- [item]: [why it's fine]

══════════════════════════════════════════
CROSS-AGENT PATTERNS
══════════════════════════════════════════
Issues flagged by multiple agents (higher confidence):
- [issue]: flagged by [agent1] + [agent2]
```

## Cross-Agent Coordination Rules

When compiling, apply these known coordination rules:
- `security` + `compliance`: both check admin actions — merge admin audit log findings
- `performance` + `database`: performance index gaps → database agent should add @@index
- `security` + `monitoring`: per-user rate limit is flagged by both — one entry, two agents
- `deployment` + `compliance`: privacy.html must be both deployed AND accessible in-app
- `data-integrity` + `database`: cascade rules — data-integrity finds gaps, database agent fixes
- `tests` + `docs`: test count drift → docs updates CLAUDE.md count, tests adds missing suite
- `docs` + `deployment`: stale version numbers or route sizes in CLAUDE.md → docs fixes, deployment confirms deploy
