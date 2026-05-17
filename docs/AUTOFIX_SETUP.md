# Autonomous Telegram-triggered Fix Loop

End-to-end setup so errors from your phone get fixed by Claude on your laptop while you're away.

## Architecture

```
Production error
   ↓
Telegram bot pings phone
   ↓
You tap "🔧 Fix it" button
   ↓
Server creates GitHub Issue with label `claude-fix`
   ↓
Your laptop (in sleep) wakes every ~5 min via Task Scheduler
   ↓
Claude Code session (already running with /loop) picks up the new Issue
   ↓
Claude: investigate → test → fix → push branch → open PR
   ↓
PR notification arrives in GitHub mobile app on your phone
   ↓
You review + merge from phone → Render auto-deploys
```

**Cost:** $0 marginal (uses Claude Max subscription + GitHub free tier + Render free tier). Electricity for laptop in sleep ~10-15 ₽/month.

## One-time setup on the laptop

### 1. Verify Claude Code is installed

```powershell
claude --version
```

Should print a version like `1.x.y`. If not, install per https://claude.com/claude-code.

### 2. Verify you're logged in with the Max subscription

```powershell
claude login
```

Should show "Logged in as <your email>" and indicate Max tier.

### 3. Install GitHub CLI

```powershell
winget install --id GitHub.cli
gh auth login --hostname github.com --git-protocol https --web
```

Verify:
```powershell
gh repo view seva1223423/giron
```

### 4. Clone the repo to the laptop

```powershell
cd C:\Users\sevka\Desktop\1223\work
git clone https://github.com/seva1223423/giron
cd giron
npm install
cd server && npm install
```

### 5. Add Telegram credentials to a local env file

The `/giron-autofix` slash command needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to notify you. Add them to your user environment variables:

PowerShell, run as Administrator:
```powershell
[Environment]::SetEnvironmentVariable("TELEGRAM_BOT_TOKEN", "<your-bot-token>", "User")
[Environment]::SetEnvironmentVariable("TELEGRAM_CHAT_ID", "1136850567", "User")
```

Sign out and sign back in for the variables to take effect.

### 6. Configure Windows for scheduled wake from sleep

Open **Power Options** → **Edit Plan Settings** → **Change advanced power settings**:

- `Sleep` → `Allow wake timers` → **Enable** (both AC and battery if laptop)
- `Sleep` → `Hibernate after` → set to **Never** (we want sleep, not hibernate — hibernate doesn't support wake timers reliably)

### 7. Enable auto-login (Windows)

Open `Run` → type `netplwiz` → uncheck **"Users must enter a user name and password to use this computer"**. Enter your password when prompted. This lets the laptop boot directly into your account after a wake without you typing the password.

⚠️ **Security trade-off:** anyone with physical access to your laptop has full access. If that's not OK, skip this and you'll need to type your password each time the laptop wakes. The `/loop` will still run if the laptop is on the lock screen, BUT only if Claude Code was already running when it locked.

### 8. Set up Task Scheduler to keep the laptop awake periodically

Open **Task Scheduler** (`taskschd.msc`) → **Create Basic Task**:

- **Name:** `Giron AutoFix Wake`
- **Trigger:** Daily, every day, at e.g. `00:00`, repeat every `30 minutes` for `24 hours`
- **Action:** Start a program → `cmd.exe` → arguments `/c rem giron-autofix-wake` (no-op command, the wake itself is the point)
- **Conditions** tab: check **"Wake the computer to run this task"**
- **Settings** tab: check **"Allow task to be run on demand"**, set **"Stop the task if it runs longer than 1 minute"**

This wakes the laptop every 30 min so Claude Code's `/loop` can run.

## Running the autofix

### One time, from your laptop

```powershell
cd C:\Users\sevka\Desktop\1223\work\giron
claude
```

This starts Claude Code in the giron directory. Once in the Claude chat:

```
/loop 5m /giron-autofix
```

That's it. Claude will now wake up every 5 minutes (when the laptop is awake), check for new `claude-fix` Issues, and fix them.

**Important:** keep this Claude Code session running. Don't close the terminal. Don't close Claude Code. The `/loop` lives inside the session — kill the session, kill the loop.

If you reboot the laptop, you have to re-run the two commands above.

### Optional: auto-start Claude Code on login

Create a shortcut in `shell:startup`:

1. `Win+R` → type `shell:startup` → Enter
2. Create a new shortcut pointing to:
   - Target: `cmd.exe /c "cd /d C:\Users\sevka\Desktop\1223\work\giron && claude"`
   - This opens Claude Code in the giron directory on every login.
3. After Claude Code launches, you still have to type `/loop 5m /giron-autofix` manually — there's no way to feed a starting prompt automatically through Claude Code CLI (yet).

## How to use it

### Phone-only happy path

1. App crashes / server throws an error
2. Telegram bot pings you with the error
3. Tap **"🔧 Fix it"** button
4. Wait ~5-15 minutes
5. Telegram message arrives: `✅ Fix готов для issue #N: <PR-URL>`
6. Open the PR link in GitHub mobile app
7. Review the diff
8. Tap **Merge pull request**
9. Render auto-deploys within 2 minutes
10. (If it's a client-side fix that needs an OTA, you'll need to publish OTA from a laptop — that part still requires manual action)

### When Claude has a question

Sometimes Claude can't decide between two interpretations. You'll see:

```
💬 Issue #5: Не понятно — это новое поведение, которое юзер ожидает,
или это баг? Я вижу что код всегда обнулял этот counter. Если это
было нарочно — закроем issue. Если баг — то стоит ли добавить
дополнительную проверку на >0?
```

Just reply in the Telegram chat (any plain text). Claude will see your reply on its next wake-up and continue.

If Claude doesn't get a reply within 30 minutes (3 wake-ups), it will skip the Issue and move on.

## Limitations

| What | Why | Workaround |
|---|---|---|
| Laptop must be on or in sleep | Claude Code needs to be running | Set up scheduled wake (step 8 above) |
| OTA publish requires a human | `eas update` is a manual command, not safe to automate | After merging PR, publish OTA from laptop when you're back |
| Native code changes need full APK build | Same reason | If PR changes `app.json` plugins or native deps, manual `eas build` needed |
| Max subscription has daily quota | Anthropic limits messages per 5h | Claude will pause autonomously when hit |
| `--dangerously-skip-permissions` mode | Skips all approval prompts, can theoretically misbehave | Branch protection on master + your PR review = safety net |

## Disabling

To stop the loop:

1. Open the laptop where Claude Code is running
2. In the Claude Code chat, type: `/loop stop` (or just close the session)
3. The Task Scheduler entry will still wake the laptop — disable or delete it via `taskschd.msc` if you don't want that either.

## Troubleshooting

### Claude Code doesn't pick up new Issues

- Check that the `claude-fix` label is being added when you tap "Fix it" in Telegram. View the Issue on GitHub mobile — labels should show the chip.
- Check Claude Code chat for errors. Sometimes `gh issue list` fails if auth expired — re-run `gh auth login`.
- Verify your Max subscription is active: `claude login`

### Telegram messages from autofix aren't arriving

- Check `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set as user env vars (`echo %TELEGRAM_BOT_TOKEN%` in CMD)
- Verify the bot is alive: paste `https://api.telegram.org/bot<TOKEN>/getMe` in browser → should return JSON
- Verify the bot has been started by you (you've pressed Start in the bot's chat)

### Laptop won't wake from sleep

- Check `powercfg /lastwake` to see why it didn't wake
- Make sure "Allow wake timers" is enabled in power settings
- Some laptops disable wake timers when on battery — plug in if you're going away

### PR was opened but the fix is bad

- Just close the PR on GitHub mobile, no harm done
- The Issue stays open with the `claude-fix` label, but the existing branch prevents Claude from retrying. Either delete the branch (`gh api -X DELETE /repos/seva1223423/giron/git/refs/heads/auto-fix/issue-N`) to re-trigger, OR remove the `claude-fix` label and re-add it
- If a particular Issue keeps producing bad fixes, drop the `claude-fix` label and fix manually when you're at a laptop

## What's NOT automated (yet)

- OTA publishing (`eas update`)
- Native rebuilds (`eas build`)
- Dependency updates
- Schema migrations (Prisma)
- Any change touching `app.json` plugins or `credentials.json`

For those, you still need to be at a laptop. The autofix is for code bugs only.
