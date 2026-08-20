import { describe, expect, it, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  ACCESS_TOKEN_TTL,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL,
  REFRESH_TOKEN_TTL_SECONDS,
  hashRefreshToken,
  refreshTokenMatches,
} from './auth.contract';
import {
  AUTH_RATE_LIMIT_DEFAULTS,
  AUTH_RATE_LIMIT_ENV_KEYS,
  authRateLimits,
  resetAuthRateLimits,
} from './auth.throttle';
import { readRefreshCookie, isBrowserClient, REFRESH_COOKIE } from './auth.cookies';
import type { Request } from 'express';

const A_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4YyJ9.c2lnbmF0dXJlLWdvZXMtaGVyZQ';

describe('refresh token storage', () => {
  it('stores a SHA-256 digest, never anything token-shaped', () => {
    const digest = hashRefreshToken(A_TOKEN);

    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(createHash('sha256').update(A_TOKEN, 'utf8').digest('hex'));
    // The whole point: what lands in the column cannot be decoded back into a
    // credential, and does not even look like one.
    expect(digest.split('.')).toHaveLength(1);
    expect(digest).not.toContain(A_TOKEN.split('.')[1]);
  });

  it('is stable, so a rotated token can be recognised on the next call', () => {
    expect(hashRefreshToken(A_TOKEN)).toBe(hashRefreshToken(A_TOKEN));
  });

  it('separates tokens that differ by a single character', () => {
    expect(hashRefreshToken(A_TOKEN)).not.toBe(hashRefreshToken(`${A_TOKEN}x`));
  });

  describe('refreshTokenMatches', () => {
    it('accepts the token the digest was made from', () => {
      expect(refreshTokenMatches(hashRefreshToken(A_TOKEN), A_TOKEN)).toBe(true);
    });

    it('rejects a different token', () => {
      expect(refreshTokenMatches(hashRefreshToken(A_TOKEN), `${A_TOKEN}x`)).toBe(false);
    });

    it('rejects a session that has no stored digest rather than matching everything', () => {
      // A row with a null token is a device registration, not a session. Falsy
      // handling here is what stops `undefined === undefined` authenticating.
      expect(refreshTokenMatches(null, A_TOKEN)).toBe(false);
      expect(refreshTokenMatches(undefined, A_TOKEN)).toBe(false);
      expect(refreshTokenMatches('', A_TOKEN)).toBe(false);
    });

    it('rejects a stored value of the wrong length without throwing', () => {
      // `timingSafeEqual` raises on mismatched lengths; a legacy plaintext row
      // must be a failed match, not a 500.
      expect(refreshTokenMatches(A_TOKEN, A_TOKEN)).toBe(false);
    });
  });
});

describe('token lifetimes', () => {
  it('expresses the TTLs as the seconds the cookie Max-Age is derived from', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(604800);
    expect(ACCESS_TOKEN_TTL).toBe('900s');
    expect(REFRESH_TOKEN_TTL).toBe('604800s');
  });
});

describe('auth rate limits', () => {
  beforeEach(() => {
    for (const key of Object.values(AUTH_RATE_LIMIT_ENV_KEYS)) delete process.env[key];
    resetAuthRateLimits();
  });

  it('falls back to the documented defaults when nothing is configured', () => {
    expect(authRateLimits()).toEqual(AUTH_RATE_LIMIT_DEFAULTS);
  });

  it('reads overrides from the environment', () => {
    process.env[AUTH_RATE_LIMIT_ENV_KEYS.login] = '42';
    process.env[AUTH_RATE_LIMIT_ENV_KEYS.ttlMs] = '30000';
    resetAuthRateLimits();

    expect(authRateLimits().login).toBe(42);
    expect(authRateLimits().ttlMs).toBe(30_000);
    expect(authRateLimits().register).toBe(AUTH_RATE_LIMIT_DEFAULTS.register);
  });

  it('ignores a nonsensical override rather than disabling the brake', () => {
    // A limit of 0 or -1 would 429 every request, or throttle nothing at all.
    for (const bad of ['0', '-5', 'abc', '']) {
      process.env[AUTH_RATE_LIMIT_ENV_KEYS.login] = bad;
      resetAuthRateLimits();
      expect(authRateLimits().login).toBe(AUTH_RATE_LIMIT_DEFAULTS.login);
    }
  });

  it('is memoised, because it is read on every sign-in', () => {
    const first = authRateLimits();
    process.env[AUTH_RATE_LIMIT_ENV_KEYS.login] = '7';
    expect(authRateLimits()).toBe(first);
  });
});

const requestWith = (headers: Record<string, string | undefined>) =>
  ({ headers }) as unknown as Request;

describe('refresh cookie', () => {
  it('treats a request carrying an Origin as a browser, and one without as native', () => {
    expect(isBrowserClient(requestWith({ origin: 'http://localhost:8081' }))).toBe(true);
    // React Native sends no Origin. Getting this wrong in this direction would
    // hand a native client a cookie it ignores; the other direction would break
    // the only refresh path it has.
    expect(isBrowserClient(requestWith({}))).toBe(false);
    expect(isBrowserClient(requestWith({ origin: '  ' }))).toBe(false);
  });

  it('finds the refresh cookie among others', () => {
    const req = requestWith({ cookie: `theme=dark; ${REFRESH_COOKIE}=${A_TOKEN}; sid=abc` });
    expect(readRefreshCookie(req)).toBe(A_TOKEN);
  });

  it('does not confuse a cookie whose name merely ends with the same text', () => {
    const req = requestWith({ cookie: `not_${REFRESH_COOKIE}=nope` });
    expect(readRefreshCookie(req)).toBeUndefined();
  });

  it('returns nothing when there is no cookie header or no value', () => {
    expect(readRefreshCookie(requestWith({}))).toBeUndefined();
    expect(readRefreshCookie(requestWith({ cookie: `${REFRESH_COOKIE}=` }))).toBeUndefined();
    expect(readRefreshCookie(requestWith({ cookie: 'garbage' }))).toBeUndefined();
  });
});
