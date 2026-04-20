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
  googleOAuth: STORE_TARGET !== 'rustore',
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
