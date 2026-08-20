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
  const wasAuthenticated = useRef(authenticated);

  useEffect(() => {
    const ended = wasAuthenticated.current && !authenticated;
    wasAuthenticated.current = authenticated;
    if (!ended) return;

    // Drop the screens the session left behind first. The group layouts turn a
    // back gesture into a redirect on their own, but the screens stacked at the
    // root — settings, a workout in progress — have no such guard.
    // Drop the screens the session left behind first. The group layouts turn a
    // back gesture into a redirect on their own, but the screens stacked at the
    // root — settings, a workout in progress — have no such guard.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
  }, [authenticated]);
};
