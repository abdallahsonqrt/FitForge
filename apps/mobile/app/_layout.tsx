import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Platform, Pressable } from 'react-native';
import { Stack, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft } from 'lucide-react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UnistylesRuntime, useStyles } from 'react-native-unistyles';
import { restoreAccessToken } from '../src/lib/api';
import { goBack } from '../src/lib/navigation';
import { queryClient } from '../src/lib/queryClient';
import '../src/theme/unistyles';
import { usePreferencesStore } from '../src/store/preferencesStore';
import { useAuthStore } from '../src/store/authStore';
import { useSessionEndedRedirect } from '../src/features/auth/useSessionEndedRedirect';
import { applyLayoutDirection } from '../src/i18n';

/**
 * Waits, on web only, until the session has an access token again.
 *
 * The web build keeps the access token in memory and the refresh token in an
 * `HttpOnly` cookie, so a reload restores a session with no usable credential in
 * hand. The app would recover on its own — every screen's first query 401s, the
 * response interceptor in `lib/api.ts` runs one shared refresh, and each request
 * retries — but that is a whole extra round of requests on every single page
 * load and a burst of 401s in the logs for a session that was never invalid.
 *
 * Spending the one refresh here instead means the first query already carries a
 * token. Nothing is rendered while it is in flight, so there is no flash of the
 * login screen: the layout is already showing its spinner for rehydration, and
 * this just keeps it up for the extra round-trip.
 *
 * Native never waits: it persists its access token, so it has one already.
 */
function useRestoredAccessToken(hydrated: boolean): boolean {
  const [ready, setReady] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (ready || !hydrated) return;

    const { isAuthenticated, accessToken } = useAuthStore.getState();
    // Signed out, or a token already in memory (a fresh sign-in rather than a
    // reload) — there is nothing to restore.
    if (!isAuthenticated || accessToken) {
      setReady(true);
      return;
    }

    let cancelled = false;
    // A failure is not handled here on purpose: `restoreAccessToken` leaves the
    // session alone, so the app renders exactly as it would have without this
    // optimisation and the usual 401 path decides whether the session is over.
    void restoreAccessToken().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, ready]);

  return ready;
}

export default function RootLayout() {
  const themePreference = usePreferencesStore((state) => state.theme);
  const language = usePreferencesStore((state) => state.language);
  const hydrated = useAuthStore((state) => state.hydrated);
  const sessionReady = useRestoredAccessToken(hydrated);
  const { theme } = useStyles();

  // Sits at the root so it covers every screen, including the ones stacked on
  // top of the tabs rather than inside an authenticated group.
  useSessionEndedRedirect();

  // A stored right-to-left preference has to be applied on launch too, not only
  // at the moment it is picked in settings.
  useEffect(() => {
    applyLayoutDirection(language);
  }, [language]);

  useEffect(() => {
    if (themePreference === 'system') {
      UnistylesRuntime.setAdaptiveThemes(true);
    } else {
      UnistylesRuntime.setAdaptiveThemes(false);
      UnistylesRuntime.setTheme(themePreference);
    }
  }, [themePreference]);

  const isDark =
    themePreference === 'system' ? UnistylesRuntime.themeName === 'dark' : themePreference === 'dark';

  // Routes stacked on top of the tabs get a real native header, so each one has a
  // working back affordance without hand-rolling one per screen.
  //
  // The back button is ours rather than the built-in one: the default hides itself
  // whenever the stack has nothing to pop, which is every web refresh, deep link and
  // notification tap onto one of these screens. `fallback` is where back would have
  // led, so the arrow is always there and always goes somewhere.
  const stackedHeader = (fallback: Href) =>
    ({
      headerShown: true,
      headerStyle: { backgroundColor: theme.colors.surface },
      headerTintColor: theme.colors.text,
      headerTitleStyle: { color: theme.colors.text },
      headerShadowVisible: false,
      headerLeft: () => (
        <Pressable
          onPress={() => goBack(fallback)}
          style={{ padding: theme.spacing.sm, marginLeft: -theme.spacing.sm }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={24} color={theme.colors.text} />
        </Pressable>
      ),
    }) as const;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          {hydrated && sessionReady ? (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.background },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(tabs)" />
              {/* The coach workspace. A declaration only — the group carries its own role guard. */}
              <Stack.Screen name="(coach)" />
              <Stack.Screen
                name="coaches/[id]"
                options={{ ...stackedHeader('/'), title: 'Coach profile' }}
              />
              {/* The title is the exercise name, so the screen itself supplies it. */}
              <Stack.Screen
                name="workout/exercise/[id]"
                options={stackedHeader('/(tabs)/training')}
              />
              <Stack.Screen
                name="subscription"
                options={{ ...stackedHeader('/(tabs)/profile'), title: 'Subscription' }}
              />
              <Stack.Screen
                name="meal/log"
                options={{ ...stackedHeader('/(tabs)/nutrition'), title: 'AI Meal Logger' }}
              />
              <Stack.Screen
                name="meal/calculator"
                options={{ ...stackedHeader('/(tabs)/nutrition'), title: 'Search Food' }}
              />
              <Stack.Screen
                name="settings/account"
                options={{ ...stackedHeader('/(tabs)/profile'), title: 'Account' }}
              />
              <Stack.Screen
                name="settings/devices"
                options={{ ...stackedHeader('/(tabs)/profile'), title: 'Devices' }}
              />
              <Stack.Screen
                name="settings/theme"
                options={{ ...stackedHeader('/(tabs)/profile'), title: 'Appearance' }}
              />
              <Stack.Screen
                name="settings/notifications"
                options={{ ...stackedHeader('/(tabs)/profile'), title: 'Notifications' }}
              />
              <Stack.Screen
                name="settings/language"
                options={{ ...stackedHeader('/(tabs)/profile'), title: 'Language' }}
              />
              <Stack.Screen
                name="settings/units"
                options={{ ...stackedHeader('/(tabs)/profile'), title: 'Units' }}
              />
              {/*
                Applying is an *athlete* action — the applicant still holds the
                `user` role — so this lives outside `(coach)`, whose guard would
                bounce them straight back out.
              */}
              <Stack.Screen
                name="coach-apply"
                options={{ ...stackedHeader('/(tabs)/profile'), title: 'Become a coach' }}
              />
              {/*
                Coach detail screens sit outside the `(coach)` group so they push
                over the coach tab bar rather than inside it, the same way
                `workout/*` and `settings/*` relate to the athlete tabs. Each
                falls back to its own tab when the stack cannot pop.
              */}
              <Stack.Screen
                name="coach/program/[planId]"
                options={{ ...stackedHeader('/(coach)/programs'), title: 'Program' }}
              />
              <Stack.Screen
                name="coach/client/[enrollmentId]"
                options={{ ...stackedHeader('/(coach)/clients'), title: 'Client' }}
              />
              <Stack.Screen
                name="coach/conversation/[conversationId]"
                options={{ ...stackedHeader('/(coach)/messages'), title: 'Conversation' }}
              />
            </Stack>
          ) : (
            // Holding here avoids a flash of the login screen before the persisted
            // session is read back from storage — and, on web, before the refresh
            // cookie has produced an access token to render with.
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.background,
              }}
            >
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          )}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
