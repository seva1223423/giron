---
description: Sync Iron Gym memory files between the project repo memory/ directory and the Claude global memory at ~/.claude/projects/C--Users-sevka-Desktop-1223/memory/. Detects drift, reports differences, then copies newer files to the stale location.
---

You are syncing Iron Gym memory files between two locations.

**Location A (repo):** `C:\Users\sevka\Desktop\1223\work\iron-gym\memory\` (if it exists)
**Location B (global):** `C:\Users\sevka\.claude\projects\C--Users-sevka-Desktop-1223\memory\`

## Steps

### 1. List both locations

```bash
ls -la "C:\Users\sevka\Desktop\1223\work\iron-gym\memory\" 2>/dev/null || echo "REPO_MEMORY_MISSING"
ls -la "C:\Users\sevka\.claude\projects\C--Users-sevka-Desktop-1223\memory\"
```

### 2. Compare MEMORY.md indexes

Read both `MEMORY.md` files and diff the entries. Flag:
- Entries in global but not in repo (added via Claude Code session, not committed)
- Entries in repo but not in global (added via git, not reflected in session memory)
- Entries present in both but with different content (drift)

### 3. Check for stale facts

Read each memory file and verify key claims are still true:

**Check project path:**
```bash
ls "C:\Users\sevka\Desktop\1223\work\iron-gym\server\prisma\schema.prisma" && echo "PATH_OK"
```

**Check model count in CLAUDE.md vs schema:**
```bash
grep -c "^model " "C:\Users\sevka\Desktop\1223\work\iron-gym\server\prisma\schema.prisma"
grep "模型\|models\|модел" "C:\Users\sevka\Desktop\1223\work\iron-gym\CLAUDE.md" | head -5
```

**Check agent count:**
```bash
ls "C:\Users\sevka\Desktop\1223\work\iron-gym\.claude\agents\" | wc -l
```

**Check test counts (client suites and server suites):**
```bash
# Client test suites (expected: 25 suites, ~448 tests)
ls "C:\Users\sevka\Desktop\1223\work\iron-gym\src\__tests__\" | wc -l

# Server test suites (expected: 16 suites, ~339 tests)
ls "C:\Users\sevka\Desktop\1223\work\iron-gym\server\src\__tests__\" | grep "\.test\.ts$" | wc -l
```

Compare counts against what CLAUDE.md and `.claude/agents/tests.md` document. Flag if actual file count differs from documented suite count.

**Check ALL agents for stale paths:**
```bash
grep -rn "Projects/iron-gym\|sevka/Projects" "C:\Users\sevka\Desktop\1223\work\iron-gym\.claude\agents\" 2>/dev/null
```

Flag: `C:/Users/sevka/Projects/iron-gym` is the OLD path — should be `C:/Users/sevka/Desktop/1223/work/iron-gym`. If any agent file contains the old path, fix it.

### 4. Report drift

```
MEMORY SYNC REPORT:
- Repo memory: [EXISTS / MISSING]
- Global memory entries: X files
- Files only in global: [list]
- Files only in repo: [list]
- Drifted files (same name, different content): [list]
- Stale facts detected:
    - Project path: [CORRECT / STALE — current value: X, actual: Y]
    - Model count in CLAUDE.md: [X in CLAUDE.md, Y in schema.prisma — DRIFT / MATCH]
    - Agent count: [X agents found]
    - docs.md stale path: [FOUND at line X / CLEAN]
    - Client test suites: [X actual vs Y in CLAUDE.md — MATCH / DRIFT]
    - Server test suites: [X actual vs Y in CLAUDE.md — MATCH / DRIFT]
```

### 5. Fix stale facts

If stale facts found in files:

**Fix docs.md agent old path:**
Replace `C:/Users/sevka/Projects/iron-gym` with `C:/Users/sevka/Desktop/1223/work/iron-gym` in `.claude/agents/docs.md`.

**Fix CLAUDE.md model count:**
Read `server/prisma/schema.prisma`, count `^model ` lines, update CLAUDE.md to match.

**Sync memory files:**
Copy any missing or newer files from global to repo memory (or vice versa, whichever is newer based on content).

After fixing, report what was changed.
