---
name: Giron re-study delta (2026-05-26)
description: Current-state snapshot after deep re-study of 307 commits since 2026-05-01. Supersedes stale counts in project_deep_dive.md. New subsystems, branch fork, dead code, pending hand-actions.
type: project
originSessionId: file-search-then-restudy
---

# Giron — re-study delta (2026-05-26)

Studied 307 commits (2026-05-01 `85a0beb` → 2026-05-29 `6c9c170f`) via 7 parallel subsystem agents. Tree health at study time: **tsc green both sides, working tree clean.** This file is the DELTA — `project_deep_dive.md` stays valid for unchanged architecture, but its counts/ai.ts-size are stale; trust this file where they conflict.

## CRITICAL state fact — branch/master FORK (two-way, unmerged)
- Working branch: **`fix/google-oauth-button-config`** @ `6c9c170f` (NOT master). Pushed/clean.
- Merge-base with origin/master: `60db49b9`.
- This branch: **+44 commits / 325 files** (audit C1/C2/H1-H8, Home redesign V3/V5, AI refactors, AI-chat parser, food-scan rounds, security hardening).
- origin/master: **+10 commits / 77 files** (Workouts IA refactor `5857ecf2` + followups `3131b6c5`: 3-tab restructure, `CreateProgramScreen` wizard, per-day persist; `ExerciseLibraryScreen`; autofix slash-cmd added then reverted).
- **29 overlapping files = real merge-conflict surface**: schema.prisma, AppNavigator, CLAUDE.md, all `screens/ai/components/*`, `screens/home/components/*` (AICoachCard/QuickActionsGrid/RingStatsCard/WeekPlanStrip), all `screens/tracker/components/*`, `screens/workouts/*` (WorkoutsScreen, ProgramsTab, QuickStartTab, UserProgramsList, ConfigureStep, ExerciseSelectStep, CreateExerciseModal).
- **Neither branch is a superset.** Merging needs real conflict resolution, esp. Workouts (this branch = cosmetic polish of OLD 2-tab IA; master = full 3-tab + wizard). Not a simple PR.

## Updated counts (supersede project_deep_dive.md)
- `server/src/routes/ai.ts`: **~16,438 logical lines** (19,776 raw, CRLF). The old "85k/87k" was BEFORE the knowledge extraction.
- Knowledge prose moved OUT to **`server/src/ai/knowledge-topics/` (20 files, ~62k lines)**; `ai/knowledgeHelpers.ts` is just a barrel re-exporting them. ai.ts imports ~1790 names.
- Extracted `/chat` helpers live in **`server/src/ai/`** (NOT `routes/ai/`): `chatContext.ts` (16-query Promise.all), `chatFallback.ts` (2-tier degrade), `chatPersist.ts`. Plus pre-existing `contextEngine.ts`, `contextTools.ts` (6 ctx tools), `memoryExtractor.ts`, `navigationWhitelist.ts`, `weightProjection.ts`.
- Prisma: **40 models, 6 enums** (new enum `DeviceSource`; new models `ConnectedDevice`, `HealthSample`).
- AI tools: **42** in `AI_TOOLS` + 6 context tools. ALL 39 param-taking tools now Zod-validated (was `as`-cast). Post-write-verify pattern on ~all log_*/delete_* tools (read row back, throw on mismatch).
- Achievements: **64 definitions** (not 58/61 — CLAUDE.md stale). 6 categories: strength 29, workout 11, exploration 10, streak 7, recovery 6, nutrition 2.
- Tests: client ~120 files (~5475 tests per docs), server ~100 files. Maestro E2E in `.maestro/` (8 flows) — NOT in CI. CI = server-only (tsc+jest+build, path-filtered `server/**`).
- App: version **1.5.0**, versionCode **20**. Legacy `irongym` scheme now DROPPED (was kept through 1.4.x for OTA, removed in `50e0e9a2`). compileSdk 36 / minSdk 26 / targetSdk 35.

## NEW subsystems since 2026-05-01
1. **Health / smartwatch (r240)** — `src/services/health/` (adapter pattern: HealthConnect Android / HealthKit iOS / BLE direct / noop). Server `routes/health.ts` (sync/summary/steps/devices). 3 AI tools: get_health_summary, get_sleep_breakdown, get_readiness_score. `useHealthStore`. Recovery achievements. **Server solid + tested (36 tests). Android works.** GAPS: iOS adapter built but UI-gated-off ("Скоро" banner); GPS/hrZones/per-session vo2Max columns exist but adapters NEVER populate them (so summary VO2max effectively always null); BLE has connect-timeout but NO reconnect/backoff, dropped samples on upload fail.
2. **AI chat local command parser** (`src/screens/ai/parseChatCommand.ts` 615 lines + `useAIChatCommands.ts`) — 37 command types, Russian numerals/word-stems/fuzzy `approxMatch`, composite ("X и Y"), name-resolution (program/exercise/recipe by spoken name). Runs BEFORE server call → instant, no AI quota. Live panel "Текущая тренировка" under chat header (read-only). NOTE: a rival widget-parser (`aiCommandParser` + 3 Widgets) lives on abandoned branch `feat/ai-chat-command-widgets` — NOT live, ignore it.
3. **Food scanner evolution** (rounds 191-254) — 3 paths (barcode/photo/text) with cross-fallback. RU-resilient barcode (ru.openfoodfacts mirror, EAN-13 checksum, GTIN gating, 24h negative cache, Atwater kcal-from-macros, plausibility reject). Vision = Mistral (NOT Ollama despite localAI.ts), max_tokens 3072, parse-fail + low-confidence retry, scan refunds. Portion calibration (typicalPortions median+IQR, user habitual portions + mealType into prompt). Client AI cache scoped by userId+ (server: +mealType). `FoodScannerScreen` = **3254 lines** (audit M2: split it).
4. **Security/storage hardening** — `encryptedStorage.ts` (AES-256-GCM, per-install key in Keychain, version byte reserved for rotation-not-yet-built), `throttledStorage.ts` (2s window, only workoutStore uses it, flush-on-logout = H7). Step-up reauth (password+TOTP+replay) inline on ~6 user endpoints + admin `requireAdminStepUp`. Logger PII scrub (email/phone/JWT). Atomic CAS claims in retentionService (all cohorts + weekly summary). Subscription optimistic locking (`expectedUpdatedAt` → 409). Refresh-token rotation + reuse detection.
5. **Home redesign V3/V5** (this branch) — HomeHeader V5, AICoachCard, RingStatsCard, WeekPlanStrip V3 (4 states), QuickActionsGrid V3, FirstWorkoutBanner V10. Pure derivations in `utils/homeDerivations.ts`.
6. **LLM router + Yandex adapter** (`services/llm/`) — built + tested but NOT wired to /chat (ai.ts still imports `deepseekAI` directly = Mistral-only). Yandex adapter has NO tool-calling + NO streaming (trap if anyone flips AI_PRIMARY_PROVIDER=yandex). GigaChat added then reverted (`bb4d95ef`).
7. **Telegram logger** (`services/telegramLogger.ts`) — Sentry-free live alerts. errorReporter: if SENTRY_DSN → Sentry (PII-scrubbed); else → Telegram (needs TELEGRAM_BOT_TOKEN+CHAT_ID env). If neither env set → console only (invisible in prod). Rationale: Sentry edge-blocks RU IPs.

## "Built but NOT wired" pattern (recurring smell — verify before relying)
- **DiffCard + Pill + flashBus** (client, ~280 LOC + 2 test files) — fully built/tested, rendered NOWHERE. Direction-A "gold flash on change" + "было→стало in chat" UX never integrated.
- **knowledge-blocks PoC** (`server/src/ai/knowledge-blocks/`) — 8/1422 ported, NOT wired (registry referenced only by its own test), originals NOT removed = duplicate copies. Topic-split already solved the real pain → PoC is dead liability.
- **LLM router / Yandex** — see #6 above.
- **Home smart-states** — AICoachCard rest-mode + chips, RingStatsCard deltas, FirstWorkoutBanner snooze: built but HomeScreen call-sites don't pass them. HomeHeader unread-dot hardcoded.
- **iOS HealthKit** — adapter written, UI disabled.
- **AchievementsTab** omits the `recovery` category in its render loop (6 achievements compute + can toast but don't list).

## Render host discrepancy (verify — probably just stale docs)
- **Real shipping config:** `iron-gym-swoe.onrender.com` (in `eas.json` ALL profiles + `src/services/api.ts` BASE_URL fallback). This is what every APK talks to → this is the LIVE server.
- **Docs say** `giron-api.onrender.com` (CLAUDE.md, README, DEPLOY.md, reference_credentials.md, agent files). Likely a stale/aspirational rename that never happened. App works → `iron-gym-swoe` is real. DEPLOY.md curl examples hit the wrong host. Fix = correct the docs (or actually rename the Render service).

## Pending hand-actions (updated — see also pending_user_actions.md)
- **`prisma db push`** to Neon: `User.weeklySummarySentDate` (H8, very recent) — until pushed the Sunday weekly-summary cron THROWS (caught→0 emails, silent). Also WorkoutSet composite index, Routine metadata (targetGoal/difficulty/estDuration — these DO exist on this branch). r240 health tables (`ConnectedDevice`/`HealthSample` + cardio/sleep watch cols) — NOT in pending list → probably already pushed (else health = 500s). NOTE: `Routine.source/presetKey/iconName + RoutineSource enum` from pending_user_actions DO NOT exist on this branch (they're on master's `5857ecf2`).
- **C1 signing key** — `git rm --cached` done (`3ddd4a4c`), but `android-keystore.jks` + `credentials.json` (plaintext pw `irongym2026`) STILL IN GIT HISTORY (`ab702d66`). Real fix pending: rotate keystore in EAS + purge history (BFG/filter-repo) + force-push. Founder-only.
- Merge the branch fork (see top).

## Audit doc
`docs/audit/AUDIT_2026-05-29.md` — Opus 4.8, 2 CRIT + 8 HIGH (all fixed on this branch) + 11 MED + 12 LOW (deferred). MED/LOW worth revisiting: M1 (chat handler still ~7100 lines), M2 (FoodScannerScreen split), webhook idempotency (M-level — endDate recomputed on replay → double-credit), TOTP replay TOCTOU (add @@unique), seed.ts FK on re-run.
