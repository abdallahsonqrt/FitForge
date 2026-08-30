import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';

/**
 * Sends the app back to the public landing page whenever a session ends.
 *
 * Signing out is the obvious case, but the one that used to strand people is a
 * session ending on its own: when a refresh token expires, the API client logs
 * out from under whatever screen is on top, and without this the user sat on a
 * settings or workout screen whose queries could no longer load anything.
 *
 * Only the signed-in → signed-out transition redirects, so the landing page and
 * the auth screens stay reachable for someone who was never signed in.
 */
export const useSessionEndedRedirect = () => {
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const logoutReason = useAuthStore((state) => state.logoutReason);
  const clearLogoutReason = useAuthStore((state) => state.clearLogoutReason);
  const wasAuthenticated = useRef(authenticated);

  useEffect(() => {
    const ended = wasAuthenticated.current && !authenticated;
    wasAuthenticated.current = authenticated;
    if (!ended) return;

    // Drop the screens the session left behind first. The group layouts turn a
    // back gesture into a redirect on their own, but the screens stacked at the
    // root — settings, a workout in progress — have no such guard.
    if (router.canDismiss()) router.dismissAll();

    /**
     * A deliberate account switch is also a signed-in → signed-out transition,
     * but it is mid-journey: the user asked for a page, was told this account
     * cannot open it, and chose to sign in as one that can. The sign-out says
     * which of the two happened, so this reads that rather than guessing.
     */
    if (logoutReason?.kind === 'switching' && logoutReason.intended) {
      const next = encodeURIComponent(logoutReason.intended);
      router.replace(`/(auth)/login?next=${next}` as never);
    } else if (logoutReason?.kind === 'switching') {
      router.replace('/(auth)/login' as never);
    } else {
      router.replace('/');
    }

    clearLogoutReason();
  }, [authenticated, logoutReason, clearLogoutReason]);
};
