---
name: Giron working rules — enforced by user
description: Hard rules for how to work on iron-gym: git, memory, code style, refactor pattern, knowledge blocks
type: feedback
originSessionId: 4b576bd1-39bf-4a31-a62b-691aee14f1a5
---
Rules below come from `iron-gym/.claude/memory/feedback_rules.md` — the user enforces them actively.

**Git: commit + push in one step, always. The user has flagged this rule TWICE — treat as hard.**
Why: user reads GitHub between sessions; unpushed local commits once sat for hours and he was upset. The second reminder came as "не забывай что все изменения надо писать в гит хабе" — meaning the expectation is not just "push eventually" but "every meaningful change lands on GitHub before you reply to the user."
How to apply:
- Use `git commit -m "..." && git push origin master` as a single chained command. Default branch is `master`.
- Never leave the session with uncommitted changes in a repo-tracked file. If you edited something, commit it or explicitly ask whether to keep it local.
- Before ending a reply that mentions "я изменил/добавил/пофиксил", run `git status` — staged/unstaged changes mean the work isn't actually done from the user's perspective.
- Documentation edits (CLAUDE.md, memory/, privacy.html, terms.html, legal checklists) count the same as code — push them.

**Memory lives in two places — keep them in sync.**
Why: user lost memory once when VS Code switched working directories; duplicating into the repo is the backup.
1. `~/.claude/projects/C--Users-sevka-Desktop-1223/memory/` (this global memory)
2. `<repo>/memory/` (repo-local mirror — **NOT** `<repo>/.claude/memory/`)
`MEMORY.md` in each is only an index — never stores content.

**Repo mirror path is `memory/`, not `.claude/memory/`.** Claude Code hard-codes every file under `<repo>/.claude/` as a sensitive path and prompts for approval on every edit — there's no settings escape hatch. The memory files were moved out of `.claude/` in 2026-04 specifically to stop those prompts. Do not move them back.

**Response style: minimal, no recap.**
Say "сделал" + next step, one sentence. Don't summarize what the diff already shows.

**Never ask "shall I start?" / "start the package?" / "begin with X?"**
Once the user has said "делай сам / делай максимально / дальше", presenting a plan and asking for go-ahead IS asking for permission — which violates the autonomy directive. Execute the plan, push, report. If a step is genuinely irreversible (dropping a DB, force-push to main, deleting someone else's branch), then ask. A batch of code edits is not irreversible.

**Also NOT allowed — soft "if you want" prompts.** Lines like "если захотите — запустите `gh repo delete …`" or "можете удалить самостоятельно" are asking for permission with extra steps. If the right move is obvious from what the user asked for (e.g. "all in one repo" → the separate repo is dead → delete it), do it and report the result. Same for: "можно добавить X", "стоит ли сделать Y?", "хотите ли N?", "если нужно — скажите". Strip ALL of those. Just do the thing, commit, say "сделал".

Why: user flagged this pattern twice — first as "ты всё равно спрашиваешь разрешения как это убрать?", then again as "снова ты просишь разрешения как это исправить?" — so it's a persistent failure mode, not a one-off.

**Refactor pattern (validated on ProgressScreen/HomeScreen/ActiveWorkoutScreen):**
1. Read the whole file first.
2. Split JSX into logical components.
3. Components with local state/useMemo own their state internally.
4. Components that need stores read stores directly — don't prop-drill.
5. Orchestrator keeps only shared computed state, handlers, composition.
6. New components go in `{screen-folder}/components/` with an `index.ts` re-export.
7. Commit + push immediately after each refactor pass.

**AI knowledge blocks in `server/src/routes/ai.ts`:**
Name functions `getBlock{NNNN}` with 4-digit zero-padded number. Add in batches of 20. Sequence matters for TF-IDF — no gaps. Last block per repo memory: **1690**; next starts at **1691**. Verify before writing — the number may have advanced.

**Don'ts:**
- Don't add types/docstrings/comments to code that didn't ask for them.
- Don't refactor code adjacent to the task — stay scoped.
- Don't change logic during a pure structural refactor.
