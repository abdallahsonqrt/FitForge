import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/queryKeys';
import { useAuthStore } from '../../../store/authStore';
import type { Difficulty } from '../../training/types';
import type {
  CoachProgram,
  CoachProgramDetail,
  CreateProgramPayload,
  Paged,
  ProgramDay,
  ProgramVisibility,
  ProgramWeek,
} from '../types';

/**
 * The coach program builder's data layer.
 *
 * Every hook here talks to `/coaches/me/programs/**`, which is 403 for anyone who
 * is not a coach. The route guard in `(coach)/_layout.tsx` keeps athletes off the
 * screens; `enabled` below keeps the queries from firing before a session exists.
 *
 * Two shapes of write live here and they are deliberately different:
 *
 * - Ordinary edits (create, rename, delete) invalidate and refetch. A round trip
 *   is fine when the user has just typed something and expects a save.
 * - Reordering is optimistic. Move-up/move-down is a rapid, repeated gesture, and
 *   a list that only reflows after the server answers feels broken — so the cache
 *   moves first and rolls back on failure, the same cancel/snapshot/rollback/settle
 *   cycle `useWater` documents.
 */

// ─── Types the API returns that the shared type file does not model ──────────

/**
 * A day's prescription row as `GET .../days/:dayId/exercises` returns it.
 *
 * Richer than `ProgramExercise` in `../types`: after migration 0009 the API can
 * express a rep *range*, a duration, a tempo and an RPE, and it joins a summary of
 * the catalogue row under `exercise` rather than flattening a name onto the row.
 * Modelled here because `../types/index.ts` is shared and owned elsewhere.
 */
export interface DayExercise {
  id: string;
  dayId: string;
  exerciseId: string;
  sets: number;
  reps: number | null;
  repsMin: number | null;
  repsMax: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  tempo: string | null;
  rpe: number | null;
  notes: string | null;
  orderIndex: number;
  /** Absent on write responses (POST/PATCH), present on reads. */
  exercise?: {
    id: string;
    slug: string;
    name: string;
    difficulty: Difficulty;
    primaryMuscles: { slug: string; name: string }[];
    thumbnailUrl: string | null;
    hasVideo: boolean;
  };
}

/**
 * The API refuses a prescription that says nothing about the work — reps, a rep
 * range, a duration, or a note such as "AMRAP" — and refuses one that says two
 * contradictory things. Mirrored in the picker's validation so the coach is told
 * before the request rather than after it.
 */
export interface CreateDayExercisePayload {
  exerciseId: string;
  sets: number;
  reps?: number | null;
  restSeconds?: number;
  notes?: string | null;
}

export type UpdateDayExercisePayload = Partial<Omit<CreateDayExercisePayload, 'exerciseId'>>;

export interface UpdateProgramPayload extends Partial<CreateProgramPayload> {}

// ─── Query keys ──────────────────────────────────────────────────────────────

/**
 * Nested under the program's own key so `invalidateQueries(coachProgram(planId))`
 * reaches every day's exercise list too — a week or day that moves changes what
 * those lists belong to.
 */
const dayExercisesKey = (planId: string, dayId: string): QueryKey => [
  ...queryKeys.coachProgram(planId),
  'days',
  dayId,
  'exercises',
];

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Drizzle returns relations unordered; every screen here relies on the order. */
const sortDetail = (detail: CoachProgramDetail): CoachProgramDetail => ({
  ...detail,
  weeks: [...(detail.weeks ?? [])]
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((week) => ({
      ...week,
      days: [...(week.days ?? [])].sort((a, b) => a.orderIndex - b.orderIndex),
    })),
});

/**
 * `GET /coaches/me/programs`. The visibility filter is part of the cache key —
 * two filters are two lists, the same contract `queryKeys.exercises` uses.
 */
export const useCoachPrograms = (visibility?: ProgramVisibility) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: [...queryKeys.coachPrograms, visibility ?? 'all'],
    enabled: isAuthenticated,
    queryFn: async (): Promise<Paged<CoachProgram>> => {
      const { data } = await api.get<Paged<CoachProgram>>('/coaches/me/programs', {
        params: visibility ? { visibility } : undefined,
      });
      return data;
    },
  });
};

/** `GET /coaches/me/programs/:planId` — the program plus its weeks and their days. */
export const useCoachProgram = (planId: string | undefined) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useQuery({
    queryKey: queryKeys.coachProgram(planId ?? ''),
    enabled: isAuthenticated && !!planId,
    queryFn: async (): Promise<CoachProgramDetail> => {
      const { data } = await api.get<CoachProgramDetail>(`/coaches/me/programs/${planId}`);
      return sortDetail(data);
    },
  });
};

/**
 * `GET .../days/:dayId/exercises`.
 *
 * The program detail deliberately stops at days: a twelve-week program is sixty
 * odd sessions, and loading every prescription to render a collapsed list would
 * pay for data nobody has asked to see. `enabled` ties the request to the day
 * actually being expanded.
 */
export const useDayExercises = (planId: string, dayId: string, enabled: boolean) =>
  useQuery({
    queryKey: dayExercisesKey(planId, dayId),
    enabled: enabled && !!planId && !!dayId,
    queryFn: async (): Promise<DayExercise[]> => {
      const { data } = await api.get<DayExercise[]>(
        `/coaches/me/programs/${planId}/days/${dayId}/exercises`,
      );
      return [...data].sort((a, b) => a.orderIndex - b.orderIndex);
    },
  });

// ─── Program-level writes ────────────────────────────────────────────────────

/**
 * Invalidate the list *and*, when publishing, what athletes are shown: a program
 * going live changes `/plans`, which is a different cache subtree entirely.
 */
const useProgramInvalidator = () => {
  const queryClient = useQueryClient();
  return (planId?: string, touchesAthletes = false) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.coachPrograms });
    if (planId) queryClient.invalidateQueries({ queryKey: queryKeys.coachProgram(planId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.coachDashboard });
    if (touchesAthletes) queryClient.invalidateQueries({ queryKey: ['plans'] });
  };
};

/** `POST /coaches/me/programs`. `coachId` comes from the token — never send it. */
export const useCreateProgram = () => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async (payload: CreateProgramPayload): Promise<CoachProgram> => {
      const { data } = await api.post<CoachProgram>('/coaches/me/programs', payload);
      return data;
    },
    onSuccess: (program) => invalidate(program.id),
  });
};

/** `PATCH /coaches/me/programs/:planId`. The API rejects an empty body. */
export const useUpdateProgram = (planId: string) => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async (payload: UpdateProgramPayload): Promise<CoachProgram> => {
      const { data } = await api.patch<CoachProgram>(`/coaches/me/programs/${planId}`, payload);
      return data;
    },
    // A published program's edits are visible to athletes immediately.
    onSuccess: () => invalidate(planId, true),
  });
};

/**
 * `DELETE /coaches/me/programs/:planId`.
 *
 * 409s while an athlete is still enrolled, with a sentence written for the coach
 * ("Archive it instead of deleting it"). `getApiErrorMessage` passes 4xx bodies
 * through, so the caller must surface the error rather than a generic failure.
 */
export const useDeleteProgram = () => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async (planId: string): Promise<void> => {
      await api.delete(`/coaches/me/programs/${planId}`);
    },
    onSuccess: (_result, planId) => invalidate(planId, true),
  });
};

/** `POST .../publish` — 400 when the program has no weeks. */
export const usePublishProgram = (planId: string) => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async (): Promise<CoachProgram> => {
      const { data } = await api.post<CoachProgram>(`/coaches/me/programs/${planId}/publish`);
      return data;
    },
    onSuccess: () => invalidate(planId, true),
  });
};

/** `POST .../archive` — reversible; publishing again brings it back. */
export const useArchiveProgram = (planId: string) => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async (): Promise<CoachProgram> => {
      const { data } = await api.post<CoachProgram>(`/coaches/me/programs/${planId}/archive`);
      return data;
    },
    onSuccess: () => invalidate(planId, true),
  });
};

// ─── Weeks ───────────────────────────────────────────────────────────────────

/** `POST .../weeks`. Omitting `weekNumber` appends. */
export const useAddWeek = (planId: string) => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async (payload: { title?: string; notes?: string }): Promise<ProgramWeek> => {
      const { data } = await api.post<ProgramWeek>(
        `/coaches/me/programs/${planId}/weeks`,
        payload,
      );
      return data;
    },
    onSuccess: () => invalidate(planId, true),
  });
};

export const useUpdateWeek = (planId: string) => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async ({
      weekId,
      ...payload
    }: {
      weekId: string;
      title?: string | null;
      notes?: string | null;
    }): Promise<ProgramWeek> => {
      const { data } = await api.patch<ProgramWeek>(
        `/coaches/me/programs/${planId}/weeks/${weekId}`,
        payload,
      );
      return data;
    },
    onSuccess: () => invalidate(planId, true),
  });
};

export const useDeleteWeek = (planId: string) => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async (weekId: string): Promise<void> => {
      await api.delete(`/coaches/me/programs/${planId}/weeks/${weekId}`);
    },
    onSuccess: () => invalidate(planId, true),
  });
};

/**
 * `PATCH .../weeks/reorder` with every week id exactly once — a partial reorder
 * has no single correct reading once two clients each send one.
 *
 * Optimistic: the caller hands over the already-reordered id list, the cache is
 * rewritten to match and `weekNumber` renumbered from 1 so the labels move with
 * the cards, and the snapshot goes back if the request fails.
 */
export const useReorderWeeks = (planId: string) => {
  const queryClient = useQueryClient();
  const key = queryKeys.coachProgram(planId);

  return useMutation({
    mutationFn: async (weekIds: string[]): Promise<void> => {
      await api.patch(`/coaches/me/programs/${planId}/weeks/reorder`, { weekIds });
    },
    onMutate: async (weekIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CoachProgramDetail>(key);
      if (previous) {
        const byId = new Map(previous.weeks.map((week) => [week.id, week]));
        const weeks = weekIds
          .map((id, index) => {
            const week = byId.get(id);
            return week ? { ...week, weekNumber: index + 1 } : undefined;
          })
          .filter((week): week is ProgramWeek => !!week);
        queryClient.setQueryData<CoachProgramDetail>(key, { ...previous, weeks });
      }
      return { previous };
    },
    onError: (_error, _weekIds, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};

// ─── Days ────────────────────────────────────────────────────────────────────

/** `POST .../weeks/:weekId/days`. Appends when `orderIndex` is omitted. */
export const useAddDay = (planId: string) => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async ({
      weekId,
      dayName,
    }: {
      weekId: string;
      dayName: string;
    }): Promise<ProgramDay> => {
      const { data } = await api.post<ProgramDay>(
        `/coaches/me/programs/${planId}/weeks/${weekId}/days`,
        { dayName },
      );
      return data;
    },
    onSuccess: () => invalidate(planId, true),
  });
};

export const useUpdateDay = (planId: string) => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async ({
      weekId,
      dayId,
      dayName,
    }: {
      weekId: string;
      dayId: string;
      dayName: string;
    }): Promise<ProgramDay> => {
      const { data } = await api.patch<ProgramDay>(
        `/coaches/me/programs/${planId}/weeks/${weekId}/days/${dayId}`,
        { dayName },
      );
      return data;
    },
    onSuccess: () => invalidate(planId, true),
  });
};

export const useDeleteDay = (planId: string) => {
  const invalidate = useProgramInvalidator();

  return useMutation({
    mutationFn: async ({ weekId, dayId }: { weekId: string; dayId: string }): Promise<void> => {
      await api.delete(`/coaches/me/programs/${planId}/weeks/${weekId}/days/${dayId}`);
    },
    onSuccess: () => invalidate(planId, true),
  });
};

/** `PATCH .../weeks/:weekId/days` — attach and order by listing every day id. */
export const useReorderDays = (planId: string) => {
  const queryClient = useQueryClient();
  const key = queryKeys.coachProgram(planId);

  return useMutation({
    mutationFn: async ({
      weekId,
      dayIds,
    }: {
      weekId: string;
      dayIds: string[];
    }): Promise<void> => {
      await api.patch(`/coaches/me/programs/${planId}/weeks/${weekId}/days`, { dayIds });
    },
    onMutate: async ({ weekId, dayIds }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CoachProgramDetail>(key);
      if (previous) {
        queryClient.setQueryData<CoachProgramDetail>(key, {
          ...previous,
          weeks: previous.weeks.map((week) => {
            if (week.id !== weekId) return week;
            const byId = new Map(week.days.map((day) => [day.id, day]));
            const days = dayIds
              .map((id, index) => {
                const day = byId.get(id);
                return day ? { ...day, orderIndex: index } : undefined;
              })
              .filter((day): day is ProgramDay => !!day);
            return { ...week, days };
          }),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};

// ─── Exercises within a day ──────────────────────────────────────────────────

export const useAddDayExercise = (planId: string, dayId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateDayExercisePayload): Promise<DayExercise> => {
      const { data } = await api.post<DayExercise>(
        `/coaches/me/programs/${planId}/days/${dayId}/exercises`,
        payload,
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: dayExercisesKey(planId, dayId) }),
  });
};

export const useUpdateDayExercise = (planId: string, dayId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: UpdateDayExercisePayload & { id: string }): Promise<DayExercise> => {
      const { data } = await api.patch<DayExercise>(
        `/coaches/me/programs/${planId}/days/${dayId}/exercises/${id}`,
        payload,
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: dayExercisesKey(planId, dayId) }),
  });
};

export const useDeleteDayExercise = (planId: string, dayId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/coaches/me/programs/${planId}/days/${dayId}/exercises/${id}`);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: dayExercisesKey(planId, dayId) }),
  });
};

/** `PATCH .../exercises/reorder` — every exercise id of the day, in its new order. */
export const useReorderDayExercises = (planId: string, dayId: string) => {
  const queryClient = useQueryClient();
  const key = dayExercisesKey(planId, dayId);

  return useMutation({
    mutationFn: async (exerciseIds: string[]): Promise<void> => {
      await api.patch(`/coaches/me/programs/${planId}/days/${dayId}/exercises/reorder`, {
        exerciseIds,
      });
    },
    onMutate: async (exerciseIds) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DayExercise[]>(key);
      if (previous) {
        const byId = new Map(previous.map((row) => [row.id, row]));
        const next = exerciseIds
          .map((id, index) => {
            const row = byId.get(id);
            return row ? { ...row, orderIndex: index } : undefined;
          })
          .filter((row): row is DayExercise => !!row);
        queryClient.setQueryData<DayExercise[]>(key, next);
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};

// ─── Helpers shared by the builder screens ───────────────────────────────────

/** Swap two entries and hand back the resulting id order, or null at the ends. */
export const movedIds = <T extends { id: string }>(
  items: T[],
  index: number,
  direction: -1 | 1,
): string[] | null => {
  const target = index + direction;
  if (target < 0 || target >= items.length) return null;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved);
  return next.map((item) => item.id);
};
