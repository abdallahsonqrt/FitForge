// ─── Progress Types ──────────────────────────────────────

export interface WeightLog {
  id: string;
  userId: string;
  weightKg: number;
  loggedDate: string;
  notes?: string;
  createdAt: string;
}

export interface Measurement {
  id: string;
  userId: string;
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  bicepsCm?: number;
  thighsCm?: number;
  photoUrl?: string;
  loggedDate: string;
  createdAt: string;
}

export interface Streak {
  id: string;
  userId: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string;
  updatedAt: string;
}

export enum BadgeType {
  FIRST_WORKOUT = 'first_workout',
  STREAK_7 = 'streak_7',
  STREAK_30 = 'streak_30',
  STREAK_100 = 'streak_100',
  STREAK_365 = 'streak_365',
  WEIGHT_LOSS_5 = 'weight_loss_5',
  WEIGHT_LOSS_10 = 'weight_loss_10',
  WORKOUTS_50 = 'workouts_50',
  WORKOUTS_100 = 'workouts_100',
  WORKOUTS_500 = 'workouts_500',
  PERFECT_WEEK = 'perfect_week',
  EARLY_BIRD = 'early_bird',
  NIGHT_OWL = 'night_owl',
  HYDRATION_HERO = 'hydration_hero',
  MEAL_MASTER = 'meal_master',
}

export interface Badge {
  type: BadgeType;
  name: string;
  description: string;
  icon: string;
  earnedAt?: string;
  isEarned: boolean;
  tierRequired?: 'free' | 'pro' | 'elite';
}

export const BADGE_DEFINITIONS: Record<BadgeType, Omit<Badge, 'earnedAt' | 'isEarned'>> = {
  [BadgeType.FIRST_WORKOUT]: {
    type: BadgeType.FIRST_WORKOUT,
    name: 'First Steps',
    description: 'Complete your first workout',
    icon: '🏋️',
  },
  [BadgeType.STREAK_7]: {
    type: BadgeType.STREAK_7,
    name: 'Week Warrior',
    description: '7-day workout streak',
    icon: '🔥',
  },
  [BadgeType.STREAK_30]: {
    type: BadgeType.STREAK_30,
    name: 'Monthly Master',
    description: '30-day workout streak',
    icon: '💪',
  },
  [BadgeType.STREAK_100]: {
    type: BadgeType.STREAK_100,
    name: 'Century Club',
    description: '100-day workout streak',
    icon: '🏆',
  },
  [BadgeType.STREAK_365]: {
    type: BadgeType.STREAK_365,
    name: 'Legendary',
    description: '365-day workout streak',
    icon: '👑',
    tierRequired: 'elite',
  },
  [BadgeType.WEIGHT_LOSS_5]: {
    type: BadgeType.WEIGHT_LOSS_5,
    name: 'Transformation',
    description: 'Lost 5kg from starting weight',
    icon: '⚡',
  },
  [BadgeType.WEIGHT_LOSS_10]: {
    type: BadgeType.WEIGHT_LOSS_10,
    name: 'Major Transform',
    description: 'Lost 10kg from starting weight',
    icon: '🌟',
  },
  [BadgeType.WORKOUTS_50]: {
    type: BadgeType.WORKOUTS_50,
    name: 'Half Century',
    description: 'Complete 50 workouts',
    icon: '🎯',
  },
  [BadgeType.WORKOUTS_100]: {
    type: BadgeType.WORKOUTS_100,
    name: 'Centurion',
    description: 'Complete 100 workouts',
    icon: '🥇',
  },
  [BadgeType.WORKOUTS_500]: {
    type: BadgeType.WORKOUTS_500,
    name: 'Iron Will',
    description: 'Complete 500 workouts',
    icon: '💎',
    tierRequired: 'pro',
  },
  [BadgeType.PERFECT_WEEK]: {
    type: BadgeType.PERFECT_WEEK,
    name: 'Perfect Week',
    description: 'Hit all planned workouts in a week',
    icon: '✅',
  },
  [BadgeType.EARLY_BIRD]: {
    type: BadgeType.EARLY_BIRD,
    name: 'Early Bird',
    description: 'Complete 10 workouts before 7 AM',
    icon: '🌅',
  },
  [BadgeType.NIGHT_OWL]: {
    type: BadgeType.NIGHT_OWL,
    name: 'Night Owl',
    description: 'Complete 10 workouts after 9 PM',
    icon: '🦉',
  },
  [BadgeType.HYDRATION_HERO]: {
    type: BadgeType.HYDRATION_HERO,
    name: 'Hydration Hero',
    description: 'Hit water goal 30 days in a row',
    icon: '💧',
  },
  [BadgeType.MEAL_MASTER]: {
    type: BadgeType.MEAL_MASTER,
    name: 'Meal Master',
    description: 'Log 100 meals with AI',
    icon: '🍽️',
  },
};

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'workout_reminder' | 'streak_warning' | 'badge_earned' | 'subscription' | 'general';
  isRead: boolean;
  data?: Record<string, unknown>;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
}

// ─── Dashboard Types ─────────────────────────────────────

export interface DashboardData {
  todayWorkout?: {
    planName: string;
    dayName: string;
    exerciseCount: number;
    estimatedMinutes: number;
  };
  caloriesSummary: {
    consumed: number;
    goal: number;
    remaining: number;
  };
  steps: {
    current: number;
    goal: number;
  };
  water: {
    currentMl: number;
    goalMl: number;
  };
  streak: {
    current: number;
    longest: number;
  };
}
