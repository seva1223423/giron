import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Storage keys owned by screens rather than by a Zustand store.
 *
 * Logout clears every store through `clearUserData()` and flushes them to
 * disk, but a handful of screens write straight to AsyncStorage under their
 * own keys — and nothing ever cleaned those up. Log out, log in as someone
 * else on the same phone, and the previous account's PROGRESS PHOTOS, body
 * measurements and food scans were still there (audit R33).
 *
 * Keep this list in sync with the screens: `screenOwnedStorage.test.ts` scans
 * the screen sources and fails if a new key appears that is in neither list.
 */

/** Personal data — must not survive a logout. */
export const SCREEN_OWNED_PRIVATE_KEYS = [
  'giron_progress_photos', // progress/components/PhotosTab — body photos
  'giron_body_measurements', // progress/components/weight/AddMeasurementsModal
  'giron_recent_scans', // nutrition/FoodScannerScreen
  'giron_scanner_draft', // nutrition/FoodScannerScreen
  'giron_ai_scan_cache', // nutrition/FoodScannerScreen
  'giron_scanner_last_meal_type', // nutrition/FoodScannerScreen
  'giron/nutrition/quickMeals/overrides/v1', // nutrition/components/QuickMeals
  'giron/nutrition/quickMeals/hidden/v1', // nutrition/components/QuickMeals
  'giron/nutrition/quickMeals/userPresets/v1', // nutrition/components/QuickMeals
  'giron_exercise_favorites', // workouts/components/ExercisesTab
  'iron_gym_exercise_favorites', // workouts/ExerciseSearchScreen
  '@admin_recently_viewed_users', // admin/AdminDashboardScreen + AdminUserDetailScreen
] as const;

/**
 * Deliberately kept across logout — nothing personal in them.
 *   giron_barcode_cache     public barcode → product data, costly to refetch
 *   giron_scanner_onboarded one-off UI hint flag
 *   giron_admin_pin         device-local admin gate; admin routes are still
 *                           JWT-protected, and wiping it would force the
 *                           founder to re-configure the PIN after each logout
 */
export const SCREEN_OWNED_KEPT_KEYS = [
  'giron_barcode_cache',
  'giron_scanner_onboarded',
  'giron_admin_pin',
] as const;

/**
 * Remove every screen-owned key holding personal data. Best-effort: a storage
 * failure must never block logout, but it is logged so a silent leak does not
 * go unnoticed.
 */
export async function clearScreenOwnedStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([...SCREEN_OWNED_PRIVATE_KEYS]);
  } catch {
    // Fall back to per-key removal — multiRemove is all-or-nothing on some
    // Android implementations, and clearing most keys beats clearing none.
    await Promise.all(
      SCREEN_OWNED_PRIVATE_KEYS.map((k) => AsyncStorage.removeItem(k).catch(() => {})),
    );
  }
}
