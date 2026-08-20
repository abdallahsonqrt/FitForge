import type { Href } from 'expo-router';
import type { User } from '../features/users/types';

/**
 * Where a signed-in person belongs.
 *
 * Two screens decide this — the landing page and the auth layout — and before
 * this helper existed they each spelled the rule out inline. Adding a third role
 * meant editing both, and missing one would strand coaches in the athlete tabs
 * on one route but not the other. One function, two call sites.
 */

/**
 * `trainer` is the legacy spelling of `coach` (see the API's `roleEnum`, where
 * dropping the old value would be a destructive migration). Rows created before
 * the coach-centric model still carry it, so both count.
 */
export const isCoach = (user: User | null): boolean =>
  user?.role === 'coach' || user?.role === 'trainer';

/** The first screen of the coach area. Not `index` — see `(coach)/_layout.tsx`. */
export const COACH_HOME: Href = '/(coach)/dashboard';

/**
 * The route a signed-in user should land on.
 *
 * Coaches bypass athlete onboarding entirely: `onboardingComplete` tracks an
 * athlete's training profile (goal, equipment, session length), none of which a
 * coach account fills in, so gating them on it would trap them in a questionnaire
 * about their own workouts.
 */
export const homeHrefFor = (user: User | null, onboarded: boolean): Href => {
  if (isCoach(user)) return COACH_HOME;
  return onboarded ? '/(tabs)/home' : '/(onboarding)/gender';
};
