import { Redirect, Stack } from 'expo-router';
import { useAuthStore } from '../../src/store/authStore';
import { homeHrefFor } from '../../src/lib/routing';

export default function AuthLayout() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  const onboarded = useAuthStore((state) => state.isOnboarded);
  const user = useAuthStore((state) => state.user);
  // The profile, not just its presence, would re-render this layout on every
  // profile edit — a boolean keeps the subscription narrow.
  const hasProfile = useAuthStore((state) => state.user !== null);

  // Someone who is already signed in has no business on the sign-in screens. A
  // deep link or a stale bookmark used to serve them the form, and signing in
  // again from there registers a second device row for the same person.
  //
  // Two conditions keep the redirect from firing too early:
  //  - `hydrated`, so a restored session is not bounced before it has been read
  //    back from storage (the root layout already waits, this is belt and braces);
  //  - a loaded profile, because `signIn` only lands after `/users/me` returns.
  //    In the gap between `/auth/login` handing over tokens and that call, the
  //    session is authenticated but `isOnboarded` is still its default `false`,
  //    which would flash an already-onboarded user into onboarding.
  //  - the loaded profile also carries `role`, which decides whether this person
  //    belongs in the coach area or the athlete tabs (see `homeHrefFor`).
  if (hydrated && authenticated && hasProfile) {
    return <Redirect href={homeHrefFor(user, onboarded)} />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
