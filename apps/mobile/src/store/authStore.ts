import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '../lib/storage';
import type { User } from '../features/users/types';

const IS_WEB = Platform.OS === 'web';

/**
 * Whether the short-lived access token is written to disk alongside the session.
 *
 * On native, MMKV is app-private storage, so persisting it is both safe and worth
 * it: a cold start can call the API immediately instead of spending a refresh
 * round-trip first.
 *
 * On web, storage is `localStorage`, which every script on the page can read, so
 * the access token is held in memory only. Reloads still work: `isAuthenticated`
 * survives and the refresh cookie mints a fresh access token during rehydration
 * (see `onRehydrateStorage` below).
 */
const PERSIST_ACCESS_TOKEN = !IS_WEB;

/**
 * On web the refresh token is never in JavaScript's hands at all — the API sends
 * it as an `HttpOnly` cookie scoped to `/auth`, which the browser attaches to
 * `/auth/refresh` and `/auth/logout` by itself and which no script can read.
 *
 * The store still needs to answer "is there a refresh credential?", because that
 * is what tells the client whether a session is worth trying to restore and
 * whether logout has anything to revoke. So on web this field holds a marker
 * rather than a secret. It is deliberately not a token: it is never persisted,
 * never sent, and `lib/api.ts` strips it out of any request body before it can
 * leave. Anything that reaches the network on web comes from the cookie.
 *
 * Native is unchanged and stays that way: the real token lives here, is
 * persisted to MMKV, and travels in the request body.
 */
export const WEB_REFRESH_IN_COOKIE = '__httponly_cookie__';

const asStoredRefreshToken = (refreshToken: string | null | undefined) =>
  IS_WEB ? WEB_REFRESH_IN_COOKIE : (refreshToken ?? null);

/**
 * Why a session ended.
 *
 * Signing out has two causes that want opposite destinations, and the auth state
 * alone cannot tell them apart -- both are simply `isAuthenticated: true ->
 * false`. Recording the cause with the sign-out means one decision is made at
 * the call site that knows the answer, instead of one behaviour navigating and
 * another racing to override it.
 *
 * `ended`     - the session finished: the user signed out, or a refresh token
 *               expired under them. Destination is the public landing page.
 * `switching` - a deliberate account switch that is mid-journey. `intended` is
 *               the page that prompted it, carried through sign-in.
 */
export type LogoutReason =
  | { kind: 'ended' }
  | { kind: 'switching'; intended?: string };

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** False until the persisted session has been read back from disk. */
  hydrated: boolean;
  isAuthenticated: boolean;
  isOnboarded: boolean;
  /**
   * Why the last sign-out happened, read once by `useSessionEndedRedirect` and
   * then cleared. Absent from `partialize`, so it is never written to disk: a
   * stale value surviving a restart would hijack the next sign-out.
   */
  logoutReason: LogoutReason | null;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: User) => void;
  signIn: (tokens: { accessToken: string; refreshToken: string }, user: User) => void;
  logout: (reason?: LogoutReason) => void;
  clearLogoutReason: () => void;
  setHydrated: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hydrated: false,
      isAuthenticated: false,
      isOnboarded: false,
      logoutReason: null,
      setTokens: (accessToken, refreshToken) =>
        set({
          accessToken,
          refreshToken: asStoredRefreshToken(refreshToken),
          isAuthenticated: true,
        }),
      setUser: (user) => set({ user, isOnboarded: user.onboardingComplete }),
      signIn: (tokens, user) =>
        set({
          // A fresh session leaves no sign-out to react to.
          logoutReason: null,
          accessToken: tokens.accessToken,
          refreshToken: asStoredRefreshToken(tokens.refreshToken),
          user,
          isAuthenticated: true,
          isOnboarded: user.onboardingComplete,
        }),
      /**
       * The reason is set in the same update as the cleared session, so anything
       * reacting to the sign-out sees both at once and cannot act on a
       * half-applied state.
       */
      logout: (reason = { kind: 'ended' }) =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isOnboarded: false,
          logoutReason: reason,
        }),
      clearLogoutReason: () => set({ logoutReason: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => zustandStorage),
      // `hydrated` is a runtime flag, never restored from disk. Neither token is
      // written on web — see PERSIST_ACCESS_TOKEN and WEB_REFRESH_IN_COOKIE.
      partialize: ({ user, accessToken, refreshToken, isAuthenticated, isOnboarded }) => ({
        user,
        ...(PERSIST_ACCESS_TOKEN ? { accessToken, refreshToken } : null),
        isAuthenticated,
        isOnboarded,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
