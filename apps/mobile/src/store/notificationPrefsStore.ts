import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { zustandStorage } from '../lib/storage';

export type NotificationChannel =
  | 'workoutReminders'
  | 'mealReminders'
  | 'streakWarnings'
  | 'badgeNotifications'
  | 'promotional';

export const NOTIFICATION_CHANNELS: {
  key: NotificationChannel;
  title: string;
  subtitle: string;
}[] = [
  {
    key: 'workoutReminders',
    title: 'Workout Reminders',
    subtitle: 'Get notified when a session is due',
  },
  { key: 'mealReminders', title: 'Meal Reminders', subtitle: "Nudges to log what you've eaten" },
  { key: 'streakWarnings', title: 'Streak Warnings', subtitle: 'Alert when your streak is at risk' },
  { key: 'badgeNotifications', title: 'Badges', subtitle: 'When you unlock an achievement' },
  { key: 'promotional', title: 'Promotional', subtitle: 'Offers and feature updates' },
];

interface NotificationPrefsState {
  channels: Record<NotificationChannel, boolean>;
  toggle: (channel: NotificationChannel) => void;
}

/**
 * Delivery preferences live on the device: the API exposes a notification inbox
 * but no per-channel settings endpoint to sync them to.
 */
export const useNotificationPrefsStore = create<NotificationPrefsState>()(
  persist(
    (set) => ({
      channels: {
        workoutReminders: true,
        mealReminders: false,
        streakWarnings: true,
        badgeNotifications: true,
        promotional: false,
      },
      toggle: (channel) =>
        set((state) => ({ channels: { ...state.channels, [channel]: !state.channels[channel] } })),
    }),
    {
      name: 'notification-prefs-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
