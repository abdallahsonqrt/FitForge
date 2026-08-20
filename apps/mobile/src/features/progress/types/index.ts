/** Mirrors the `weight_logs` table returned by `GET /progress/weight`. */
export interface WeightLog {
  id: string;
  userId: string;
  weightKg: number;
  date: string;
  createdAt: string;
}

export interface Measurement {
  id: string;
  userId: string;
  date: string;
  chestCm: number | null;
  armsCm: number | null;
  waistCm: number | null;
  legsCm: number | null;
  createdAt: string;
}

/** `GET /progress/workouts` — the `workout_logs` table. */
export interface WorkoutLog {
  id: string;
  userId: string;
  planId: string | null;
  durationSeconds: number | null;
  completedAt: string;
}

/** `GET /streaks` — falls back to zeroes for a user with no row yet. */
export interface Streak {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  createdAt: string;
}

/** `GET /progress/badges` — the join row, with the badge embedded. */
export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  earnedAt: string;
  badge: Badge;
}
