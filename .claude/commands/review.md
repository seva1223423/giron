---
description: Pre-commit security and quality review for Giron. Checks all staged and unstaged changes for auth bypasses, missing Zod validation, IDOR gaps, unhandled errors, and client store rollback issues. Run before every commit to master.
---

You are performing a pre-commit review of all Giron changes.

## 1 — Get the Diff

```bash
cd C:/Users/sevka/Desktop/1223/work/giron
git diff HEAD
git diff --cached
```

## 2 — Server Checks (for each changed `.ts` in `server/src/`)

**Auth & Authorization**
- Every route touching user data has `authenticate` middleware (from `server/src/middleware/auth.ts`)
- Mutations on user-owned records use `where: { id, userId }` — not just `id` (IDOR)
- Admin routes use `requireAdmin` — never manual `req.userRole === 'admin'` check
- No hardcoded `JWT_SECRET` — must be `process.env.JWT_SECRET`

**Input Validation**
- Every POST/PUT body validated with Zod before Prisma
- Passwords have `.max(128)` (bcrypt DoS: >72 chars truncated, >1000 = CPU spike)
- No raw user input interpolated into `$queryRaw`
- File upload routes have size + MIME type limits

**AI Route Specifics** (if `ai.ts` changed)
- `perUserAiBuckets` check is AFTER daily quota and BEFORE SSE headers — ensures 429 is JSON
- Bucket keyed on `req.userId` from JWT, never from request body
- `setInterval` prune uses `.unref()` (prevents Jest hang + memory leak)
- New tool handlers do NOT accept `userId` as parameter — always `req.userId`
- Analytics context timing guard (`_t0ContextPrimary`, `logger.warn` if > 2000ms)

**Prisma Safety**
- Multi-model writes use `$transaction`
- New models have `onDelete: Cascade` on userId relation + `@@index([userId])`

**Error Handling**
- All async handlers have `try/catch`
- `catch` returns `res.status(X).json({ error: '...' })` — no silent swallows
- No stack traces in 500 responses (always `'Ошибка сервера'`)

## 3 — Client Checks (for changed `.ts/.tsx` in `src/`)

- No `eval()` or `dangerouslySetInnerHTML`
- No tokens/passwords logged to console
- AsyncStorage keys match `clearUserData` reset in the same store
- Optimistic updates have `setState(previous)` rollback in `catch`
- New screens use the Icon component (`src/components/Icon.tsx`) — not raw unicode glyphs
- Colors reference `colors` from `useThemeStore()` — not hardcoded hex
- Premium actions gate through `isPremiumActive()` → `setShowPaywall(true)` before API call

## 4 — Report

```
REVIEW RESULT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Files changed: [list]

BLOCKER (fix before commit):
  [issue — file:line]

HIGH (fix before merge to master):
  [issue — file:line]

MEDIUM (tech debt, non-blocking):
  [issue — file:line]

Clean: [files with no issues]
```

If nothing found, say so clearly. Do not invent issues.
