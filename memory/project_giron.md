---
name: Giron project facts
description: Stack, layout, critical facts for giron — and where the authoritative per-session context lives
type: project
originSessionId: 4b576bd1-39bf-4a31-a62b-691aee14f1a5
---
**Authoritative sources inside the repo — read these first each session:**
- `CLAUDE.md` — current stack/layout snapshot
- `memory/project_status.md` — what's done / in progress / ideas (may lag; trust CLAUDE.md when they conflict). Located at `<repo>/memory/`, NOT `<repo>/.claude/memory/` — see feedback rule about sensitive paths.
- `memory/feedback_rules.md` — behavioral rules (mirrored from my global memory)
- `.claude/agents/*.md` — 13 specialized sub-agents: ai-coach, backend, compliance, data-integrity, database, deployment, docs, feature, frontend, monitoring, performance, security, tests

Use those agents when the task fits their scope — they carry repo-specific navigation maps (e.g. ai-coach knows where to grep inside the 82k-line `ai.ts`).

**Stack (as of 2026-04):**
- Client: React Native 0.81 + Expo SDK 54, Zustand 5, React Navigation 7, axios. TypeScript strict.
- Server: Express 4 + TS, Prisma 6 → PostgreSQL, Zod, JWT (7d access + 30d refresh), bcryptjs, helmet, express-rate-limit.
- AI: Mistral (primary) → DeepSeek → Ollama `qwen2.5:14b` fallback. `llama3.2-vision` for food photos.

**Hard rules — easy to get wrong:**

*Database:* use `prisma db push`, **never** `prisma migrate dev/deploy/reset`. The `prisma:migrate` npm script exists but should not be run per the `database` sub-agent definition. (The older `project_status.md` note to run `prisma migrate dev` for TrainerClient is obsolete.)

*Prisma client:* import the singleton from `server/src/db.ts` — never `new PrismaClient()` in a route.

*Logging:* use `logger` from `server/src/utils/logger.ts`, never `console.*`.

*Validation:* every server route uses Zod on input.

*Brand colors* (authoritative = CLAUDE.md, not README):
- Primary `#8B5CF6` (purple) / dark `#A78BFA`
- Macros: calories `#FF3B30`, protein `#8B5CF6`, fat `#FF9F0A`, carbs `#34C759`
- Backgrounds: light `#F5F5F7`, dark `#0A0A0F`
(README.md still lists old orange `#FF6B35` — stale.)

**CI:** `.github/workflows/server-tests.yml` runs on pushes touching `server/**` — installs, `prisma generate`, `tsc --noEmit`, `jest`. A tsc error blocks the whole pipeline. Verify tsc locally before pushing server changes.

**Local working copy** for this session: `C:\Users\sevka\Desktop\1223\work\giron`. The user's own working directory is `C:\Users\sevka\Desktop\1223` — empty aside from this clone. Some agent files still reference the old `C:/Users/sevka/Projects/giron/` path — that's stale, don't chase it.

**Known stale / contradictory docs to watch for:**
- README.md says 17 Prisma models, orange brand — both superseded by CLAUDE.md (37 models, purple).
- project_status.md says knowledge blocks go up to 1680; feedback_rules.md says 1690 — grep the actual `getBlock` count before adding.
- project_status.md lists "забыли пароль" as unfinished, but `ForgotPasswordScreen.tsx` and `ResetPasswordScreen.tsx` exist in `src/screens/auth/` — verify state before claiming it's a todo.

**Exercise video pipeline (2026-04):**

Videos and posters are **bundled in the main repo** (`assets/exercise-videos/`), not in a separate media repo. The `seva1223423/giron-media` repo is obsolete.

- `src/data/exerciseVideoAssets.ts` → `EXERCISE_VIDEO_ASSETS` — canonical map of 32 verified exercise IDs to bundled video + poster paths.
- `src/config/store.ts` — `VERIFIED_INLINE_VIDEO_IDS` set. For IDs not in the set, the client falls through to YouTube/Rutube fallback.
- `scripts/fetch-exercise-videos-wikimedia.mjs` / `scripts/normalize-exercise-videos.mjs` — pipeline for fetching + normalizing Wikimedia Commons clips to 854×480 H.264 ~300KB, bundled into APK (+9MB total).
- 32 exercises whitelisted; 39 remaining fall through to YouTube without a 404.
