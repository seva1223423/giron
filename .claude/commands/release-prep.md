---
description: Release readiness checklist for Iron Gym. Run before pushing to master for a production release. Checks TypeScript, tests, schema drift, env vars, navigation wiring, and critical security gates.
---

You are running the Iron Gym pre-release checklist. Work through each section sequentially and report PASS/FAIL for each item. Stop at BLOCKER items and do not proceed to deployment steps until they are resolved.

## Section 1 — Code Quality

```bash
# TypeScript — client
cd C:/Users/sevka/Desktop/1223/work/iron-gym && npx tsc --noEmit 2>&1

# TypeScript — server
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npx tsc --noEmit 2>&1
```

**BLOCKER if:** any TypeScript errors.

```bash
# Check for console.log in server routes (use logger instead)
grep -rn "console\.log\|console\.error" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ --include="*.ts"
```

**WARN if:** any console.log found.

## Section 2 — Tests

```bash
# Server integration tests (19 suites, ~554 tests)
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npm test -- --forceExit 2>&1 | tail -8

# Client store unit tests (29 suites, ~555 tests)
cd C:/Users/sevka/Desktop/1223/work/iron-gym && npm test -- --forceExit 2>&1 | tail -8
# Expected: 29 suites, ~555 tests
```

**BLOCKER if:** any test failures in either suite.

## Section 3 — Schema Drift Check

```bash
# Count models in schema
grep -c "^model " C:/Users/sevka/Desktop/1223/work/iron-gym/server/prisma/schema.prisma

# Compare with CLAUDE.md
grep -n "модел\|models" C:/Users/sevka/Desktop/1223/work/iron-gym/CLAUDE.md | head -5

# Check if schema was edited since last known db push
cd C:/Users/sevka/Desktop/1223/work/iron-gym && git log --oneline -3 server/prisma/schema.prisma
```

**WARN if:** schema changed in recent commits — confirm `npx prisma db push` was run with production DATABASE_URL.

## Section 4 — Navigation Wiring

```bash
# All imported screens must be registered in AppNavigator
grep "import.*Screen" C:/Users/sevka/Desktop/1223/work/iron-gym/src/navigation/AppNavigator.tsx | wc -l
grep "Screen name=" C:/Users/sevka/Desktop/1223/work/iron-gym/src/navigation/AppNavigator.tsx | wc -l

# Check for screens referenced in navigation.navigate() but not registered
grep -rn "navigation\.navigate(" C:/Users/sevka/Desktop/1223/work/iron-gym/src/screens/ --include="*.tsx" | grep -oP "'[A-Z][A-Za-z]+'" | sort -u
```

**BLOCKER if:** any `navigation.navigate('ScreenName')` targets a screen not registered in navigator.

## Section 5 — Security Gates

```bash
# All user-data routes must have authenticate middleware
grep -n "router\.\(get\|post\|put\|delete\|patch\)" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/workout.ts | grep -v "authenticate" | grep -v "^.*//.*router"

# AI rate limit check (subscription limiter before Mistral call)
grep -n "limit\|subscription\|premium" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | head -15

# Check CORS is not using wildcard *
grep -n "origin.*\*\|cors.*\*" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/index.ts
```

**BLOCKER if:** public route accessing user data without `authenticate`. **WARN if:** CORS uses `*`.

## Section 6 — Env Var Audit

```bash
# All process.env usages in server (should all be set in Render)
grep -rhn "process\.env\." C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/ --include="*.ts" | grep -oP "process\.env\.\w+" | sort -u
```

List every env var and verify it's set in production Render dashboard. Common required vars:
`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY`, `NODE_ENV`, `BCRYPT_ROUNDS`, `SMTP_USER`, `SMTP_PASS`, `SMS_RU_API_KEY`, `EXPO_PUSH_TOKEN`

**BLOCKER if:** any `process.env.X` used in a critical path (auth, AI, DB) that isn't in the known env list.

## Section 7 — Pending Changes

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym && git status && git log --oneline origin/master..HEAD
```

**BLOCKER if:** uncommitted changes in server/ or src/ (unstaged work).
**INFO:** list commits to be deployed.

## Section 8 — Health Endpoint

```bash
# Verify health endpoint exists and does DB ping
grep -n "health\|/ping\|SELECT 1\|queryRaw" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/index.ts | head -10
```

**WARN if:** health endpoint only returns `{ status: 'ok' }` without DB ping.

## Section 9 — Agent Documentation Freshness

```bash
# Check test baselines in tests.md match what's documented in CLAUDE.md
grep -n "суитов\|suites\|тестов\|tests" C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/agents/tests.md | head -5
grep -n "суитов\|suites\|тестов\|tests" C:/Users/sevka/Desktop/1223/work/iron-gym/CLAUDE.md | head -5

# Check command count
ls C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/commands/ | wc -l

# Check agent count
ls C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/agents/ | wc -l

# Check for stale Old path in any agent file
grep -rn "sevka/Projects/iron-gym" C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/ 2>/dev/null
```

**WARN if:** test count in `tests.md` differs from `CLAUDE.md` — both must be updated together.
**WARN if:** stale path found — the correct path is `C:/Users/sevka/Desktop/1223/work/iron-gym`.

## Final Report

```
RELEASE READINESS REPORT
━━━━━━━━━━━━━━━━━━━━━━━━
Section 1 — TypeScript:      [PASS / BLOCKER: X errors]
Section 2 — Tests:           [PASS / BLOCKER: X server failures, Y client failures]
Section 3 — Schema drift:    [PASS / WARN: schema changed, db push needed]
Section 4 — Navigation:      [PASS / BLOCKER: missing screens]
Section 5 — Security:        [PASS / BLOCKER: unprotected routes]
Section 6 — Env vars:        [PASS / BLOCKER: missing vars]
Section 7 — Git state:       [PASS / BLOCKER: uncommitted changes]
Section 8 — Health check:    [PASS / WARN: shallow health check]
Section 9 — Agent docs:      [PASS / WARN: test count drift, stale path]

VERDICT: [READY TO DEPLOY / BLOCKED — fix X items first]

Blocking items:
[list]

Warnings (non-blocking):
[list]
```
