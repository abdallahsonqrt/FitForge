import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { isCoach } from '../../../lib/routing';
import { useAuthStore } from '../../../store/authStore';
import type { CoachClient, CoachProfile, CoachProgram, Paged } from '../types';

/** The numbers the coach dashboard shows, whatever the API needed to produce them. */
export interface CoachDashboardSummary {
  activeClients: number;
  pendingRequests: number;
  programs: number;
  unreadMessages: number;
  /**
   * True when this coach has nothing set up at all. Distinguishes "brand new,
   * here is how to start" from "a real workspace that happens to read zero".
   */
  isNewCoach: boolean;
}

interface UnreadCountResponse {
  unreadCount: number;
}

/**
 * There is no dashboard endpoint yet — `GET /coaches/me/dashboard` returns 404 —
 * so the summary is composed from the four list endpoints that already carry the
 * numbers. Every one of them is asked for `limit=1`: only `total` is read, and
 * pulling fifty enrollment rows to count them would be wasted bytes on a screen
 * that never shows a row.
 *
 * When the endpoint ships, this is the only function that changes: replace the
 * body with a single `api.get<CoachDashboardSummary>('/coaches/me/dashboard')`
 * and every caller keeps working.
 */
async function fetchCoachDashboard(): Promise<CoachDashboardSummary> {
  const [active, pending, programs, unread, profile] = await Promise.all([
    api.get<Paged<CoachClient>>('/enrollments/coach', { params: { status: 'active', limit: 1 } }),
    api.get<Paged<CoachClient>>('/enrollments/coach', { params: { status: 'pending', limit: 1 } }),
    api.get<Paged<CoachProgram>>('/coaches/me/programs', { params: { limit: 1 } }),
    api.get<UnreadCountResponse>('/conversations/unread-count'),
    api.get<CoachProfile>('/coaches/me'),
  ]);

  /**
   * `activeClientCount` is the profile's own denormalised tally and is what an
   * athlete browsing the coach sees, so it wins where the two can disagree; the
   * enrollment page total backs it up if the field is ever absent.
   */
  const activeClients = profile.data?.activeClientCount ?? active.data.total;
  const pendingRequests = pending.data.total;
  const programCount = programs.data.total;

  return {
    activeClients,
    pendingRequests,
    programs: programCount,
    unreadMessages: unread.data?.unreadCount ?? 0,
    isNewCoach: programCount === 0 && activeClients === 0 && pendingRequests === 0,
  };
}

/**
 * One query key for the whole summary, so pull-to-refresh is a single `refetch()`
 * and a partial failure fails the screen rather than leaving three tiles right and
 * one silently stale.
 */
export const useCoachDashboard = () => {
  const enabled = useAuthStore((state) => state.isAuthenticated && isCoach(state.user));

  return useQuery({
    queryKey: queryKeys.coachDashboard,
    enabled,
    queryFn: fetchCoachDashboard,
  });
};
