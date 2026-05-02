# Giron Direction A — Master Design Audit

**Date:** 2026-05-02
**Method:** 8 parallel automated audits (7 area-focused + 1 launch surfaces) + wave 2 in progress
**Status:** Wave 1 complete — 699 findings · Wave 2 running (services, e2e flows, test infrastructure)

---

## Executive summary

| Area | P0 | P1 | P2 | U0 | U1 | U2 | Total |
|---|---|---|---|---|---|---|---|
| Admin (12 files) | 40+ | 60+ | 700+ | 8 | 7 | 4 | **~140** |
| Auth + Profile + Settings + Onboarding (28 files) | 15 | 46 | 36 | 10 | 12 | 5 | **97** |
| Workouts + Tracker + AI (~50 files) | 12 | 35 | 40+ | 3 | 5 | 4 | **99** |
| Nutrition + Cardio + News + Progress + Support + Trainer (73 files) | 24 | 28 | 12 | 24 | 15 | 8 | **118** |
| Shared components (29 files) | 12 | 16 | 24 | 6 | 10 | 8 | **76** |
| HomeScreen + components (24 files) | 18 | 24 | 35 | 8 | 10 | 12 | **115** |
| Theme + Nav + Hooks + Utils + Data | — | 12 | 24 | 15 | — | — | **51** |
| Launch surfaces (App.tsx, app.json) | 1 | 2 | — | — | — | — | **3** |
| **TOTAL WAVE 1** | **122** | **223** | **871+** | **74** | **59** | **41** | **~699** |

**Severity legend:** P0 broken/banned · P1 wrong style · P2 design drift · U0 unusable · U1 uncomfortable · U2 cluttered

---

## TOP 20 — fix these first (highest blast radius)

| # | Issue | Where | Why critical |
|---|---|---|---|
| 1 | **Entire admin area renders dark-only**, no `useThemeStore` import in 12 files | `src/screens/admin/**` | Light mode = white-on-cream invisible |
| 2 | **`AppModalProvider` hardcodes `IronGymTheme`** | `src/components/app-modal/AppModalProvider.tsx:46-61` | Every Alert/Toast across whole app dark-only |
| 3 | **`MuscleHeatmapCard` checks `bgColor === '#0A0A0F'`** but actual is `#0E0E0F` | `src/screens/progress/components/MuscleHeatmapCard.tsx:75` | Branch always false → wrong colors in dark mode |
| 4 | **`ErrorBoundary` shipped with `#8B5CF6` button** | `src/components/ErrorBoundary.tsx:67` | Banned palette shown on every JS crash |
| 5 | **`ForceUpdateModal` shipped with `#8B5CF6` + `#F59E0B`** | `src/components/ForceUpdateModal.tsx:114, 102` | Banned palette on every force-update |
| 6 | **`ShareImageCard` ships banned `#8B5CF6` to socials** | `src/screens/workouts/summary/ShareImageCard.tsx:23,128,140,150,163,193,250,269` | Off-brand impressions outside the app |
| 7 | **Floating "Начать" CTA: `color: '#FFF'` on gold = 1.9:1** | `src/screens/home/HomeScreen.tsx:608` | WCAG AA fail, unreadable in light mode |
| 8 | **6 banned color maps in tracker/workouts:** CONFETTI_COLORS, MUSCLE_GROUPS, GOAL_COLORS×2, STRENGTH_COLORS, STANDARD_COLORS, DIFFICULTY_COLORS | tracker/components/PRToast.tsx:15, WorkoutHeader.tsx:13-25, AIProgramDetailScreen.tsx:18-21, components/UserProgramsList.tsx:11-13, onerm/StrengthStandardsCard.tsx:17, ProgramDetailScreen.tsx:18 | One-PR fix removes ~30 P0 hits |
| 9 | **AIChatScreen has banned `#8B5CF6` in hottest path** | `src/screens/ai/AIChatScreen.tsx:412, 514-515` | Most-engaged screen displays old palette |
| 10 | **`AppNavigator.tsx` headerStyle hardcoded `#0F0F0F`** | `src/navigation/AppNavigator.tsx:210-211` | Header doesn't theme — dark on cream |
| 11 | **AppNavigator.tsx tab icons rendered as unicode glyphs `'◎','◈','○'`** | dead code line 92-98 + actual TAB_META map | Banned glyphs at navigation root |
| 12 | **`ProfileScreen` Security card: 4 banned palette accents fight for attention** | `src/screens/profile/ProfileScreen.tsx:666-697` | `#8B5CF6, #6366F1, #F59E0B, #EF4444` |
| 13 | **`STRENGTH_COLORS` arrays use banned palette (Register + ChangePassword)** | `src/screens/auth/RegisterScreen.tsx:38, src/screens/profile/ChangePasswordScreen.tsx:24` | `#EF4444, #FF9F0A, #34C759, #8B5CF6` |
| 14 | **HomeScreen `paddingBottom: 100`** insufficient on Pro Max (tab 83 + indicator 34 = 117) | `src/screens/home/HomeScreen.tsx:263` | Last cards cropped on Pro Max |
| 15 | **HomeScreen banner stack pushes primary CTA below fold** (up to 5 banners) | `src/screens/home/HomeScreen.tsx:271-360` | First-load user can't see "do this next" |
| 16 | **11 unused home components imported, ~1300 LOC dead** | HomeScreen.tsx imports + components/ folder | Bundle bloat + temptation to re-add debt |
| 17 | **All `useThemeStore()` use full subscription** (327 occurrences across 127 files) | repo-wide | Every store update re-renders every consumer |
| 18 | **Splash background `#0A0A0F`** doesn't match Direction A `#0E0E0F` | `app.json:18,35,38` | FOWT (flash of wrong theme) on launch |
| 19 | **Default theme is `'light'`** despite product being "Premium dark" | `src/store/useThemeStore.ts:24,47` | First-launch users see light, not brand |
| 20 | **`isNightTime()` uses 21:00-07:00 clock** instead of OS `Appearance.getColorScheme()` | `src/store/useThemeStore.ts:6-9` | Doesn't follow user's system-wide setting |

---

## Findings by category (cross-cutting)

### Banned old purple palette (`#8B5CF6, #A78BFA, #7C3AED, #6D28D9`)

20+ files still hold these. Most concentrated in:
- `src/components/ErrorBoundary.tsx`, `ForceUpdateModal.tsx` (global components)
- `src/screens/admin/**` — 9 of 12 admin files
- `src/screens/profile/ProfileScreen.tsx`, `SubscriptionScreen.tsx` (heroCard heavy)
- `src/screens/workouts/exercise/ExerciseVideoCard.tsx`, `summary/PRCelebration.tsx`, `summary/ShareImageCard.tsx`
- `src/screens/ai/AIChatScreen.tsx` (load-older button + ActivityIndicator)
- `src/screens/tracker/components/WorkoutHeader.tsx` (muscle map shoulders color)
- `src/screens/auth/RegisterScreen.tsx`, `profile/ChangePasswordScreen.tsx` (STRENGTH_COLORS)
- `src/screens/nutrition/recipes/AIRecipeScreen.tsx`, `RecipeDetailScreen.tsx` (Macro protein color)

### Banned Apple/Material palette (`#6366F1 #F59E0B #EF4444 #10B981 #34C759 #FF3B30 #FF9F0A`)

40+ files. Hot spots:
- All admin screens — every file
- `src/screens/home/HomeScreen.tsx:52-57` ANN_COLORS
- `src/screens/support/**` — STATUS_COLORS in every support file
- `src/screens/profile/SecurityEventsScreen.tsx:20-37` ACTION_META
- `src/screens/progress/components/SleepTab.tsx:16` QUALITY_COLORS
- `src/screens/progress/components/records/StrengthStandardsCard.tsx:15` LEVEL_COLORS
- `src/screens/progress/components/weight/BodyMeasurementsCard.tsx:50-60` body-fat colors
- `src/screens/workouts/calculator/PlateCalculatorTab.tsx:11` plate colors

### Hardcoded `#FFFFFF / #FFF / #000` (text/bg)

100+ occurrences. Cause: cream-on-cream / black-on-black bugs in light mode. Most in:
- All admin screens
- `src/screens/profile/PlanSelector.tsx`, `LevelSelectorCard.tsx`, `GoalStep.tsx`, `LevelStep.tsx`, `DaysStep.tsx`
- `src/screens/nutrition/recipes/*.tsx` step badges
- `src/screens/tracker/components/*` overlay text
- Most `Macro` callsites

### Emoji in JSX text (banned)

50+ occurrences. Most in:
- `src/screens/home/HomeScreen.tsx:55-57` ANN_ICONS `ℹ️ ⚠️ 🔧 🎁`
- `src/screens/home/HomeScreen.tsx:290, 340` `✉️ 🏋️`
- `src/screens/ai/AIChatScreen.tsx:65, 68` `💬 ⚠️`
- `src/screens/profile/ProfileScreen.tsx:464, 651-652` `🔑`
- `src/screens/auth/LoginScreen.tsx:458, RegisterScreen.tsx:337, ForgotPasswordScreen.tsx:218, 245` `🇷🇺` flag
- `src/screens/auth/ForgotPasswordScreen.tsx:171, 186, ChangePasswordScreen.tsx:83` `📬 ✅` 64pt heroes
- `src/screens/nutrition/components/GoalsModal.tsx:13-17` `🔥 ⚖️ 💪 🏋️ 🏃`
- `src/screens/nutrition/FoodScannerScreen.tsx` (15+) `📡 📸 📦 📝 📷 ⚠ ✎`
- `src/screens/news/**` `🔖 📌`
- `src/screens/support/**` `🎧 ⚙️ 💳 👤 🐛 💡`
- `src/screens/progress/components/CardioTab.tsx:17-18` TYPE_EMOJI `🏃 🚴 🏊 🚶 ⚡`
- `src/screens/trainer/TrainerDashboardScreen.tsx:80` `👥`
- `src/screens/profile/components/AchievementsCard.tsx:48,67`
- `src/screens/profile/SystemSection.tsx:164` `🗑`

### Unicode-glyph icons (banned: `‹›◈△○▸◎■▶●◦`)

100+ occurrences. Includes:
- `src/utils/achievements.ts` — 20 achievements (not 9), all use unicode `'◎','◉','◈','◧','◫','●','■','◑','◆','○'`
- `src/data/programs.ts` — 25 programs (not 11), same glyph palette
- `src/navigation/AppNavigator.tsx:92-98` TAB_ICONS dead-code map
- `src/screens/auth/ForgotPasswordScreen.tsx:205, ResetPasswordScreen.tsx:76` hero `'◈'`
- `src/screens/onboarding/steps/GoalStep.tsx:8-15` GOALS use `'◎ ◉ ◈ ◧ ◫ ◑'`
- `src/screens/profile/components/FeaturesTable.tsx:9-17` FEATURES use `◈ ◧ ◫ ◑ ◉ ◎`
- `src/components/NavBar.tsx:53` back arrow `'‹'`
- 10 profile/settings screens render `← Назад` Text instead of `<Icon name="chev">`
- All home/ subcomponent cards use `'▶ ▲ ▼ ★ ◎'` text glyphs
- All workouts/ screens — every back chevron + many disclosure icons unicode
- `src/screens/admin/**` — every screen

### `ActivityIndicator` (must be `<Spinner>`)

70+ occurrences. Hot spots:
- All admin screens — 23 instances
- All auth screens — 12 instances
- All workouts screens — 35+ instances
- All nutrition/cardio/support — 12 instances
- All profile detail screens — 9 instances
- AIChatScreen with banned color
- Inside Button.tsx and ResponsiveButton.tsx (should be Spinner) ← affects EVERY button loading state

### `useThemeStore()` without selector (full-subscription anti-pattern)

327 textTertiary reads via 50+ files. **Every screen and component uses this anti-pattern.** Fix: introduce `useThemeColors()` and `useThemeIsDark()` selector hooks. Mechanical sweep across 127 files.

### Light-theme parity (BROKEN)

These break entirely in light mode:
- All admin screens (no `useThemeStore`)
- `AppModalProvider` (hardcoded IronGymTheme dark)
- `Toast` (Tailwind palette)
- `Tooltip` (gold bg + white text = 2.8:1 FAIL)
- `ErrorBoundary`, `ForceUpdateModal` (banned palette)
- `BarcodeScannerModal` (forced `#000` bg)
- `MuscleHeatmapCard` (broken bg detection)
- All Macro components (Apple hex hardcoded)
- All gold CTAs with `'#FFF'` text (contrast fail)
- All overlays as `'rgba(0,0,0,0.X)'` literals (should be `colors.overlay`)

### Russian plurals hand-rolled wrong

`src/screens/home/HomeScreen.tsx:148-202` — 4 places use `streak < 5 ? 'дня' : 'дней'`. Fails for 11-14 (should be "дней"). Same bug in:
- HomeScreen.tsx lines 150, 180, 200
- StreakWarningCard.tsx:26

Existing util `pluralizeDaysRu` is imported but only used in StreakPRGrid.

### Tap targets < 44pt

20+ instances:
- HomeScreen close `'✕'` (16-24pt)
- HomeScreen banner action buttons (28pt)
- CardioWeekCard add button (36×36)
- AdminUsersScreen checkbox (20×20)
- AdminTicketScreen send/note buttons (40×40)
- ChatInputBar send (40×40)
- ExerciseNavBar prev/next chevrons (8pt + hitSlop)
- RestTimerOverlay rest +15с/+30с buttons (~38pt)

### Missing theme tokens

Per audit gaps:
- `textDisabled`, `textOnGold` (explicit gold-CTA contrast)
- `accentSubtle` (gold @ 12% alpha for tinted backgrounds)
- `successBg / warningBg / errorBg / infoBg`
- `skeletonBase / skeletonShimmer`
- `linkColor`
- `borderFocus` (input-focus ring)
- `borderStrong`
- `surfacePressed / surfaceHover`
- `shadowSm / shadowMd / shadowLg / shadowXl` (one shadow token currently)
- `tabBarLabelActive`
- spacing intermediate values (no 14, 28, 36, 64, 72, 96, 128)
- borderRadius intermediate (no 4, 6, 10, 18, 28, 32, 40)
- `display`, `numberHero`, `bodyLarge`, `bodySmall`, `captionBold`, `metaLabelLarge`

---

## Migration batches (recommended order)

### Batch 1 — Global components (1 PR, ~10 files)
Fixes the most user-facing chrome.
1. `ErrorBoundary.tsx` — replace `#8B5CF6` + theme-aware
2. `ForceUpdateModal.tsx` — replace banned palette + theme-aware
3. `AppModalProvider.tsx` — replace `IronGymTheme` constants with `useThemeStore`
4. `Toast.tsx` — replace `VARIANT_BG` with theme tokens
5. `Tooltip.tsx` — fix gold-bg/white-text contrast (use `textInverse`)
6. `Button.tsx` — replace `ActivityIndicator` with `<Spinner>`
7. `ResponsiveButton.tsx` — same + reconcile API with Button
8. `IconButton.tsx`, `FormField.tsx` — remove `#EF4444` fallbacks
9. `NavBar.tsx` — replace `'‹'` with `<Icon name="chev">` + add HitTarget
10. `GoogleAuthButton.tsx` — re-evaluate `#4285F4` brand-clash

### Batch 2 — Tab bar + Navigator (1 PR)
- `AppNavigator.tsx` — delete dead TAB_ICONS, theme `headerStyle`/`headerTintColor`/`tabBar`/`offlineBanner`

### Batch 3 — Theme tokens (1 PR)
- `colors.ts` — add missing tokens listed above
- `useThemeStore.ts` — change default to `'auto'` (read OS), use `Appearance.getColorScheme()`
- `colors.ts` — fix `textTertiary` light-mode contrast
- Add `useThemeColors()` and `useThemeIsDark()` selector hooks

### Batch 4 — HomeScreen (1 PR)
- Delete 11 unused home components (~1300 LOC)
- Fix `paddingBottom: 100` → safe-bottom-aware
- Replace banner stack with single sticky banner
- Fix Floating CTA contrast (`textInverse` instead of `'#FFF'`)
- Replace 6 hand-rolled plurals with `pluralizeDaysRu`
- Replace ANN_COLORS / ANN_ICONS with theme tokens + `<Icon>`
- Move email-verify modal to its own screen

### Batch 5 — Workouts color maps (1 PR)
- Replace 6 banned color arrays (CONFETTI/GOAL/STRENGTH/STANDARD/DIFFICULTY/PLATE/MUSCLE) with token-derived gradients

### Batch 6 — Admin migration (5-7 PRs, one screen each)
Each admin screen needs full rewrite to use Direction A. Recommended order:
- AdminGuard (entry point, smallest)
- AdminLogsScreen, AdminSecurityEventsScreen
- AdminAnnouncementsScreen, AdminMetricsKeyScreen
- AdminUsersScreen, AdminUserDetailScreen
- AdminSubscriptionsScreen, AdminSupportScreen, AdminTicketScreen
- AdminAnalyticsScreen
- AdminDashboardScreen (most complex, last)

### Batch 7 — Auth + Profile + Settings + Onboarding (3-4 PRs)
- Auth (4 screens) — STRENGTH_COLORS, ActivityIndicator, emoji, glyph hero, `← Назад`
- Profile (12 screens) — Security card cleanup, hero SVG theme, `← Назад` chevs
- Settings (8 sections) — `thumbColor` theme-aware, overlays via token
- Onboarding (6 screens) — step glyph icons → `<Icon>`, gold-CTA contrast, safe-bottom

### Batch 8 — Domain screens (4-5 PRs)
- Nutrition recipes — Macro Apple hex → tokens
- Support — entire screen rewrite (3 files)
- Progress weight/sleep/strength tabs — Material palette → tokens
- Trainer — InviteCodeDisplay font 28→44, missing PaywallModal
- News — emoji `🔖 📌` → `<Icon>`

### Batch 9 — useThemeStore selector migration (mechanical sweep)
Convert 327 reads across 127 files from `useThemeStore()` to `useThemeColors()`/`useThemeIsDark()`. Codemod-able.

### Batch 10 — Data layer
- `achievements.ts` — `emoji: string` → `iconName: IconName`
- `programs.ts` — `emoji: string` → `iconName: IconName`

### Batch 11 — Launch surfaces
- `app.json` splash bg `#0A0A0F` → `#0E0E0F` (also Android adaptiveIcon + splash)
- `App.tsx` — `useThemeStore()` → selector

---

## Wave 2 in progress

Three additional audit agents launched, results pending:
1. Services + stores UI bleed-through (api.ts errors, push notifications, toast helpers)
2. End-to-end flow consistency (Auth→Onboarding→Home, Workout journey, Nutrition journey, AI conversation, Subscription, Profile)
3. Cross-reference with 107 existing audit-tests in `src/__tests__/`

**Existing test infrastructure (DISCOVERED):** `src/__tests__/` contains 107 test files including 24 `audit*.test.ts` and 22 `design*.test.ts`. The design agent's §27 "Visual regression" section currently treats this as future work — this is an existing gap to fix.

---

## Outstanding gaps (will check after wave 2)

- Asset PNG colors (splash, icon, adaptive-icon) vs theme bg
- Snapshot baselines in `__snapshots__/` — stale?
- Test coverage on PaywallModal render path
- Lottie animations — not yet added; spec ready in design.md §28
- Storybook — not set up; component count 25-28, threshold 30 close

---

*Document continues to grow as wave 2 reports arrive.*
