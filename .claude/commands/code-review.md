---
description: Security + quality review of uncommitted changes in Iron Gym. Checks for injection vulnerabilities, auth bypasses, missing Zod validation, unhandled errors, and Prisma cascade risks. Run before every commit to master.
---

You are performing a pre-commit security and quality review of the Iron Gym codebase. Review all staged and unstaged changes, then report findings grouped by severity.

## Steps

1. **Get the diff:**
```bash
git diff HEAD
git diff --cached
```

2. **For each changed server file, check:**

### Auth & Authorization
- Every route that accesses user data has `authenticate` middleware (the function is `authenticate` in `server/src/middleware/auth.ts`, not `authenticateToken`)
- Routes that modify another user's data check `item.userId !== req.userId` before update/delete
- Admin routes use `requireAdmin` middleware from `server/src/middleware/auth.ts` — do NOT check `req.user.role === 'admin'` manually; the middleware sets `req.userRole` (note: `userRole`, not `user.role`)
- No JWT secret hardcoded (must be `process.env.JWT_SECRET`)

### Input Validation
- Every POST/PUT route body goes through a Zod schema before Prisma
- `req.params.id` is cast as `string`, never used as `string | string[]`
- File uploads via Multer have size + MIME type limits
- No raw user input interpolated into `$queryRaw` strings

### Prisma Safety
- Mutations on user-owned resources use `where: { id, userId }` (not just `id`) — prevents IDOR
- Multi-step writes use `$transaction`
- New models have `onDelete: Cascade` on user-owned relations

### Error Handling
- Async handlers have try/catch
- catch blocks return a proper `res.status(X).json({ error: '...' })` — not silent swallow
- No stack traces leaked to client in error responses

### Client Security
- No `eval()` or `dangerouslySetInnerHTML`
- No sensitive data (tokens, passwords) logged to console
- AsyncStorage keys consistent with `clearUserData` in store

3. **Report format:**
```
REVIEW RESULT:
- Files changed: [list]
- BLOCKER issues (must fix before commit): [issue + file:line]
- HIGH issues (fix before merge to master): [issue + file:line]
- MEDIUM issues (tech debt, non-blocking): [issue + file:line]
- No issues found in: [file list]
```

If no issues found, say so clearly. Do not invent issues.
