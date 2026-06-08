import { prisma } from '../db';
import { authUserCache } from './memCache';

// Access-token kill-switch (audit 2026-06-07 M1).
//
// Access tokens are stateless 60-min JWTs that authenticate() validates without a DB
// lookup of any per-user invalidation marker. Revoking refresh tokens alone therefore
// leaves already-issued access tokens valid until they expire (up to 60 min) — so
// "log out everywhere" / password reset after a leak did not actually cut off an
// attacker who already holds an access token.
//
// Call this ALONGSIDE the existing refresh-token revocation at every revoke-all site
// (logout-all, password change + reset, 2FA disable, email + phone change). It stamps
// User.tokensValidAfter = now() — authenticate() rejects any access token whose `iat`
// predates it — and busts the 60s authUserCache so the new value is seen immediately.
export async function invalidateAccessTokens(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { tokensValidAfter: new Date() },
  });
  authUserCache.delete(userId);
}
