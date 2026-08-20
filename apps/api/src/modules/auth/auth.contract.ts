/**
 * The token contract, shared by everything that mints or accepts a FitForge JWT.
 *
 * Access and refresh tokens used to be indistinguishable — same claims, same
 * secret, different `exp` — which meant a 7-day refresh token authenticated any
 * endpoint a 15-minute access token did. Three things keep them apart now, and
 * all three have to hold:
 *
 *   1. **Different secrets.** Access tokens are signed with `JWT_SECRET`,
 *      refresh tokens with `JWT_REFRESH_SECRET`. A refresh token presented as a
 *      Bearer credential fails signature verification before any code runs.
 *   2. **A `typ` claim.** Belt and braces for (1), and the thing that makes the
 *      intent readable when debugging a token by eye.
 *   3. **A `sid` claim** naming the `devices` row the token belongs to. It makes
 *      a token revocable — delete the row and every token bound to it dies at
 *      once — and it tells `refresh()` which session to rotate without having to
 *      search on the token string.
 *
 * `jti` is a per-token nonce, and it is not optional. `iat` has one-second
 * resolution, so without it two tokens minted for one session in the same second
 * are the same string — which is how rotation came to be a no-op: `refresh()`
 * handed back the token it was meant to be replacing, and the "spent" one stayed
 * valid for its full seven days.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export type TokenType = 'access' | 'refresh';

interface BaseTokenPayload {
  /** The user's id. */
  sub: string;
  email: string;
  typ: TokenType;
  /** `devices.id` — the session this token was issued to. */
  sid: string;
  /** Random per issue, so no two tokens are ever the same string. */
  jti: string;
  iat?: number;
  exp?: number;
}

export interface AccessTokenPayload extends BaseTokenPayload {
  typ: 'access';
}

export interface RefreshTokenPayload extends BaseTokenPayload {
  typ: 'refresh';
}

/**
 * Lifetimes, in seconds, and the one place they are written down.
 *
 * `jsonwebtoken` reads `<n>s` as n seconds, so the string forms below are the
 * same numbers — which matters because the refresh cookie's `Max-Age` has to
 * expire with the token it carries, not on its own schedule.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export const ACCESS_TOKEN_TTL = `${ACCESS_TOKEN_TTL_SECONDS}s`;
export const REFRESH_TOKEN_TTL = `${REFRESH_TOKEN_TTL_SECONDS}s`;

/**
 * What `devices.refresh_token` actually stores.
 *
 * The column used to hold the raw JWT, which made a read of that one column —
 * a backup, a replica, a logged query, an ORM dump — an issue of working 7-day
 * credentials for every signed-in user. It now holds a digest: enough to answer
 * "is this the token I issued?", useless as a credential.
 *
 * SHA-256 rather than argon2/bcrypt on purpose. A slow KDF exists to make
 * *guessing* the input expensive, and the input here is a 256-bit-entropy signed
 * token that no one is going to guess. What is left is preimage resistance,
 * which SHA-256 has, and it costs microseconds on a path every API call's
 * refresh depends on.
 */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

/**
 * Compares a stored digest with a freshly computed one without leaking, through
 * timing, how many leading characters matched. Cheap insurance: both operands
 * are fixed-length hex, so a length mismatch is already a mismatch.
 */
export const refreshTokenMatches = (
  storedDigest: string | null | undefined,
  presentedToken: string,
): boolean => {
  if (!storedDigest) return false;
  const stored = Buffer.from(storedDigest, 'utf8');
  const presented = Buffer.from(hashRefreshToken(presentedToken), 'utf8');
  return stored.length === presented.length && timingSafeEqual(stored, presented);
};

/**
 * Addresses are compared and stored in one canonical form. The database backs
 * this with a unique index on `lower(email)` (migration `0007_auth_sessions`),
 * so a race between two sign-ups cannot slip a second casing through.
 */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Claims arrive from a verified-but-untrusted token, and `id = $1` against a
 * `uuid` column raises a Postgres error rather than returning no rows when the
 * value is not a UUID. Checking the shape first keeps a malformed token a 401
 * instead of a 500.
 */
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);
