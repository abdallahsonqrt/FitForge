import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';

const IS_WEB = Platform.OS === 'web';

/** Envelope every FitForge endpoint responds with (see TransformInterceptor / HttpExceptionFilter). */
interface ApiEnvelope<T> {
  data: T;
  meta: { success: boolean; timestamp: string; error?: unknown };
}

const DEFAULT_API_PORT = 3000;

/**
 * Resolve the API base URL.
 *
 * 1. `EXPO_PUBLIC_API_URL` when set — the only option that survives a release build.
 * 2. In dev, fall back to the Metro host so a phone on the same LAN reaches the
 *    machine running the API instead of its own loopback interface.
 * 3. Loopback, which at least works for the simulator and web.
 */
function resolveBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  if (__DEV__) {
    const hostUri =
      Constants.expoConfig?.hostUri ??
      (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
    const host = hostUri?.split(':')[0];
    if (host) {
      console.warn(
        `[api] EXPO_PUBLIC_API_URL is not set — falling back to the Metro host http://${host}:${DEFAULT_API_PORT}`,
      );
      return `http://${host}:${DEFAULT_API_PORT}`;
    }
  } else {
    console.error('[api] EXPO_PUBLIC_API_URL is not set. Network requests will fail in this build.');
  }

  return `http://localhost:${DEFAULT_API_PORT}`;
}

export const API_BASE_URL = resolveBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
  /**
   * Required for the browser refresh cookie to travel at all: the API is a
   * different origin (`:3000` vs the app's `:8081`), and cross-origin XHR omits
   * cookies unless the caller asks for them. Harmless on native, which has no
   * cookie jar in this app and keeps using the request body.
   */
  withCredentials: true,
});

/** Endpoints that must never trigger the refresh-and-retry loop. */
const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

const isAuthPath = (url?: string) => !!url && AUTH_PATHS.some((path) => url.startsWith(path));

/** The two endpoints that accept a refresh token, by body or by cookie. */
const REFRESH_BEARING_PATHS = ['/auth/refresh', '/auth/logout'];

const isRefreshBearingPath = (url?: string) =>
  !!url && REFRESH_BEARING_PATHS.some((path) => url.startsWith(path));

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken && !isAuthPath(config.url)) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  /**
   * On web the refresh credential is the `HttpOnly` cookie and nothing else. The
   * store carries a marker in `refreshToken` so callers can tell a session
   * exists (see `WEB_REFRESH_IN_COOKIE`), and this strips that marker out before
   * it can reach the wire — the server takes a present body token at face value,
   * so leaving it in would have `/auth/logout` try to revoke a session named by
   * a placeholder instead of falling back to the cookie.
   *
   * Native is untouched: the body is, and remains, how it sends the token.
   */
  if (IS_WEB && isRefreshBearingPath(config.url) && config.data && typeof config.data === 'object') {
    const { refreshToken: _dropped, ...rest } = config.data as Record<string, unknown>;
    config.data = rest;
  }

  return config;
});

/**
 * A single in-flight refresh shared by every request that got a 401, so a burst of
 * parallel queries produces one refresh call rather than one per query.
 */
let refreshPromise: Promise<string | null> | null = null;

/**
 * Trades the refresh credential for a new access token, with no side effect on
 * the session if it fails. The caller decides what a failure means.
 */
async function fetchAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens } = useAuthStore.getState();

  try {
    // Bare axios: the shared instance's interceptors would recurse on failure.
    const response = await axios.post<ApiEnvelope<{ accessToken: string; refreshToken: string }>>(
      `${API_BASE_URL}/auth/refresh`,
      // Web sends no body token: the cookie is the credential. Native sends it
      // in the body exactly as it always has.
      IS_WEB ? {} : { refreshToken },
      {
        timeout: 15_000,
        // This call deliberately bypasses the shared instance, so it does not
        // inherit its config — without this the cookie is not sent and every
        // web refresh would 401.
        withCredentials: true,
      },
    );
    const tokens = response.data.data;
    setTokens(tokens.accessToken, tokens.refreshToken);
    return tokens.accessToken;
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, isAuthenticated, logout } = useAuthStore.getState();

  /**
   * What counts as "we hold a refresh credential" differs by platform.
   *
   * Native holds the token itself, so its absence is decisive. Web holds
   * nothing readable — the credential is an `HttpOnly` cookie — so the only
   * local signal is that a session was established at all; whether the cookie is
   * still there and still valid is a question only the server can answer, and
   * the 401 it returns is what ends the session below.
   */
  const haveCredential = IS_WEB ? isAuthenticated : !!refreshToken;
  const token = haveCredential ? await fetchAccessToken() : null;
  if (!token) logout();
  return token;
}

/**
 * One refresh shared by every request that got a 401, so a burst of parallel
 * queries produces one refresh call rather than one per query.
 */
function sharedRefresh(): Promise<string | null> {
  refreshPromise =
    refreshPromise ??
    refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

/**
 * Web only: get an access token back before the app starts rendering, using the
 * refresh cookie a reload left behind. See `useRestoredAccessToken` in the root
 * layout for why.
 *
 * Deliberately *not* `refreshAccessToken`: this runs while the root layout is
 * still showing its loading state and has no navigator mounted, so a `logout()`
 * here would fire the session-ended redirect into a router that cannot accept
 * it. A failure just resolves to null and the app renders as it would have
 * anyway — the first 401 then takes the ordinary refresh-or-sign-out path, with
 * the navigator up and able to redirect.
 */
export async function restoreAccessToken(): Promise<string | null> {
  const { isAuthenticated } = useAuthStore.getState();
  if (!IS_WEB || !isAuthenticated) return null;
  return fetchAccessToken();
}

api.interceptors.response.use(
  // Unwrap the envelope so callers work with the payload directly.
  (response: AxiosResponse<ApiEnvelope<unknown>>) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'data' in body && 'meta' in body) {
      response.data = body.data as never;
    }
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;

    if (error.response?.status === 401 && original && !original._retried && !isAuthPath(original.url)) {
      original._retried = true;
      const token = await sharedRefresh();
      if (token) {
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api.request(original);
      }
    }

    return Promise.reject(error);
  },
);

/**
 * Whether the server actually rejected the caller's credentials, as opposed to
 * the request never arriving.
 *
 * The distinction matters to any screen that reacts to a failed sign-in by
 * discarding what the user typed: a 401 means the password was wrong and is
 * worth nothing, while a timeout or a dropped connection means it was never
 * judged at all and is still exactly what they meant to send.
 *
 * Lives here because `axios` does — screens read errors through this module
 * rather than importing the HTTP client themselves.
 */
export function isRejectedCredential(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

/** Pull a human-readable message out of whatever the API (or the network stack) threw. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  if (!error.response) {
    return 'Cannot reach the server. Check your connection and try again.';
  }

  /**
   * A 5xx body describes a server-side failure in server-side terms — driver
   * messages, constraint names, stack fragments. None of that helps the person
   * reading it, and it tells an attacker about the schema, so it never reaches
   * the screen regardless of what the server chose to send.
   *
   * 4xx messages are the opposite: "Invalid credentials" and the field-level
   * validation list are written for the user, and are passed through below.
   */
  if (error.response.status >= 500) {
    return 'Something went wrong on our end. Please try again.';
  }

  const apiError = (error.response.data as ApiEnvelope<unknown> | undefined)?.meta?.error;

  if (typeof apiError === 'string') return apiError;
  if (Array.isArray(apiError)) {
    // Zod issue list, or Nest's string[] validation messages.
    const messages = apiError
      .map((issue) => (typeof issue === 'string' ? issue : (issue as { message?: string })?.message))
      .filter(Boolean);
    if (messages.length) return messages.join('\n');
  }

  return error.response.status === 401 ? 'Your session expired. Please sign in again.' : fallback;
}
