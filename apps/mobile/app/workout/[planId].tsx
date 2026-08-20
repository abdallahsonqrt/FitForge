import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useResponsiveContent } from '../../src/components/layout/useResponsiveContent';
import { goBack } from '../../src/lib/navigation';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronDown, ChevronUp, Play, Clock, Dumbbell, Flame } from 'lucide-react-native';
import { Badge, Button, ErrorState, SkeletonList } from '../../src/components/ui';
import { usePlan } from '../../src/features/training/api/usePlans';
import { estimateDayMinutes, muscleGroupsForDay } from '../../src/features/training/types';
import { getApiErrorMessage } from '../../src/lib/api';

export default function WorkoutPlanScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { styles, theme } = useStyles(stylesheet);
  const responsiveContent = useResponsiveContent({ withPadding: false });

  const plan = usePlan(planId);
  const [expandedDayId, setExpandedDayId] = useState<string | null>(null);

  const days = plan.data?.days ?? [];
  // Default the accordion to the first day once the plan resolves.
  const activeDayId = expandedDayId ?? days[0]?.id ?? null;

  const startDay = (dayId: string) =>
    router.push(`/workout/active/${dayId}?planId=${planId}`);

  if (plan.isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.content, { paddingTop: insets.top + theme.spacing.lg }]}>
          <SkeletonList count={4} height={72} />
        </View>
      </View>
    );
  }

  if (plan.isError || !plan.data) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <ErrorState
          message={getApiErrorMessage(plan.error, 'This plan could not be loaded.')}
          onRetry={() => plan.refetch()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Clears the fixed Start bar pinned to the bottom of this screen. */}
      <ScrollView contentContainerStyle={[{ paddingBottom: insets.bottom + 96 }, responsiveContent]}>
        <View style={[styles.hero, { paddingTop: insets.top + theme.spacing.md }]}>
          <Pressable
            style={styles.backButton}
            onPress={() => goBack('/(tabs)/training')}
            accessibilityRole="button"
            accessibilityLabel="Back to training plans"
            hitSlop={8}
          >
            <ArrowLeft size={22} color={theme.colors.text} />
            <Text style={styles.backLabel}>Training plans</Text>
          </Pressable>
          <Text style={styles.planName}>{plan.data.name}</Text>
          <View style={styles.badgesContainer}>
            {plan.data.difficulty && (
              <View style={styles.badge}>
                <Flame size={14} color={theme.colors.primary} />
                <Text style={styles.badgeText}>{plan.data.difficulty}</Text>
              </View>
            )}
            <View style={styles.badge}>
              <Clock size={14} color={theme.colors.primary} />
              <Text style={styles.badgeText}>
                {days.length} day{days.length === 1 ? '' : 's'}
              </Text>
            </View>
            {plan.data.tier !== 'free' && <Badge label={plan.data.tier} variant="premium" />}
          </View>
        </View>

        <View style={styles.content}>
          {plan.data.description ? (
            <>
              <Text style={styles.sectionTitle}>Overview</Text>
              <Text style={styles.description}>{plan.data.description}</Text>
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Workout Plan</Text>

          {days.length === 0 ? (
            <Text style={styles.description}>
              This plan has no days configured yet. Check back soon.
            </Text>
          ) : (
            days.map((day) => {
              const isExpanded = activeDayId === day.id;
              const muscles = muscleGroupsForDay(day);

              return (
                <View key={day.id} style={styles.dayCard}>
                  <Pressable
                    style={styles.dayHeader}
                    onPress={() => setExpandedDayId(isExpanded ? '' : day.id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isExpanded }}
                  >
                    <View style={styles.dayHeaderText}>
                      <Text style={styles.dayName}>{day.dayName}</Text>
                      <Text style={styles.dayMeta}>
                        {day.exercises.length} exercise{day.exercises.length === 1 ? '' : 's'} · ~
                        {estimateDayMinutes(day)} min
                        {muscles.length > 0 ? ` · ${muscles.join(', ')}` : ''}
                      </Text>
                    </View>
                    {isExpanded ? (
                      <ChevronUp size={20} color={theme.colors.textSecondary} />
                    ) : (
                      <ChevronDown size={20} color={theme.colors.textSecondary} />
                    )}
                  </Pressable>

                  {isExpanded && (
                    <View style={styles.exerciseList}>
                      {day.exercises.map((item) => (
                        <Pressable
                          key={item.id}
                          style={styles.exerciseRow}
                          // The day's own prescription travels with the link, so
                          // the exercise screen shows what is programmed here
                          // rather than the exercise's generic defaults.
                          onPress={() =>
                            router.push(
                              `/workout/exercise/${item.exerciseId}?sets=${item.sets}&reps=${item.reps}&rest=${item.restSeconds}`,
                            )
                          }
                        >
                          <Dumbbell size={16} color={theme.colors.primary} />
                          <Text style={styles.exerciseName}>{item.exercise?.name ?? 'Exercise'}</Text>
                          <Text style={styles.exerciseScheme}>
                            {item.sets} × {item.reps}
                          </Text>
                        </Pressable>
                      ))}
                      <Button
                        title={`Start ${day.dayName}`}
                        size="sm"
                        icon={<Play size={14} color={theme.colors.onPrimary} />}
                        onPress={() => startDay(day.id)}
                        style={styles.dayStartButton}
                      />
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {days.length > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          <Button
            title={`Start ${days[0].dayName}`}
            icon={<Play size={18} color={theme.colors.onPrimary} />}
            onPress={() => startDay(days[0].id)}
          />
        </View>
      )}
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  hero: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceElevated,
    gap: theme.spacing.sm,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.xs,
    minHeight: 36,
    marginBottom: theme.spacing.xs,
  },
  backLabel: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
  },
  planName: {
    color: theme.colors.text,
    ...theme.typography.displaySm,
  },
  badgesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing.xs,
  },
  badgeText: {
    color: theme.colors.primary,
    ...theme.typography.labelSm,
    textTransform: 'capitalize',
  },
  content: {
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    color: theme.colors.text,
    ...theme.typography.headingMd,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  description: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyMd,
    lineHeight: 22,
  },
  dayCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  dayHeaderText: {
    flex: 1,
  },
  dayName: {
    color: theme.colors.text,
    ...theme.typography.headingSm,
  },
  dayMeta: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
    marginTop: 2,
  },
  exerciseList: {
    padding: theme.spacing.md,
    paddingTop: 0,
    gap: theme.spacing.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  exerciseName: {
    color: theme.colors.text,
    ...theme.typography.bodyMd,
    flex: 1,
  },
  exerciseScheme: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
  },
  dayStartButton: {
    marginTop: theme.spacing.sm,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
}));
