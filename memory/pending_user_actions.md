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

- [ ] `cd server && npx prisma db push`
      — apply the new `@@index([workoutExerciseId, completed])` composite
      index on WorkoutSet. Added in commit 9c05b377, not yet in Neon.
      ALSO applies Routine.source/presetKey/iconName + RoutineSource enum
      + @@unique([userId,presetKey]) + @@index([userId,source]) from
      commit 5857ecf2 (2026-05-23). Routes don't read the new Routine
      fields yet, so still non-urgent — but a single push clears both.
      ALSO (audit 2026-05-29, H8) applies `User.weeklySummarySentDate String?`
      — the weekly-summary cron now gates each send on it via an atomic claim
      to stop double-sends across restarts. Until pushed, the Sunday cron throws
      (caught + logged → 0 emails) — harmless at 0 users, but push before launch
      so weekly summaries actually send.

- [ ] Render env: append `?pgbouncer=true&connection_limit=1&pool_timeout=20`
      to `DATABASE_URL`. Without it, the Neon free-tier pool can exhaust
      under cold-start. Documented in agent-skills/INSTALL_MANIFEST.md too.

## Git workflow

- [ ] Merge `fix/google-oauth-button-config` → `master` via GitHub PR.
      Direct push to master blocked by classifier. All audit commits live
      on that branch.

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
