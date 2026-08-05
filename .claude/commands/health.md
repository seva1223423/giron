---
description: Pre-deploy health check for Giron. Runs TypeScript, both test suites, security gates, env vars, schema drift, navigation wiring, and git state. Reports PASS/FAIL per section with a final READY / BLOCKED verdict. Run before every push to master.
---

You are running the Giron pre-deploy health check. Work each section sequentially. BLOCKER items halt the process — do not issue a READY verdict until all are resolved.

## 1 — TypeScript

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym && npx tsc --noEmit 2>&1 | tail -5
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npx tsc --noEmit 2>&1 | tail -5
```

**BLOCKER** if any errors. Also flag `console.log` in server routes:
```bash
grep -rn "console\." C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ --include="*.ts" | grep -v "^\s*//"
```

## 2 — Tests

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym/server && npm test -- --forceExit 2>&1 | tail -5
# Expected: 38 suites, ~1412 tests

cd C:/Users/sevka/Desktop/1223/work/iron-gym && npm test -- --forceExit 2>&1 | tail -5
# Expected: 81 suites, ~2030 tests
```

**BLOCKER** if any failures.

## 3 — Schema Drift

```bash
grep -c "^model " C:/Users/sevka/Desktop/1223/work/iron-gym/server/prisma/schema.prisma
# Expected: 38
cd C:/Users/sevka/Desktop/1223/work/iron-gym && git log --oneline -3 server/prisma/schema.prisma
```

**WARN** if schema changed since last deploy — confirm `npx prisma db push` ran against production `DATABASE_URL`.

## 4 — Security Gates

```bash
# Unprotected user-data routes (must all have authenticate)
grep -n "router\.\(get\|post\|put\|delete\|patch\)" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/workout.ts | grep -v "authenticate"

# CORS wildcard check
grep -n "origin.*\*" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/index.ts

# AI per-user rate limit still in place (30 req/min, .unref() prune)
grep -n "perUserAiBuckets\|\.unref()" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | head -5

# AI analytics context timing guard (warn if > 2000ms)
grep -n "_t0Context\|> 2000" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/routes/ai.ts | head -4
```

**BLOCKER** if unauthenticated user-data route found. **WARN** if CORS wildcard or rate limit missing.

## 5 — Health Endpoint

```bash
grep -n "health\|SELECT 1\|\$queryRaw\|dbLatencyMs" C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/index.ts | head -8
```

**WARN** if health endpoint has no DB ping or no `dbLatencyMs` in response.

## 6 — Navigation Wiring

```bash
grep "import.*Screen" C:/Users/sevka/Desktop/1223/work/iron-gym/src/navigation/AppNavigator.tsx | wc -l
grep "Screen name=" C:/Users/sevka/Desktop/1223/work/iron-gym/src/navigation/AppNavigator.tsx | wc -l
```

Counts must match. **BLOCKER** if imported screen has no `Screen name=` registration.

## 7 — Env Vars

```bash
grep -rhn "process\.env\." C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/ --include="*.ts" | grep -oP "process\.env\.\w+" | sort -u
```

Required: `DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, MISTRAL_API_KEY, DEEPSEEK_API_KEY, NODE_ENV, BCRYPT_ROUNDS, SMTP_USER, SMTP_PASS, SMS_RU_API_KEY, WEBHOOK_SECRET`

**BLOCKER** if a var used in auth/AI/DB path is absent.

## 8 — Git State

```bash
cd C:/Users/sevka/Desktop/1223/work/iron-gym && git status --short && git log --oneline origin/master..HEAD
```

**BLOCKER** if uncommitted changes in `server/` or `src/`.

## 9 — Docs Freshness

```bash
grep -n "суитов\|suites\|тестов\|tests" C:/Users/sevka/Desktop/1223/work/iron-gym/CLAUDE.md | head -4
ls C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/commands/ | wc -l
grep -rn "sevka/Projects/giron\|sevka/Projects/iron-gym" C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/ 2>/dev/null
```

**WARN** if test counts in CLAUDE.md differ from actual. **WARN** if stale path found.

---

```
HEALTH CHECK REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1 TypeScript:        [PASS / BLOCKER]
2 Tests:             [PASS / BLOCKER — server: X, client: Y]
3 Schema drift:      [PASS / WARN]
4 Security gates:    [PASS / BLOCKER / WARN]
5 Health endpoint:   [PASS / WARN]
6 Navigation:        [PASS / BLOCKER]
7 Env vars:          [PASS / BLOCKER]
8 Git state:         [PASS / BLOCKER]
9 Docs freshness:    [PASS / WARN]

VERDICT: READY TO DEPLOY / BLOCKED — fix [list] first

Warnings: [list]
```
