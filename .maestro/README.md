# Maestro E2E smoke tests

Giron uses [Maestro](https://maestro.mobile.dev/) for mobile end-to-end
smoke tests. Maestro is the lightest E2E option for React Native — no
native module changes, no Detox setup, just YAML flows that drive a real
device or emulator.

## Install

Maestro is a binary CLI. Per-device install:

```bash
# macOS / Linux
curl -Ls "https://get.maestro.mobile.dev" | bash

# Windows (via PowerShell)
iwr -useb https://get.maestro.mobile.dev/install.ps1 | iex
```

Verify: `maestro --version` (should print 1.40+).

## Run

```bash
# Single flow
maestro test .maestro/swipe-tabs.yaml

# Whole suite
maestro test .maestro/
```

The app must be installed and running on the connected device/emulator.
Maestro auto-detects the device — for explicit selection use
`--device <id>` (run `maestro devices` to list).

## Flow files

| File | What it verifies |
|---|---|
| `auth-login.yaml` | Email login form renders, login → MainTabs |
| `auth-register.yaml` | Register form with OAuth buttons (3 — no Mail.ru) |
| `swipe-tabs.yaml` | Swipe between Главная / Тренировки / ИИ / Питание / Профиль |
| `onboarding.yaml` | 4-step questionnaire flow |
| `workout-start.yaml` | Open WorkoutsScreen → start active workout |
| `nutrition-empty-state.yaml` | NutritionScreen empty state renders |
| `profile-settings.yaml` | Profile → Settings → theme toggle |
| `force-update.yaml` | Force-update modal renders when MIN_CLIENT_VERSION exceeds |

## CI integration

Maestro Cloud (paid) or self-hosted via GitHub Actions:

```yaml
# .github/workflows/maestro.yml
name: E2E (Maestro)
on: [pull_request]
jobs:
  maestro:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '17' }
      - run: curl -Ls "https://get.maestro.mobile.dev" | bash
      - run: brew install android-platform-tools
      # Boot emulator + install APK + run flows
      - run: maestro test .maestro/
```

Total runtime: ~5 minutes for full suite on a standard emulator.

## Writing new flows

Maestro YAML schema: <https://maestro.mobile.dev/api-reference/commands>

Quick reference:

```yaml
appId: com.giron.app
---
- launchApp
- assertVisible: "Главная"
- tapOn: "Войти"
- inputText: "test@example.com"
- swipe:
    direction: LEFT
    from: { x: 50%, y: 50% }
- waitForAnimationToEnd
```

Element matching:
- `tapOn: "text"` — finds by visible text (works for Russian)
- `tapOn: { id: "tabBar.home" }` — by testID (preferred for stable IDs)
- `tapOn: { accessibilityText: "Главная" }` — by accessibility label

Project convention: prefer text matching for now (no testIDs across the
codebase). If a flow becomes flaky, add a `testID` prop to the target
component and migrate the flow to use it.
