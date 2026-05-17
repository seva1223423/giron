---
name: GitHub account & main repo
description: User's GitHub account (seva1223423) and the single private repo where active work happens
type: reference
originSessionId: 4b576bd1-39bf-4a31-a62b-691aee14f1a5
---
GitHub account: `seva1223423` (authenticated via `gh`, token has repo/workflow/gist/read:org scopes).

Main (only) repo: `seva1223423/giron` — private, default branch `master`, TypeScript.

It's a React Native + Expo (client at repo root) + Express/Prisma (in `server/`) fitness app with a heavy AI layer. The repo has its own `CLAUDE.md` and `.claude/memory/` — read those first when the user says "my repo" or asks about project specifics; they are authoritative over this reference note.

CI: `.github/workflows/server-tests.yml` runs on pushes that touch `server/**` — does `tsc --noEmit` + jest. Failing tsc blocks the whole pipeline.
