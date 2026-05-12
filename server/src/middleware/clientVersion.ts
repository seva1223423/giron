import type { Request, Response, NextFunction } from 'express';

/**
 * Client version gate (CLIENT-VERSION-01).
 *
 * Lets the server reject API requests from clients that are too old to
 * speak the current contract — the alternative is silent breakage when an
 * old APK in the wild calls a route whose response shape changed.
 *
 * Wire this middleware *after* CORS + body parsing, *before* route
 * handlers, so 426 reaches the client through the same response pipeline
 * as any other status.
 *
 * Headers consumed:
 *   X-Client-Version  — semver string (e.g. "1.2.3"). Set by the client's
 *                       axios interceptor from app.json#expo.version.
 *   X-Client-Platform — optional ("android" | "ios"). Used purely for
 *                       diagnostic logging in the 426 response so the
 *                       UI can deep-link to the right store.
 *
 * Env:
 *   MIN_CLIENT_VERSION — semver string. Requests below this get 426.
 *                        Defaults to "0.0.0" (no gate) when unset, so
 *                        adding the middleware never breaks an existing
 *                        deployment that hasn't configured a floor yet.
 *
 * Routes left open: /health/*, /api/auth/* (so users with stale clients
 * can still log in to find the update prompt), /admin/digest/readiness
 * (used for ops checks pre-deploy). Everything else gates.
 */

const OPEN_PATH_PREFIXES = [
  '/health',
  '/api/health',
  '/api/auth',
  '/api/admin/digest/readiness',
];

/** Pure semver compare. Returns -1, 0, +1 like String.localeCompare.
 *  Tolerates missing parts ("1" → "1.0.0") and ignores prerelease tags
 *  ("1.2.3-beta.1" → "1.2.3"). Non-numeric segments collapse to 0 so a
 *  malformed header can never crash the gate. */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => {
    const cleaned = v.split('-')[0]?.split('+')[0] ?? '0';
    const parts = cleaned.split('.').map((p) => {
      const n = parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
  };
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 < b1 ? -1 : 1;
  if (a2 !== b2) return a2 < b2 ? -1 : 1;
  if (a3 !== b3) return a3 < b3 ? -1 : 1;
  return 0;
}

export function clientVersionGate(req: Request, res: Response, next: NextFunction) {
  // Open paths bypass the gate entirely. Without this an old client that
  // can't even authenticate has no way to discover it needs to update.
  if (OPEN_PATH_PREFIXES.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const minVersion = process.env.MIN_CLIENT_VERSION?.trim();
  if (!minVersion || minVersion === '0.0.0') {
    // Gate disabled — most realistic state during pre-launch and the
    // first weeks after launch where we want zero false-positive rejects.
    return next();
  }

  const clientVersion = (req.header('x-client-version') ?? '').trim();

  // Empty / missing X-Client-Version is treated as "unknown" — we let
  // it through on purpose. Browser/curl/server-to-server callers don't
  // send the header, and gating them would break the admin curl path
  // and any future webhook handlers.
  if (!clientVersion) {
    return next();
  }

  if (compareSemver(clientVersion, minVersion) < 0) {
    const platform = (req.header('x-client-platform') ?? '').trim().toLowerCase();
    return res.status(426).json({
      error: 'Версия приложения устарела. Обнови, чтобы продолжить.',
      code: 'CLIENT_TOO_OLD',
      clientVersion,
      minVersion,
      // Hint for the client UI — direct it to the right store. Falls
      // back to a generic prompt if platform is unknown. Round 191:
      // bundle id changed to com.giron.app — old APK users will still
      // get a valid RuStore link (the page may 404 until the new
      // listing publishes; old com.giron.app listing was never
      // published, so no break).
      updateUrl:
        platform === 'android'
          ? 'https://www.rustore.ru/catalog/app/com.giron.app'
          : platform === 'ios'
            ? 'https://apps.apple.com/app/giron/id000000000'
            : null,
    });
  }

  return next();
}
