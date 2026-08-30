/**
 * The page a deliberate account switch is trying to reach.
 *
 * Signing out has two very different causes, and they want opposite
 * destinations:
 *
 *   - a session *ending* (a refresh token expires, the user taps sign out) should
 *     land on the public landing page;
 *   - a user choosing "sign in with another account" from the unauthorised
 *     screen is mid-journey, and should land back on sign-in still carrying the
 *     page they were trying to open.
 *
 * `useSessionEndedRedirect` cannot tell those apart from the auth state alone —
 * both are simply `authenticated: true -> false` — so the intent is recorded
 * here first and read there.
 *
 * Deliberately module state rather than the auth store: this is navigation
 * intent that lives for one transition, and the store is persisted to MMKV,
 * where a stale value would survive a restart and hijack the next sign-out.
 */
let pending: string | null = null;

export const setPendingDestination = (path: string | null): void => {
  pending = path;
};

/** Reads and clears in one step, so a destination can only be honoured once. */
export const takePendingDestination = (): string | null => {
  const value = pending;
  pending = null;
  return value;
};
