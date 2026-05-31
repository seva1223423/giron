---
name: Pending user-side actions (audit R-2026-05-22 follow-up)
description: Things that require sevka's hand-on action — env, prisma db push, mirror skills, PR merges, API keys. Tracked across sessions so we don't lose context.
type: action-queue
originSessionId: 1093de44-105d-4679-9d10-555a6361a75f
---

# Pending — sevka does these by hand

These came out of the 2026-05-22 audit cycle (commits 016939be..1c14f883
on branch `fix/google-oauth-button-config`). They need user input or
prod-environment access — agent can't do them autonomously.

## Local machine / dev setup

- [ ] `cp -an /c/Users/sevka/agent-skills/. /c/Users/sevka/.claude/skills/`
      — mirror agent skills into Claude Code dir. Auto-mode classifier
      blocks the agent from doing this; one-time user run.

## Server / Neon database

- [x] **DONE 2026-05-30** `cd server && npx prisma db push --accept-data-loss`
      — applied to live Neon (eu-central). "Your database is now in sync",
      exit 0. Cleared: WorkoutSet `@@index([workoutExerciseId, completed])`
      (9c05b377), Routine source/presetKey/iconName + RoutineSource enum +
      `@@unique([userId,presetKey])` (5857ecf2, came in via the master merge),
      `User.weeklySummarySentDate` (H8), and the r240 health models/columns.
      Needed `--accept-data-loss` only for the new Routine unique constraint
      (safe at 0 users — no duplicate presetKey rows possible). Weekly-summary
      cron now works.

- [ ] Render env: append `?pgbouncer=true&connection_limit=1&pool_timeout=20`
      to `DATABASE_URL`. Without it, the Neon free-tier pool can exhaust
      under cold-start. Documented in agent-skills/INSTALL_MANIFEST.md too.

## Git workflow

- [~] **PARTIALLY DONE 2026-05-30** — merged `origin/master` INTO
      `fix/google-oauth-button-config` (not the other direction yet).
      The branch had diverged 2-way (44 commits ours: audit C1/C2/H1-H8,
      Home redesign, AI-chat parser, flashBus, Google-OAuth-on-RuStore;
      10 commits master: Workouts IA 3-tab refactor + CreateProgramScreen
      wizard, AI/Home/tracker "premium polish"). Resolved 18 conflicts
      "best of both" (merge commit 6296e0f, type-fix 6255ab47). HEAD now
      6255ab47, tsc clean both sides, 223 client tests green, pushed.
      STILL TODO: open the PR `fix/google-oauth-button-config` → `master`
      and merge it (direct push to master blocked by classifier). The
      branch is now a superset of master, so the PR will be clean.

## Android signing key — SECURITY (C1, still open)

- [ ] **Rotate the APK signing key + purge git history.** `android-keystore.jks`
      + `credentials.json` (plaintext pw `irongym2026`) were untracked in
      commit 3ddd4a4c but REMAIN in git history (introduced ab702d66). Anyone
      with repo/history access can sign a malicious APK. Founder-only:
      (1) generate a new upload/signing keystore in EAS managed credentials,
      (2) rotate the passwords (stop reusing irongym2026),
      (3) purge both files from history (git-filter-repo / BFG) + force-push.

## Broken plugin hook (cosmetic noise)

- [ ] **Disable the `cockroachdb` plugin in Cowork plugin settings.** It
      registers a PostToolUse hook (`check-sql-files.py`) that fails on every
      Write/Edit with "No such file" (the bundled `python3` App-Execution-Alias
      can't open the script path). Harmless — it's a CockroachDB linter that
      exits 0; all edits apply fine — but it spams the tool output. Can't be
      killed locally: the hook command is baked into the running process at
      session start, and the plugin is re-extracted from the cloud Cowork
      manifest each session (it's NOT in ~/.claude.json or ~/.claude/settings.json).
      Fix = `/plugin` → disable `cockroachdb`, or remove it from the
      knowledge-work-plugins marketplace selection in Cowork. You don't use
      CockroachDB (giron is on Postgres/Neon), so it's safe to drop entirely.

## AI provider swaps (when keys ready)

- [ ] **Mistral → DeepSeek** (cheaper, 3× lower cost per 1M tokens):
      Set env `AI_BASE_URL=https://api.deepseek.com`, `AI_MODEL=deepseek-chat`,
      `AI_API_KEY=<deepseek-key>`. No code change — `mistralAdapter` is
      universal OpenAI-compatible.

- [ ] **Activate Yandex GPT** (already wired in router):
      Set env `YANDEX_API_KEY=<api-key>` + `YANDEX_FOLDER_ID=<folder-id>`.
      Optionally `AI_PRIMARY_PROVIDER=yandex AI_FALLBACK_CHAIN=mistral`.

- [ ] **GigaChat decision**: explicitly OUT — sevka said never use in prod
      (2026-05-22). Adapter removed in commit bb4d95ef. If ever needed,
      `git revert bb4d95ef` restores it.

## Prisma migrations (when first real user nears)

- [ ] Switch from `prisma db push` to `prisma migrate dev`. Baseline
      migration file is ready in `server/prisma/migrations/0_baseline/`.
      Follow the 6-step recipe in `server/prisma/migrations/README.md`.
      **Critical:** must happen BEFORE the first real user, otherwise
      schema-change rollbacks become "data loss without recovery".

## Skipped intentionally (not "pending" — explicit decisions)

- **GigaChat adapter** — sevka said no. Will NOT re-add unless asked.
- **Multi-region Neon** — single-region Frankfurt stays for now.
- **lastActiveAt split into UserActivity table** — defer until >1K active users.
- **AutoSave $executeRaw refactor** — single-user product, no lock contention.
