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
 * Base URL for own-hosted exercise videos and media.
 * Set EXPO_PUBLIC_MEDIA_URL at build time to switch bucket/CDN without a code change.
 *
 * Default points at seva1223423/iron-gym-media served via raw.githubusercontent.com —
 * zero-cost, works for early traffic. Swap to Yandex Object Storage / Cloudflare R2
 * when GitHub raw rate limiting becomes an issue.
 *
 * Expected layout at the base URL:
 *   /{exercise-id}.mp4      — main video for an exercise (8s, 480p H.264, ≈ 400 KB)
 *   /{exercise-id}.jpg      — 1-second poster frame (≈ 20 KB)
 */
export const MEDIA_BASE_URL =
  process.env.EXPO_PUBLIC_MEDIA_URL?.replace(/\/+$/, '') ??
  'https://raw.githubusercontent.com/seva1223423/iron-gym-media/main/exercises';

/**
 * Exercises that have a verified inline demo video uploaded to iron-gym-media.
 * Kept in sync with scripts/whitelist-verified.json and the actual contents of
 * the media repo. For any exercise NOT in this set, the client skips the
 * inline-video attempt (no 404) and goes straight to the YouTube/Rutube fallback.
 */
export const VERIFIED_INLINE_VIDEO_IDS = new Set<string>([
  'arnold-press', 'barbell-curl', 'barbell-row', 'bench-press', 'burpee',
  'chest-press-machine', 'deadlift', 'dumbbell-bench-press', 'dumbbell-row',
  'dumbbell-shoulder-press', 'french-press', 'front-squat', 'goblet-squat',
  'hack-squat', 'hammer-curl', 'hanging-leg-raise', 'hyperextension',
  'incline-bench-press', 'jump-rope', 'kettlebell-swing', 'lat-pulldown',
  'leg-curl', 'leg-extension', 'leg-press', 'machine-shoulder-press',
  'overhead-press', 'rack-pull', 'reverse-crunch', 'romanian-deadlift',
  'squat', 'sumo-deadlift', 't-bar-row',
]);

export const hasVerifiedInlineVideo = (id: string) => VERIFIED_INLINE_VIDEO_IDS.has(id);

export const exerciseVideoUrl = (id: string) =>
  hasVerifiedInlineVideo(id) ? `${MEDIA_BASE_URL}/${id}.mp4` : undefined;

export const exerciseThumbUrl = (id: string) =>
  hasVerifiedInlineVideo(id) ? `${MEDIA_BASE_URL}/${id}.jpg` : undefined;

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
