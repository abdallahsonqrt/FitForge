import { z } from 'zod';

/** Bytes, so the limits below read as numbers rather than arithmetic. */
const MB = 1024 * 1024;

/**
 * An optional setting that may be present but blank.
 *
 * `.env.example` ships every optional key as `KEY=""` so it is visible and easy
 * to fill in. dotenv reads that as an empty string, which is *present* — so
 * `.optional()` alone would not save it from the `min(1)` or `url()` rule and the
 * app would refuse to boot over a setting nobody uses. Blank means unset.
 */
const blankAsUnset = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),

  /**
   * Browser origins allowed to call this API, comma-separated.
   *
   * CORS is a *browser* mechanism: native iOS/Android clients send no `Origin`
   * header at all and are unaffected by anything listed here, so this list only
   * ever needs to name web front-ends. The default covers the Expo dev server
   * (`:8081` for Metro web, `:19006` for the classic webpack target) so a fresh
   * checkout runs without configuration; production must set it explicitly.
   */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:8081,http://localhost:19006')
    .transform((raw) =>
      raw
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    ),

  /**
   * Express's `trust proxy` setting — whether `X-Forwarded-For` is believed.
   *
   * This is what `@Ip()` and the login throttler's tracker read, so both
   * directions are dangerous and neither may be guessed:
   *  - trusting a proxy that is not in front of the app lets any client forge
   *    `X-Forwarded-For` and mint a fresh rate-limit bucket per request, which
   *    silently disables the brute-force protection on `/auth/login`;
   *  - not trusting a proxy that *is* in front of it makes every request look
   *    like it came from the load balancer, so the entire internet shares one
   *    bucket and a single attacker 429s everybody.
   *
   * Default `false`: the only setting that is safe with no knowledge of the
   * deployment — it cannot be spoofed. Set it per environment:
   *   `1` (or the real hop count) behind an ALB/nginx — Express then counts
   *   hops from the trusted right-hand end of the header;
   *   `loopback`, a CIDR, or a comma-separated list of proxy addresses;
   *   `true` only when something upstream is guaranteed to overwrite the header.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((raw): boolean | number | string => {
      const value = raw.trim();
      if (value === '' || value.toLowerCase() === 'false') return false;
      if (value.toLowerCase() === 'true') return true;
      if (/^\d+$/.test(value)) return Number(value);
      return value;
    }),
  /**
   * Per-IP ceilings for the unauthenticated auth endpoints, per window.
   *
   * Left unset they fall back to the defaults in
   * `modules/auth/auth.throttle.ts`, which is where the numbers and the
   * reasoning behind them live — including why `TRUST_PROXY=false` means the
   * bucket these count against is frequently a whole office or a carrier-grade
   * NAT rather than one person. Declared here without defaults on purpose: two
   * copies of a default is one copy too many, and the job of this schema is to
   * refuse to boot on a malformed override.
   *
   * These are flood brakes. The measure that actually stops password guessing is
   * the per-account failure counter in `LoginThrottleService`, which no setting
   * here can weaken.
   */
  AUTH_LOGIN_RATE_LIMIT: blankAsUnset(z.coerce.number().int().min(1).optional()),
  AUTH_REGISTER_RATE_LIMIT: blankAsUnset(z.coerce.number().int().min(1).optional()),
  AUTH_REFRESH_RATE_LIMIT: blankAsUnset(z.coerce.number().int().min(1).optional()),
  AUTH_RATE_LIMIT_TTL_MS: blankAsUnset(z.coerce.number().int().min(1000).optional()),

  /**
   * How the browser refresh-token cookie is scoped.
   *
   * `SameSite` is a *site* rule, not an origin rule: `localhost:8081` calling
   * `localhost:3000`, or `app.example.com` calling `api.example.com`, is
   * same-site, so `lax` is correct for development and for subdomain
   * deployments — and it keeps some CSRF protection. A genuinely cross-site
   * split (different registrable domains) needs `none`, which browsers only
   * honour alongside `Secure`; asking for it therefore forces `Secure` on
   * regardless of what `AUTH_REFRESH_COOKIE_SECURE` says.
   *
   * `AUTH_REFRESH_COOKIE_SECURE` defaults to on in production and off otherwise,
   * because a `Secure` cookie is silently dropped over plain http and local
   * development is plain http.
   */
  AUTH_REFRESH_COOKIE_SAMESITE: blankAsUnset(z.enum(['lax', 'strict', 'none']).default('lax')),
  AUTH_REFRESH_COOKIE_SECURE: blankAsUnset(
    z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  ),

  /**
   * Whether `POST /subscriptions/upgrade` may move a user onto a paid tier with
   * no payment. That route is a mock purchase path — it grants the full
   * entitlement set to anyone holding a plan id, and plan ids are handed out by
   * `GET /subscriptions/plans`.
   *
   * Off in production unless set explicitly, so shipping without a billing
   * provider cannot silently give the paid product away. Development and demo
   * environments keep working as before.
   */
  ALLOW_UNPAID_UPGRADES: blankAsUnset(
    z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  ),

  /**
   * Where a password-reset link points. The mobile app deep-links
   * `<APP_PUBLIC_URL>/reset-password?token=…`, so this is the app scheme in
   * development (`fitforge://`) and the public web origin once one exists.
   */
  APP_PUBLIC_URL: blankAsUnset(z.string().min(1).optional()),

  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  JWT_REFRESH_SECRET: z.string().min(10),
  OPENAI_API_KEY: blankAsUnset(z.string().startsWith('sk-').optional()),
  /**
   * USDA FoodData Central key for the primary food database. Optional — without
   * it the food search falls back to Open Food Facts alone, which needs no key.
   */
  USDA_FDC_API_KEY: blankAsUnset(z.string().min(1).optional()),

  // ─── Media storage ──────────────────────────────────────
  /**
   * Which storage backend holds exercise media. Only the provider named here is
   * constructed, and nothing outside `src/storage` knows which one it is.
   */
  STORAGE_PROVIDER: z.enum(['r2', 's3', 'gcs']).default('r2'),

  /**
   * Cloudflare R2 credentials. Optional so the API still boots without them —
   * media *reads* keep working from stored URLs, and any upload or signing call
   * fails with a clear "storage is not configured" error instead of a stack
   * trace at startup.
   */
  R2_ACCOUNT_ID: blankAsUnset(z.string().min(1).optional()),
  R2_ACCESS_KEY_ID: blankAsUnset(z.string().min(1).optional()),
  R2_SECRET_ACCESS_KEY: blankAsUnset(z.string().min(1).optional()),
  R2_BUCKET: blankAsUnset(z.string().min(1).optional()),
  /** Overrides the derived `https://<account>.r2.cloudflarestorage.com` endpoint. */
  R2_ENDPOINT: blankAsUnset(z.string().url().optional()),
  /**
   * Public base URL objects are served from — an R2 custom domain, or the bucket's
   * `*.r2.dev` address. Leave empty to keep the bucket private, in which case
   * every playback URL is signed and short-lived.
   */
  R2_PUBLIC_BASE_URL: blankAsUnset(z.string().url().optional()),

  /**
   * Visibility for newly uploaded media. `public` serves instructional videos
   * straight from the CDN edge (cheapest, fastest, cacheable); `private` forces
   * signed URLs for every playback.
   */
  MEDIA_DEFAULT_VISIBILITY: z.enum(['public', 'private']).default('public'),
  /** Lifetime of a signed playback URL. SigV4 caps this at 7 days. */
  MEDIA_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(604800).default(3600),
  /** Lifetime of a direct-to-bucket upload URL — minutes, not hours. */
  MEDIA_UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(43200).default(900),
  MEDIA_MAX_VIDEO_BYTES: z.coerce.number().int().min(MB).default(100 * MB),
  MEDIA_MAX_IMAGE_BYTES: z.coerce.number().int().min(64 * 1024).default(5 * MB),
  /** Key namespace inside the bucket, so media can share a bucket with other data. */
  MEDIA_KEY_PREFIX: z.string().default('exercises'),

  /**
   * ffmpeg/ffprobe binaries, used to read a video's real duration and dimensions
   * and to cut a poster frame. Resolved from the bundled `ffmpeg-static` /
   * `ffprobe-static` packages, then `PATH`, unless set here. Without them uploads
   * still succeed — they just arrive without measurements or an auto thumbnail.
   */
  FFMPEG_PATH: blankAsUnset(z.string().min(1).optional()),
  FFPROBE_PATH: blankAsUnset(z.string().min(1).optional()),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>) => {
  return envSchema.parse(config);
};
