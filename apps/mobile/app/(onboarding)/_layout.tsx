import React from 'react';
import { Redirect, Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { useAuthStore } from '../../src/store/authStore';

export default function OnboardingLayout() {
  const { theme, styles } = useStyles(stylesheet);
  const authenticated = useAuthStore((state) => state.isAuthenticated);

  // Onboarding writes to the signed-in user's profile, so it has nothing to do
  // without a session.
  if (!authenticated) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTitle: '',
        headerLeft: () => (
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft color={theme.colors.text} size={24} />
          </Pressable>
        ),
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="gender" options={{ headerLeft: () => null }} />
      <Stack.Screen name="age" />
      <Stack.Screen name="height" />
      <Stack.Screen name="weight" />
      <Stack.Screen name="fitness-goal" />
      <Stack.Screen name="sport" />
      <Stack.Screen name="experience-level" />
      <Stack.Screen name="training-location" />
      <Stack.Screen name="equipment" />
      <Stack.Screen name="activity-level" />
      <Stack.Screen name="diet-preferences" />
      <Stack.Screen name="session-duration" />
      <Stack.Screen name="workout-frequency" />
    </Stack>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  backButton: {
    padding: theme.spacing.sm,
    marginLeft: -theme.spacing.sm,
  },
}));
