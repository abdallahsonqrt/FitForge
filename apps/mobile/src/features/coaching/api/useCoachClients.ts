import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import type { CoachClient, EnrollmentStatus, Paged } from '../types';

/**
 * `GET /enrollments/coach` caps `limit` at 100, so a roster larger than one page
 * would silently truncate. Walking the offsets here keeps the whole roster in one
 * cache entry, which is what the screen needs: the status filter chips show real
 * counts, and switching a chip must not refetch or renumber anything.
 *
 * The ceiling is a guard against a paging bug turning into an infinite loop, not
 * a product limit — no coach in this system is near it.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

/** Sort order for the roster: requests that need an answer first, then dead ones last. */
const STATUS_RANK: Record<EnrollmentStatus, number> = {
  pending: 0,
  active: 1,
  paused: 2,
  completed: 3,
  canceled: 4,
};

/**
 * The status graph the API enforces in `enrollments.service.ts`. Mirrored here so
 * the UI only ever offers a transition the server will accept — rendering a button
 * that is guaranteed to 400 is worse than rendering no button at all.
 *
 * `completed` and `canceled` are terminal and map to an empty list.
 */
const ALLOWED_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  pending: ['active', 'canceled'],
  active: ['paused', 'completed', 'canceled'],
  paused: ['active', 'completed', 'canceled'],
  completed: [],
  canceled: [],
};

export const allowedTransitions = (status: EnrollmentStatus): EnrollmentStatus[] =>
  ALLOWED_TRANSITIONS[status] ?? [];

export const canTransition = (from: EnrollmentStatus, to: EnrollmentStatus): boolean =>
  allowedTransitions(from).includes(to);

async function fetchAllClients(): Promise<CoachClient[]> {
  const collected: CoachClient[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await api.get<Paged<CoachClient>>('/enrollments/coach', {
      params: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    });
    collected.push(...data.items);
    if (collected.length >= data.total || data.items.length === 0) break;
  }

  return collected.sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    // Within a bucket, most recently touched first — a request that just came in
    // or a client you just paused belongs at the top of its group.
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

/** The coach's whole roster, every status, pre-sorted for display. */
export const useCoachClients = () =>
  useQuery({
    queryKey: queryKeys.coachClients,
    queryFn: fetchAllClients,
  });

/**
 * One enrollment.
 *
 * There is no `GET /enrollments/:id` — the roster list is the only place this data
 * exists — so this refetches the roster and picks the row out. That matters for a
 * hard reload or a deep link straight onto the detail URL, where the list cache is
 * empty; when the list *is* warm the row renders from `initialData` first and the
 * refetch only confirms it.
 */
export const useCoachClient = (enrollmentId: string | undefined) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.coachClient(enrollmentId ?? ''),
    enabled: !!enrollmentId,
    queryFn: async (): Promise<CoachClient | null> => {
      const clients = await fetchAllClients();
      // Keep the list cache in step, so going back to the roster is instant and
      // already reflects anything that changed while the detail was open.
      queryClient.setQueryData(queryKeys.coachClients, clients);
      return clients.find((client) => client.id === enrollmentId) ?? null;
    },
    initialData: () =>
      queryClient
        .getQueryData<CoachClient[]>(queryKeys.coachClients)
        ?.find((client) => client.id === enrollmentId),
  });
};

interface UpdateEnrollmentVars {
  enrollmentId: string;
  status?: EnrollmentStatus;
  planId?: string;
}

/**
 * `PATCH /enrollments/:id`. Invalidates the roster and the affected row rather
 * than writing the response into the cache: the server owns derived fields
 * (`startedAt`, `endedAt`) and its enrollment payload is athlete-shaped — it
 * carries `coach`, not the `athlete`/`program` the roster rows are built from.
 */
export const useUpdateEnrollment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ enrollmentId, ...body }: UpdateEnrollmentVars) => {
      const { data } = await api.patch<unknown>(`/enrollments/${enrollmentId}`, body);
      return data;
    },
    onSuccess: (_data, { enrollmentId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.coachClients });
      void queryClient.invalidateQueries({ queryKey: queryKeys.coachClient(enrollmentId) });
      // Accepting or ending an enrollment changes the dashboard's client counts.
      void queryClient.invalidateQueries({ queryKey: queryKeys.coachDashboard });
    },
  });
};
