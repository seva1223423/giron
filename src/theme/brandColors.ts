/**
 * Third-party brand colors — Direction A allow-list.
 *
 * Direction A bans Apple/Material rainbow palette (#EF4444, #F59E0B,
 * #6366F1, #10B981, #8B5CF6, etc.) from screens and components. But a
 * handful of THIRD-PARTY brand colors must appear verbatim — Google,
 * VK, Yandex, YouTube, Rutube — for legal/recognition reasons (logo
 * hex MUST match the brand guideline, even if that hex happens to
 * collide with one of the banned values).
 *
 * Round 246 (2026-05-02 audit): centralized these here so:
 *   1. Direction A token sweeps can ALLOW-list this single file
 *      instead of hunting them across LinkedAccountsScreen, GoogleAuthButton,
 *      ExerciseVideoCard, etc.
 *   2. If a brand updates its hex, one edit fixes every consumer.
 *   3. Tests can grep this file by name and skip its contents during
 *      the banned-palette sweep.
 *
 * Usage:
 *   import { brandColors } from '../../theme/brandColors';
 *   <View style={{ backgroundColor: brandColors.google }}>
 */
export const brandColors = {
  /** Google brand blue (Material Design G Logo) */
  google: '#4285F4',
  /** VK ID brand blue */
  vk: '#0077FF',
  /** Yandex ID brand red */
  yandex: '#FC3F1D',
  /** YouTube brand red */
  youtube: '#FF0000',
  /** Rutube brand red */
  rutube: '#E32A2A',
  /** Apple Sign-In brand black (only for Apple-mandated chrome) */
  apple: '#000000',
} as const;

export type BrandColorName = keyof typeof brandColors;
