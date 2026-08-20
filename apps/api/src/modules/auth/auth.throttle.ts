/**
 * Per-IP request ceilings for the unauthenticated auth endpoints.
 *
 * These are flood brakes, not the anti-brute-force measure. The limit that
 * actually costs a password guesser is `LoginThrottleService`, which counts
 * consecutive *failures* per account. That split is deliberate: a per-IP budget
 * tight enough to stop guessing also 429s a household behind one NAT and a
 * legitimate user retrying a typo, and it is defeated outright by spreading the
 * guesses across hosts. So the IP limit is set where no real client reaches it,
 * and the failure counter carries the load.
 *
 * ─── Why the numbers moved up ────────────────────────────────────────
 *
 * `TRUST_PROXY` defaults to `false`, and correctly so — believing a forgeable
 * `X-Forwarded-For` would let any client mint a fresh bucket per request. But it
 * means "the client" is whatever address Express sees, and that address is very
 * often *many* people:
 *
 *   - behind a load balancer with `TRUST_PROXY` left unset, it is every user of
 *     the deployment sharing one bucket;
 *   - behind an office NAT or a carrier-grade NAT, it is hundreds to thousands
 *     of subscribers sharing one bucket, and no configuration fixes that.
 *
 * At the old 30/min a refresh ceiling covered roughly 450 concurrent users on
 * one egress address (a 15-minute access token means ~4 refreshes per user per
 * hour); at 10/min the register ceiling could not seat a bootcamp cohort signing
 * up together. The failure of these limits is a total outage for everyone behind
 * that address, and it looks exactly like the API being down.
 *
 * Nothing here weakens per-account protection. Registration abuse in particular
 * is not an IP-counter problem — the control for it is email verification, which
 * this API does not yet have; see the note in the report.
 */

export interface AuthRateLimits {
  login: number;
  register: number;
  refresh: number;
  /** Window every limit above is measured over, in milliseconds. */
  ttlMs: number;
}

/**
 * Defaults, and the only place they are written down — `config/env.ts` validates
 * the shape of the overrides but deliberately supplies no default of its own, so
 * there is no second copy to drift.
 */
export const AUTH_RATE_LIMIT_DEFAULTS: AuthRateLimits = {
  login: 300,
  register: 30,
  refresh: 300,
  ttlMs: 60_000,
};

export const AUTH_RATE_LIMIT_ENV_KEYS = {
  login: 'AUTH_LOGIN_RATE_LIMIT',
  register: 'AUTH_REGISTER_RATE_LIMIT',
  refresh: 'AUTH_REFRESH_RATE_LIMIT',
  ttlMs: 'AUTH_RATE_LIMIT_TTL_MS',
} as const satisfies Record<keyof AuthRateLimits, string>;

const readPositiveInt = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const value = Number(raw.trim());
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const resolve = (env: NodeJS.ProcessEnv): AuthRateLimits => ({
  login: readPositiveInt(env[AUTH_RATE_LIMIT_ENV_KEYS.login], AUTH_RATE_LIMIT_DEFAULTS.login),
  register: readPositiveInt(env[AUTH_RATE_LIMIT_ENV_KEYS.register], AUTH_RATE_LIMIT_DEFAULTS.register),
  refresh: readPositiveInt(env[AUTH_RATE_LIMIT_ENV_KEYS.refresh], AUTH_RATE_LIMIT_DEFAULTS.refresh),
  ttlMs: readPositiveInt(env[AUTH_RATE_LIMIT_ENV_KEYS.ttlMs], AUTH_RATE_LIMIT_DEFAULTS.ttlMs),
});

let cached: AuthRateLimits | null = null;

/**
 * Read on first use, not at import time.
 *
 * `@Throttle()` is evaluated while `auth.controller.ts` is being imported, which
 * happens *before* `ConfigModule.forRoot()` runs and loads `.env` — so reading
 * the environment at module scope would silently see only the defaults. The
 * throttler accepts a `Resolvable<number>` (a function called per request), so
 * the decorators below pass thunks and the values are read on the first request
 * instead, by which point the environment is fully populated. Memoised
 * afterwards: this is on the hot path of every sign-in.
 */
export const authRateLimits = (): AuthRateLimits => (cached ??= resolve(process.env));

/** Test seam — forces the next `authRateLimits()` call to re-read the environment. */
export const resetAuthRateLimits = () => {
  cached = null;
};

/** The `@Throttle()` argument for one endpoint, resolved per request. */
export const throttleFor = (endpoint: 'login' | 'register' | 'refresh') => ({
  default: {
    limit: () => authRateLimits()[endpoint],
    ttl: () => authRateLimits().ttlMs,
  },
});
