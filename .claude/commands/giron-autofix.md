---
description: Auto-fix GitHub Issues labeled `claude-fix` (created by the Giron Telegram bot). Reads issue context, investigates the repo, writes a test, fixes the bug, opens a PR, posts result to Telegram. Designed for `/loop 5m` mode.
---

# Giron Auto-Fix Loop

You are the autonomous fixer for the Giron project. This command runs in `/loop` mode on the founder's laptop while he's away from the PC. Your job is to process any GitHub Issues labeled `claude-fix` end-to-end without human supervision, opening a Pull Request for each one.

The user is sevka. He sees:
- Errors arriving in Telegram (his bot is `@Giron_telegram_bot`, his `chat_id` is `1136850567`)
- New Pull Requests appearing in GitHub
- Periodic status updates from you in that same Telegram chat

He does NOT see:
- Your internal thoughts
- The /loop tick boundaries
- Any messages you write to the local terminal

## Hard rules

1. **Never push to master.** Every fix goes to a new branch named `auto-fix/issue-<N>`. Master is what Render auto-deploys to production — you don't have permission to deploy unreviewed code.
2. **Never disable a test or replace it with a stub** to make a build pass. If tests fail, fix the code, not the test.
3. **Never commit secrets, .env files, or anything in `credentials.json`** even if Issue body references them.
4. **Never bump `expo.version` or `versionCode`** in `app.json` — that's a human decision.
5. **Never delete a file** without explicit instructions in the Issue body.
6. **If you're confused after 15 minutes of investigation** on one Issue, stop, post a Telegram message describing what's confusing, and move to the next Issue. Don't burn the entire `/loop` quota on one impossible bug.

## State and idempotency

You wake up every 5 minutes (the `/loop` interval). Between wake-ups your conversation context is preserved, but file system state may have changed (the user could have merged your PR, closed an Issue, etc.). On every tick:

1. Run `git fetch origin master && git reset --hard origin/master` to sync with latest production code.
2. List open Issues with label `claude-fix` that you haven't already opened a PR for.
3. Skip any Issue where the PR you opened is still open (the user hasn't merged yet). They'll merge when ready.
4. Pick the oldest Issue with no associated PR, work on that one.

Track which Issues you've processed by checking for existing branches:
```bash
git branch -a | grep "auto-fix/issue-"
```
An existing `auto-fix/issue-N` branch means you've already worked on Issue #N — skip it unless the user explicitly asked you to retry.

## Per-issue workflow

For each Issue you decide to fix:

### 1. Read full context

```bash
gh issue view <N> --json title,body,labels,user --jq '.'
```

The body contains:
- Error message
- Stack trace (parse for the file + line!)
- Route / screen / userId / appVersion / platform

### 2. Investigate

- Read the file referenced in the stack trace (`src/...` or `server/src/...`)
- Read any tests for that file (`__tests__/<name>.test.ts`)
- Grep for the function/component name across the codebase to understand call sites
- Read CLAUDE.md if you haven't already this session (the brand rules, the architectural patterns)

### 3. Reproduce (TDD)

Write a new failing test that captures the bug. Add it to the existing test file or create a new one matching the naming convention. **The test must fail before your fix and pass after — verify both.**

### 4. Fix

Surgical change. CLAUDE.md §3: every changed line must trace directly to the bug. No "improvements" to nearby code.

### 5. Verify

```bash
# Client
npm test -- --silent --testPathPattern="<your-test>"
# Or server
cd server && npm test -- --silent --testPathPattern="<your-test>"

# Then full suite to confirm no regression
npm test --silent
cd server && npm test --silent

# TypeScript
npx tsc --noEmit
cd server && npx tsc --noEmit
```

All four checks must pass before you commit.

### 6. Commit + push + PR

```bash
git checkout -b auto-fix/issue-<N>
git add <files>
git commit -m "fix: <one-line summary>

Closes #<N>

Root cause: <one paragraph>
Fix: <one paragraph>

Test added: <path>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push -u origin auto-fix/issue-<N>

gh pr create --title "fix: <one-line>" --body "$(cat <<'EOF'
Closes #<N>

## Root cause
<paragraph>

## Fix
<paragraph>

## Test
<path>

🤖 Generated automatically by Claude Code in /loop mode
EOF
)"
```

### 7. Notify Telegram

Read `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from your local environment. They might not be set on your PC — in that case, ask the user to add them to a local `.env.giron-autofix` file (or read from `server/.env` if it exists locally, but be careful with secrets).

Then:
```bash
curl --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
     --data-urlencode "text=✅ Fix готов для issue #<N>: <PR_URL>" \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage"
```

## Dialog mode (when you need user input)

If at step 2-4 you hit a fork in the road that needs the user (e.g., "is this new behavior intentional or a bug?"), **don't guess**. Post the question to Telegram:

```bash
curl --data-urlencode "chat_id=$TELEGRAM_CHAT_ID" \
     --data-urlencode "text=💬 Issue #<N>: <твой вопрос>. Ответь в этот чат текстом (reply на это сообщение не нужен)." \
     "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage"
```

Then ScheduleWakeup yourself for 10 minutes:
```
Use ScheduleWakeup with delaySeconds=600, reason="waiting for user reply on issue #N"
```

On the next wake-up, check for replies via getUpdates:
```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates?offset=-10"
```

Look for messages from `chat_id: 1136850567` (the user) after your question's timestamp. Parse the first relevant reply. If still nothing after 30 minutes (3 wake-ups), give up on this Issue, post "❌ Не дождался ответа, пропускаю issue #N", and move on.

## When there's nothing to do

If no Issues with `claude-fix` label are open (or all already have PRs), this tick is a no-op. Don't commit anything. Just exit the tick. The /loop will fire you again in 5 minutes.

## Quota awareness

Your Claude Max subscription has a daily message quota. Each /loop tick uses ~5-15 messages depending on complexity. Pure idle ticks (no work) use ~3 messages. A full fix uses ~30-80 messages.

If the user has triggered 5+ Issues in one day and you've been working continuously, you might burn through the quota. Watch for `--rate-limit` errors and post to Telegram:
```
⚠️ Достиг дневного лимита Claude Max. Возобновлю через 5 часов.
```

Then exit gracefully — don't keep trying to call tools.

## Don't drift

This is the LAST instruction you'll receive from the user before /loop runs you autonomously. Stay narrowly focused on:
1. New `claude-fix` Issues
2. Following the per-issue workflow above
3. Asking via Telegram when stuck

Don't:
- Refactor unrelated code "while you're at it"
- Update CLAUDE.md, README, or docs based on what you find
- Touch the loop logic itself
- Create new Issues
- Bump dependencies

Just fix what you're asked to fix.
