import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Home, Dumbbell, Utensils, LineChart, User } from 'lucide-react-native';
import { TAB_BAR_BASE_HEIGHT, tabBarHeight } from '../../src/theme/layout';
import { useAuthStore } from '../../src/store/authStore';
import { useTranslation } from '../../src/i18n';

const ICON_SIZE = 24;

export default function TabLayout() {
  const { theme, styles } = useStyles(stylesheet);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const authenticated = useAuthStore((state) => state.isAuthenticated);

  // The root layout holds a spinner until the stored session has been read back,
  // so reaching here without one means there is genuinely no session — whether
  // from a deep link, a back gesture, or a session that ended a moment ago.
  if (!authenticated) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // The bar must grow by the safe-area inset, otherwise the home indicator
        // or gesture bar sits on top of the labels.
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
        // Deliberately not `index`: an index route here would claim the URL `/`,
        // which the public landing page already owns. Two routes on one path made
        // a bare `router.replace('/')` resolve to whichever was mounted, so
        // signing out of a tab landed back in the tabs instead of on the landing
        // page — and once the tabs redirected signed-out users away, the two
        // bounced off each other and rendered nothing at all.
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color }) => <Home color={color} size={ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: t('tabs.training'),
          tabBarIcon: ({ color }) => <Dumbbell color={color} size={ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: t('tabs.nutrition'),
          tabBarIcon: ({ color }) => <Utensils color={color} size={ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: t('tabs.progress'),
          tabBarIcon: ({ color }) => <LineChart color={color} size={ICON_SIZE} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color }) => <User color={color} size={ICON_SIZE} />,
        }}
      />
    </Tabs>
  );
}

const stylesheet = createStyleSheet((theme) => ({
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
