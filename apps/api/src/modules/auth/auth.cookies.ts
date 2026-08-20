import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_TOKEN_TTL_SECONDS } from './auth.contract';

/**
 * Refresh-token delivery for *browser* clients.
 *
 * On web, a refresh token in `localStorage` is readable by any script that gets
 * onto the page — one XSS and an attacker walks away with seven days of
 * credentials that survive the tab closing. An `HttpOnly` cookie is not readable
 * by JavaScript at all, so the same XSS can only *use* the session while the
 * page is open rather than exfiltrate it.
 *
 * ─── Native clients must be untouched ────────────────────────────────
 *
 * React Native has no cookie jar in this app: the mobile client sends and
 * receives the refresh token in the JSON body and always will. So the cookie is
 * *added* for browsers, never substituted for the body, and the detection has to
 * be positive evidence of a browser rather than an assumption.
 *
 * `Origin` is that evidence. Browsers attach it to every cross-origin request
 * and to every same-origin POST; they do not let a page forge or suppress it.
 * React Native's fetch sends no `Origin` at all. A missing header therefore
 * means "not a browser", which is the safe direction to be wrong in — a native
 * client that somehow sent one would receive a cookie it simply ignores.
 */

/** Name is prefixed so it cannot collide with anything else on `localhost`. */
export const REFRESH_COOKIE = 'ff_refresh_token';

/**
 * Scoped to `/auth`: the cookie is only ever needed by `/auth/refresh` and
 * `/auth/logout`, so no other endpoint receives a copy of it on every request.
 */
const REFRESH_COOKIE_PATH = '/auth';

export type SameSitePolicy = 'lax' | 'strict' | 'none';

export interface RefreshCookiePolicy {
  sameSite: SameSitePolicy;
  secure: boolean;
}

/**
 * `SameSite` is a *site* rule, not an origin rule: `localhost:8081` and
 * `localhost:3000` differ only by port, which does not make them cross-site, and
 * neither does `app.example.com` versus `api.example.com`. `Lax` therefore works
 * for development and for any subdomain deployment, and it is the setting that
 * still gives some CSRF protection.
 *
 * A genuinely cross-site production split (`app.example.com` calling
 * `api.otherdomain.com`) needs `None`, which browsers only honour together with
 * `Secure` — so asking for `None` turns `Secure` on regardless of `NODE_ENV`,
 * because the alternative is a cookie the browser silently drops.
 */
export const resolveRefreshCookiePolicy = (config: ConfigService): RefreshCookiePolicy => {
  const sameSite = (
    config.get<string>('AUTH_REFRESH_COOKIE_SAMESITE') ?? 'lax'
  ).toLowerCase() as SameSitePolicy;

  const explicitSecure = config.get<boolean | undefined>('AUTH_REFRESH_COOKIE_SECURE');
  const secure =
    sameSite === 'none'
      ? true
      : (explicitSecure ?? config.get<string>('NODE_ENV') === 'production');

  return { sameSite, secure };
};

/** Positive evidence that the caller is a browser. See the header comment. */
export const isBrowserClient = (req: Request): boolean => {
  const origin = req.headers.origin;
  return typeof origin === 'string' && origin.trim().length > 0;
};

/**
 * Reads the refresh cookie off the raw `Cookie` header.
 *
 * Parsed here rather than with `cookie-parser` middleware: this is the only
 * cookie the API reads, and a global parser would attach a `req.cookies` object
 * to every request in the product for the benefit of two endpoints.
 */
export const readRefreshCookie = (req: Request): string | undefined => {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== REFRESH_COOKIE) continue;

    const raw = part.slice(separator + 1).trim();
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      // A value we did not write. Treat it as absent rather than 500.
      return raw;
    }
  }

  return undefined;
};

const baseOptions = (policy: RefreshCookiePolicy): CookieOptions => ({
  httpOnly: true,
  sameSite: policy.sameSite,
  secure: policy.secure,
  path: REFRESH_COOKIE_PATH,
});

/**
 * Delivers the refresh token as a cookie, for browsers only.
 *
 * The token is *also* still in the response body. That is not an oversight: the
 * shipped web client reads it from there today, and removing it before that
 * client stops persisting it would sign every web user out. The body copy comes
 * out in the same change that adds `withCredentials` on the client side.
 */
export const setRefreshCookie = (
  req: Request,
  res: Response,
  refreshToken: string,
  policy: RefreshCookiePolicy,
): boolean => {
  if (!isBrowserClient(req)) return false;

  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseOptions(policy),
    // Expires with the token it carries, so a browser never holds a cookie that
    // the server would reject anyway.
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  return true;
};

/**
 * Clears the cookie on logout. Sent unconditionally — a native client has no
 * cookie jar to be confused by a `Set-Cookie` it never asked for, and the
 * attributes must match those it was set with or the browser keeps the old one.
 */
export const clearRefreshCookie = (res: Response, policy: RefreshCookiePolicy) => {
  res.clearCookie(REFRESH_COOKIE, baseOptions(policy));
};
