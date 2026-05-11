/**
 * Store target — controls which third-party providers and features are visible
 * per-store build. Controlled by EXPO_PUBLIC_STORE at build time.
 *
 * - `rustore`   — RuStore build (RF market). Google OAuth, YouTube, Play/Apple
 *                 billing are hidden. Shows only Russia-legal surfaces.
 * - `play`      — Google Play build (international). Google OAuth + Play Billing.
 * - `appstore`  — App Store build (international). Apple Sign In + Apple IAP.
 * - `universal` — dev default; everything visible. Don't ship this to stores.
 */
export type StoreTarget = 'rustore' | 'play' | 'appstore' | 'universal';

const raw = (process.env.EXPO_PUBLIC_STORE ?? 'universal').toLowerCase();
export const STORE_TARGET: StoreTarget =
  raw === 'rustore' || raw === 'play' || raw === 'appstore' ? raw : 'universal';

export const isRuStoreBuild = STORE_TARGET === 'rustore';
export const isPlayBuild = STORE_TARGET === 'play';
export const isAppStoreBuild = STORE_TARGET === 'appstore';

/**
 * Exercise demo videos and posters are BUNDLED with the app (assets/exercise-videos/).
 *
 * Why bundled:
 *   - One repo for everything — the media lives next to the code that uses it.
 *   - Works offline — a cold-opened APK on the metro plays demos immediately.
 *   - No rate limits, no CDN cost, no takedown risk.
 *   - 9 MB APK size addition for 32 verified exercises (≈ 300 KB video + ≈ 20 KB poster each).
 *
 * Keep EXERCISE_VIDEO_ASSETS / EXERCISE_POSTER_ASSETS in src/data/exerciseVideoAssets.ts
 * in sync with VERIFIED_INLINE_VIDEO_IDS below and scripts/whitelist-verified.json.
 */
import { EXERCISE_VIDEO_ASSETS, EXERCISE_POSTER_ASSETS } from '../data/exerciseVideoAssets';

export const VERIFIED_INLINE_VIDEO_IDS = new Set<string>(Object.keys(EXERCISE_VIDEO_ASSETS));

export const hasVerifiedInlineVideo = (id: string) => VERIFIED_INLINE_VIDEO_IDS.has(id);

/**
 * Returns a bundled video asset (a React Native module ID produced by require())
 * for the given exercise, or undefined when the exercise has no verified demo.
 * expo-av's <Video source={…} /> accepts module IDs directly.
 */
export const exerciseVideoSource = (id: string): number | undefined =>
  EXERCISE_VIDEO_ASSETS[id];

export const exerciseThumbSource = (id: string): number | undefined =>
  EXERCISE_POSTER_ASSETS[id];

/**
 * Feature flags derived from the store target.
 *
 * Rule of thumb:
 *  - RuStore hides everything that points at infrastructure unreliable in RF
 *    (Google services, YouTube) or payment channels unavailable from RF
 *    (Google Play Billing, Apple IAP).
 *  - Google Play / App Store builds hide RF-specific payment surfaces by default
 *    — external-billing toggles should be added here later when that's configured
 *    in the store's alternative billing program.
 */
export const features = {
  // ── Social auth ──────────────────────────────────────────────────────────
  // Round 290: enabled on rustore too. The original gate excluded
  // rustore alongside Play/IAP because it conflated Google IDENTITY
  // (OAuth) with Google PAYMENTS (Play Billing). OAuth via expo-auth-
  // session uses Custom Tabs / system browser — no Google Play Services
  // dependency, no rustore policy conflict. The button was simply
  // never rendered on rustore builds, which is what users mean when
  // they say "Google login doesn't work".
  googleOAuth: true,
  appleSignIn: STORE_TARGET === 'appstore',
  vkOAuth: true,     // VK works in all regions, keep enabled
  yandexOAuth: true, // Yandex works in all regions, keep enabled

  // ── Media ────────────────────────────────────────────────────────────────
  youtubeVideos: STORE_TARGET !== 'rustore',
  rutubeVideos: STORE_TARGET === 'rustore' || STORE_TARGET === 'universal',

  // ── Payments ─────────────────────────────────────────────────────────────
  // ЮKassa — primary RF channel. Enabled for rustore + universal (dev).
  paymentYuKassa: STORE_TARGET === 'rustore' || STORE_TARGET === 'universal',
  // Google Play Billing — enabled on play build only. Needs a non-RF
  // Google Play Developer account; keep disabled until that's configured.
  paymentGoogleBilling: STORE_TARGET === 'play',
  // Apple IAP — appstore build only. Same caveat: needs a non-RF Apple
  // Developer account; keep disabled until that's configured.
  paymentAppleIAP: STORE_TARGET === 'appstore',
} as const;
