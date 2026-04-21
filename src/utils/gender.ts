/**
 * Gender comes back from the server as the Prisma enum value (`MALE` / `FEMALE`
 * — uppercase) but is submitted by the client as lowercase (`male` / `female`).
 * The old client code compared `user.gender === 'female'` directly, which
 * silently returned false for every user loaded from the server and fed the
 * wrong BMR formula into the nutrition calculator.
 *
 * This helper normalizes to the lowercase form the client uses in comparisons.
 */
export type NormalizedGender = 'male' | 'female';

export const normalizeGender = (g?: string | null): NormalizedGender | undefined => {
  if (!g) return undefined;
  const lower = String(g).toLowerCase();
  return lower === 'male' || lower === 'female' ? lower : undefined;
};

export const isFemale = (g?: string | null): boolean => normalizeGender(g) === 'female';
export const isMale = (g?: string | null): boolean => normalizeGender(g) === 'male';
