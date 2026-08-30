import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, Tabs, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Dumbbell, LayoutDashboard, MessageSquare, UserCircle, Users } from 'lucide-react-native';
import { useAuthStore } from '../../src/store/authStore';
import { isCoach } from '../../src/lib/routing';
import { useTranslation } from '../../src/i18n';
import { TAB_BAR_BASE_HEIGHT, tabBarHeight } from '../../src/theme/layout';

const ICON_SIZE = 24;

/**
 * The coach workspace.
 *
 * Deliberately a sibling of `(tabs)` rather than a screen inside it: a coach and
 * an athlete are different jobs with different navigation, and nesting one in the
 * other would put coach screens behind the athlete tab bar.
 *
 * There is no `index.tsx` in this group on purpose. An index route inside a group
 * claims the URL `/`, which the landing page already owns — two routes on one path
 * made `router.replace('/')` resolve nondeterministically once before. The first
 * screen is `dashboard.tsx`; see the comment in `(tabs)/_layout.tsx`.
 */
export default function CoachLayout() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const pathname = usePathname();

  const hydrated = useAuthStore((state) => state.hydrated);
  const authenticated = useAuthStore((state) => state.isAuthenticated);
  // Booleans, not the user object: subscribing to the profile itself would
  // re-render the whole workspace on every profile edit.
  const hasProfile = useAuthStore((state) => state.user !== null);
  const coach = useAuthStore((state) => isCoach(state.user));

  if (!authenticated) return <Redirect href="/" />;

  /**
   * Wait for `/users/me` before judging the role. `isAuthenticated` flips as soon
   * as `/auth/login` hands over tokens, but `user` — and therefore `role` — lands
   * one request later. Deciding in that gap would bounce every coach into the
   * athlete tabs on a fresh sign-in, the same trap `(auth)/_layout.tsx` documents
   * for `isOnboarded`.
   */
  if (!hydrated || !hasProfile) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  /**
   * An athlete who deep-links or bookmarks a coach URL is told why the page did
   * not open, and offered the account switch that would fix it. Silently
   * redirecting them home — which is what this used to do — is indistinguishable
   * from a broken link.
   *
   * The API enforces this too (every coach route is 403 for a non-coach); this
   * only decides what the screen shows.
   */
  if (!coach) {
    return <Redirect href={`/unauthorized?next=${encodeURIComponent(pathname)}`} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Same metric as the athlete bar so the two workspaces line up, and so
        // the home indicator does not sit on top of the labels.
        tabBarStyle: [
          styles.tabBar,
          {
            height: tabBarHeight(insets.bottom),
            paddingBottom: insets.bottom + theme.spacing.sm,
          },
        ],
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIconStyle: styles.tabIcon,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('coach.tabs.dashboard'),
          tabBarIcon: ({ color }) => <LayoutDashboard color={color} size={ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="programs"
        options={{
          title: t('coach.tabs.programs'),
          tabBarIcon: ({ color }) => <Dumbbell color={color} size={ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: t('coach.tabs.clients'),
          tabBarIcon: ({ color }) => <Users color={color} size={ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('coach.tabs.messages'),
          tabBarIcon: ({ color }) => <MessageSquare color={color} size={ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('coach.tabs.profile'),
          tabBarIcon: ({ color }) => <UserCircle color={color} size={ICON_SIZE} />,
        }}
      />
    </Tabs>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  tabBar: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    elevation: 0,
    // Height and bottom padding are applied at the call site, where the inset is known.
    minHeight: TAB_BAR_BASE_HEIGHT,
    paddingTop: theme.spacing.sm,
  },
  tabLabel: {
    ...theme.typography.bodyXs,
    // An explicit line height stops descenders being clipped by the bar edge.
    lineHeight: 14,
    marginTop: 2,
  },
  tabIcon: {
    marginTop: 0,
  },
}));
