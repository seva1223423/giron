/**
 * Re-exports the AsyncStorage key strings for direct verification in
 * tests — we can't import them from inside FoodScannerScreen (which
 * pulls the full store / expo graph), so this file exists only to
 * provide a light indirection.
 *
 * If any of these constants change in the source, update here too.
 */

export const BARCODE_CACHE_KEY_FOR_TEST = 'iron_gym_barcode_cache';
export const RECENT_SCANS_KEY_FOR_TEST = 'iron_gym_recent_scans';
export const SCANNER_DRAFT_KEY_FOR_TEST = 'iron_gym_scanner_draft';
export const LAST_MEAL_TYPE_KEY_FOR_TEST = 'iron_gym_scanner_last_meal_type';
export const AI_SCAN_CACHE_KEY_FOR_TEST = 'iron_gym_ai_scan_cache';
