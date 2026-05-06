---
name: Iron Gym — production user state
description: No real users yet — only sevka (admin) uses the app. Affects what kinds of changes are safe.
type: project
originSessionId: round-237-session
---
**As of 2026-05-06 — only sevka uses the app, as ADMIN. Zero production users.**

User confirmed in chat: «сейчас никто приложением не пользуется кроме меня как админа».

What this changes:

- **Backwards compat is not a constraint.** Schema fields can be added/renamed/dropped freely via `prisma db push` (the project's standard — never `migrate dev/deploy`). No "legacy user" migration prompts needed. Recent example: round-237 added `consentAcceptedAt` / `consentVersion` to User; the "soft re-accept prompt for null-consent legacy users" follow-up I flagged is moot — there are no such users.
- **No soft rollout / feature flag dance.** New behavior can ship in one commit and be live for everyone (= sevka). Skip the «постепенная миграция» framing.
- **Destructive cleanups are fine.** Dropping a column, resetting a table, regenerating a master encryption key — all safe. The only data on Neon prod that matters is sevka's admin account.
- **Push gates that suppose multi-user impact (rate limits per cohort, retention crons targeting "new users", etc.) are still wired but won't trigger meaningfully** — useful as smoke checks, not production signal.

This changes the moment the app goes public (RuStore submission, Apple/Google review, etc.). When that happens, this memory should be flipped to the opposite — until then, default to "single-user, sevka-only" assumption.
