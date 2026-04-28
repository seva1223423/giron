---
description: Sync Iron Gym memory files and verify all documented facts match the real codebase. Detects drift in model counts, test baselines, agent paths, and command counts. Copies newer files between repo memory/ and global Claude memory. Fixes stale facts automatically.
---

You are syncing Iron Gym memory and verifying docs accuracy.

**Repo memory:** `C:/Users/sevka/Desktop/1223/work/iron-gym/memory/`
**Global memory:** `C:/Users/sevka/.claude/projects/C--Users-sevka-Desktop-1223/memory/`

## 1 — Count Real Facts (run in parallel)

```bash
grep -c "^model " C:/Users/sevka/Desktop/1223/work/iron-gym/server/prisma/schema.prisma

ls C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/__tests__/*.test.ts | wc -l
ls C:/Users/sevka/Desktop/1223/work/iron-gym/src/__tests__/*.test.ts | wc -l

ls C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/agents/ | wc -l
ls C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/commands/ | wc -l

ls C:/Users/sevka/Desktop/1223/work/iron-gym/src/store/ | grep -v index.ts | wc -l
ls C:/Users/sevka/Desktop/1223/work/iron-gym/server/src/knowledge/ | wc -l
```

Expected: 37 models · 31 server suites (~960 tests) · 81 client suites (~2027 tests) · 25 knowledge modules · 5 commands

## 2 — Compare With CLAUDE.md

```bash
grep -n "модел\|model\|suites\|тестов\|stores\|knowledge" C:/Users/sevka/Desktop/1223/work/iron-gym/CLAUDE.md | head -15
```

Flag any number that differs from the real counts in Step 1.

## 3 — Check for Stale Paths

```bash
grep -rn "sevka/Projects/iron-gym" C:/Users/sevka/Desktop/1223/work/iron-gym/.claude/ 2>/dev/null
```

Old path `C:/Users/sevka/Projects/iron-gym` → must be `C:/Users/sevka/Desktop/1223/work/iron-gym`. Fix any hits in-place.

## 4 — Sync Memory Files

```bash
ls -la C:/Users/sevka/Desktop/1223/work/iron-gym/memory/ 2>/dev/null || echo "REPO_MEMORY_MISSING"
ls -la "C:/Users/sevka/.claude/projects/C--Users-sevka-Desktop-1223/memory/"
```

For each file present in one location but not the other — copy the existing one over.
For files present in both — compare content; copy the version with more recent facts.
`MEMORY.md` is an index only; update its entries to match what's actually present.

## 5 — Fix CLAUDE.md Drift

If any count from Step 2 differs from Step 1:
- Update `CLAUDE.md` to the real count
- Do NOT rephrase or reformat surrounding text — change the number only

## 6 — Report

```
SYNC REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Real facts:
  Prisma models:       X (CLAUDE.md says Y — MATCH / DRIFT)
  Server test suites:  X (CLAUDE.md says Y — MATCH / DRIFT)
  Client test suites:  X (CLAUDE.md says Y — MATCH / DRIFT)
  Knowledge modules:   X (expected 25 — MATCH / DRIFT)
  Agents:              X
  Commands:            X

Memory:
  Repo memory:         EXISTS / MISSING
  Files only in repo:  [list]
  Files only in global:[list]
  Drifted files:       [list or NONE]

Stale paths fixed:     [list or NONE]
CLAUDE.md corrections: [list or NONE]
```
