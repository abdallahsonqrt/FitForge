/** Single source of truth for React Query cache keys, so invalidation can't drift. */
export const queryKeys = {
  me: ['me'] as const,

  plans: (tier: string) => ['plans', tier] as const,
  plan: (id: string) => ['plan', id] as const,
  // Filters are part of the key: two different filter sets are two different lists.
  exercises: (filters: Record<string, unknown> = {}) => ['exercises', filters] as const,
  exercise: (id: string) => ['exercise', id] as const,
  exerciseTaxonomy: ['exercises', 'taxonomy'] as const,
  videoPlayback: (videoId: string) => ['exercise-video', videoId, 'playback'] as const,

  meals: ['meals'] as const,
  mealSummary: (date: string) => ['meals', 'summary', date] as const,

  foods: ['foods'] as const,
  foodSearch: (query: string, category?: string) =>
    ['foods', 'search', query, category ?? 'all'] as const,
  foodAutocomplete: (query: string) => ['foods', 'autocomplete', query] as const,
  foodSuggestions: ['foods', 'suggestions'] as const,
  foodRecent: ['foods', 'recent'] as const,

  water: (date: string) => ['water', date] as const,
  steps: (date: string) => ['steps', date] as const,

  weightLogs: ['progress', 'weight'] as const,
  measurements: ['progress', 'measurements'] as const,
  workoutHistory: ['progress', 'workouts'] as const,
  badges: ['progress', 'badges'] as const,
  streak: ['streak'] as const,

  subscriptionPlans: ['subscriptions', 'plans'] as const,
  mySubscription: ['subscriptions', 'me'] as const,

  devices: ['devices'] as const,
  notifications: ['notifications'] as const,

  // ─── Coach workspace ────────────────────────────────────────
  // Namespaced under `coach` so signing out of the workspace, or a change that
  // touches several coach lists at once, can invalidate the whole subtree.
  coachMe: ['coach', 'me'] as const,
  // Readable by an applicant who is not yet a coach, so it sits outside the
  // `coach` subtree that gets cleared when the workspace is left.
  coachApplication: ['coach-application'] as const,
  coachDashboard: ['coach', 'dashboard'] as const,
  coachPrograms: ['coach', 'programs'] as const,
  coachProgram: (planId: string) => ['coach', 'programs', planId] as const,
  coachClients: ['coach', 'clients'] as const,
  coachClient: (enrollmentId: string) => ['coach', 'clients', enrollmentId] as const,

  // Conversations are shared with the athlete side — both roles read the same
  // endpoints, so these keys are not namespaced under `coach`.
  conversations: ['conversations'] as const,
  conversationMessages: (conversationId: string) =>
    ['conversations', conversationId, 'messages'] as const,
  unreadCount: ['conversations', 'unread-count'] as const,
};
