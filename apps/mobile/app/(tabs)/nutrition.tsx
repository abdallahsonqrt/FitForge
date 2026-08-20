import React, { useMemo } from 'react';
import { View, Text, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { MessageSquare, Search, UtensilsCrossed } from 'lucide-react-native';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { getApiErrorMessage } from '../../src/lib/api';
import { SectionHeader } from '../../src/components/layout/SectionHeader';
import { CalorieBar } from '../../src/components/nutrition/CalorieBar';
import { MacroSummary } from '../../src/components/nutrition/MacroSummary';
import { MealCard } from '../../src/components/nutrition/MealCard';
import { WaterStepWidget } from '../../src/components/nutrition/WaterStepWidget';
import { Button, EmptyState, ErrorState, Skeleton } from '../../src/components/ui';
import { useMe } from '../../src/features/users/api/useMe';
import { useMeals, useMealSummary } from '../../src/features/nutrition/api/useMeals';
import { useLogWater, useWaterTotal } from '../../src/features/nutrition/api/useWater';
import { useStepsTotal } from '../../src/features/nutrition/api/useSteps';
import { MEAL_TYPES, type MealType } from '../../src/features/nutrition/types';
import { deriveDailyGoals, WATER_INCREMENT_ML } from '../../src/utils/goals';
import { usePreferencesStore } from '../../src/store/preferencesStore';
import { useTranslation } from '../../src/i18n';

export default function NutritionScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  const me = useMe();
  const summary = useMealSummary();
  const meals = useMeals();
  const water = useWaterTotal();
  const steps = useStepsTotal();
  const logWater = useLogWater();

  const goals = useMemo(() => deriveDailyGoals(me.data), [me.data]);
  const units = usePreferencesStore((state) => state.units);

  /** Meals arrive as flat rows; the UI groups them into the four meal slots. */
  const mealsByType = useMemo(() => {
    const grouped = new Map<MealType, { names: string[]; calories: number }>();
    for (const meal of meals.data ?? []) {
      const entry = grouped.get(meal.type) ?? { names: [], calories: 0 };
      entry.names.push(meal.name);
      entry.calories += meal.calories;
      grouped.set(meal.type, entry);
    }
    return grouped;
  }, [meals.data]);

  const isRefreshing = summary.isFetching || meals.isFetching || water.isFetching || steps.isFetching;

  const refreshAll = () => {
    summary.refetch();
    meals.refetch();
    water.refetch();
    steps.refetch();
  };

  const totals = summary.data;

  // "Nothing logged today" is a very different message from "we could not
  // reach the server", and the screen used to show the former for both.
  const loadError = summary.isError ? summary.error : meals.isError ? meals.error : null;
  if (loadError) {
    return (
      <ScreenContainer insideTabs onRefresh={refreshAll} refreshing={isRefreshing}>
        <ErrorState
          message={getApiErrorMessage(loadError, t('common.somethingWentWrong'))}
          onRetry={refreshAll}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer insideTabs onRefresh={refreshAll} refreshing={isRefreshing}>
      {summary.isLoading ? (
        <Skeleton height={96} />
      ) : (
        <CalorieBar consumed={totals?.calories ?? 0} target={goals.calories} />
      )}

      <View style={styles.sectionSpacing} />

      <MacroSummary
        protein={{
          label: 'Protein',
          consumed: totals?.protein ?? 0,
          target: goals.proteinGrams,
          color: theme.colors.primary,
        }}
        carbs={{
          label: 'Carbs',
          consumed: totals?.carbs ?? 0,
          target: goals.carbsGrams,
          color: theme.colors.secondary,
        }}
        fat={{
          label: 'Fat',
          consumed: totals?.fat ?? 0,
          target: goals.fatGrams,
          color: theme.colors.warning,
        }}
      />

      {goals.isEstimated && (
        <Text style={styles.goalNote}>
          Macro targets are generic estimates — complete your profile for personalised numbers.
        </Text>
      )}

      <View style={styles.sectionSpacing} />

      <WaterStepWidget
        waterMl={water.data ?? 0}
        waterGoalMl={goals.waterMl}
        incrementMl={WATER_INCREMENT_ML}
        units={units}
        steps={steps.data ?? 0}
        stepGoal={goals.steps}
        onAddWater={() => logWater.mutate(WATER_INCREMENT_ML)}
      />

      <View style={styles.sectionSpacing} />

      <View style={[styles.actions, isCompact && styles.actionsStacked]}>
        <Button
          title={t('nutrition.logWithAi')}
          icon={<MessageSquare size={18} color={theme.colors.onPrimary} />}
          onPress={() => router.push('/meal/log')}
          style={styles.actionButton}
        />
        <Button
          title={t('nutrition.searchFood')}
          icon={<Search size={18} color={theme.colors.primary} />}
          variant="outline"
          onPress={() => router.push('/meal/calculator')}
          style={styles.actionButton}
        />
      </View>

      <View style={styles.sectionSpacing} />

      <SectionHeader title={t('nutrition.todaysMeals')} />
      {meals.isLoading ? (
        <Skeleton height={180} />
      ) : mealsByType.size === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed size={32} color={theme.colors.primary} />}
          title={t('nutrition.nothingLogged')}
          description="Describe what you ate and the AI logger will work out the macros."
          actionLabel="Log a meal"
          onAction={() => router.push('/meal/log')}
          style={styles.emptyMeals}
        />
      ) : (
        MEAL_TYPES.filter((type) => mealsByType.has(type)).map((type) => {
          const entry = mealsByType.get(type)!;
          return <MealCard key={type} type={type} items={entry.names} calories={Math.round(entry.calories)} />;
        })
      )}
    </ScreenContainer>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  sectionSpacing: {
    height: theme.spacing.xl,
  },
  goalNote: {
    ...theme.typography.bodyXs,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  actionsStacked: {
    flexDirection: 'column',
  },
  actionButton: {
    flex: 1,
  },
  emptyMeals: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
}));
