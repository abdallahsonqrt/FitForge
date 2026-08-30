import type { Href } from 'expo-router';
import type { User } from '../features/users/types';
import { isCoach } from './routing';

/**
 * Who a route belongs to.
 *
 * `public` is reachable by anyone, signed in or not. The rest each require a
 * particular kind of account, and the layouts enforce them.
 */
export type Area = 'public' | 'athlete' | 'coach' | 'onboarding';

/**
 * The area a path belongs to.
 *
 * Expo Router group segments — `(tabs)`, `(coach)` — are not part of the URL a
 * user sees, so both the grouped and flat forms are matched: a deep link arrives
 * as `/dashboard`, while an internal `router.push` may carry `/(coach)/dashboard`.
 */
export const areaOf = (path: string): Area => {
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';

  const has = (segment: string) =>
    clean.startsWith(`/(${segment})/`) || clean === `/(${segment})`;

  if (has('coach')) return 'coach';
  if (has('tabs')) return 'athlete';
  if (has('onboarding')) return 'onboarding';

  // Flat forms, as they appear in the address bar.
  const COACH_ROUTES = ['/dashboard', '/programs', '/clients', '/messages', '/coach'];
  const ATHLETE_ROUTES = [
    '/home',
    '/training',
    '/nutrition',
    '/progress',
    '/workout',
    '/meal',
    '/subscription',
    '/settings',
  ];
  const ONBOARDING_ROUTES = [
    '/gender', '/age', '/height', '/weight', '/sport', '/fitness-goal',
    '/experience-level', '/activity-level', '/training-location', '/equipment',
    '/session-duration', '/workout-frequency', '/diet-preferences',
  ];

  const startsWithAny = (list: string[]) =>
    list.some((r) => clean === r || clean.startsWith(`${r}/`));

  if (startsWithAny(COACH_ROUTES)) return 'coach';
  if (startsWithAny(ONBOARDING_ROUTES)) return 'onboarding';
  if (startsWithAny(ATHLETE_ROUTES)) return 'athlete';

  // `/profile` is claimed by both workspaces; the account's role decides.
  if (clean === '/profile') return 'athlete';

  return 'public';
};

/**
 * Whether this account may open this area.
 *
 * The single rule the guards and the post-sign-in redirect both read. Two copies
 * of it would eventually disagree, and the failure is silent: a user sent to a
 * page the guard then bounces them straight back out of.
 */
export const canAccess = (
  user: User | null,
  authenticated: boolean,
  area: Area,
): boolean => {
  if (area === 'public') return true;
  if (!authenticated) return false;

  switch (area) {
    case 'coach':
      return isCoach(user);
    // An athlete's own screens, and the questionnaire that fills them in. A
    // coach has no athlete profile, so neither is theirs to open.
    case 'athlete':
    case 'onboarding':
      return !isCoach(user);
    default:
      return true;
  }
};

/** Convenience: may this account open this specific path? */
export const canAccessPath = (
  user: User | null,
  authenticated: boolean,
  path: string,
): boolean => canAccess(user, authenticated, areaOf(path));

/**
 * Where to send someone after they sign in.
 *
 * `intended` is the page they originally asked for. It is honoured only when the
 * account they have just signed into may actually open it — otherwise signing in
 * as the wrong role would bounce them straight back to the unauthorised screen,
 * which reads as the app refusing a correct password.
 */
export const destinationAfterLogin = (
  user: User | null,
  onboarded: boolean,
  intended: string | undefined,
  fallback: Href,
): Href => {
  /**
   * Onboarding outranks any intended page.
   *
   * An athlete who has not finished the questionnaire has no training profile,
   * and every athlete screen reads from it — so honouring a deep link here would
   * drop them into a dashboard with nothing behind it. Coaches are exempt:
   * `onboardingComplete` describes an athlete profile they never fill in.
   */
  if (!isCoach(user) && !onboarded) return fallback;

  if (intended && canAccessPath(user, true, intended)) return intended as Href;
  return fallback;
};
