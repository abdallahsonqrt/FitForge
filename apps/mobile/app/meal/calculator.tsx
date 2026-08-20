import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Search, X, Clock, Star, Sparkles, ChevronRight } from 'lucide-react-native';
import { Button, ErrorState, SkeletonList } from '../../src/components/ui';
import { FoodResultCard } from '../../src/components/nutrition/FoodResultCard';
import { FoodGroupSection } from '../../src/components/nutrition/FoodGroupSection';
import { PortionSheet } from '../../src/components/nutrition/PortionSheet';
import {
  useFoodSearch,
  useFoodAutocomplete,
} from '../../src/features/nutrition/api/useFoodSearch';
import {
  useFoodSuggestions,
  useToggleFavorite,
  useRecordFoodUsage,
} from '../../src/features/nutrition/api/useFoodPersonalization';
import { useLogMeal } from '../../src/features/nutrition/api/useMeals';
import { useRecentMeals } from '../../src/features/nutrition/api/useMeals';
import {
  FOOD_CATEGORIES,
  FOOD_CATEGORY_LABEL,
  type FoodCategory,
  type FoodItem,
} from '../../src/features/nutrition/types';
import { getApiErrorMessage } from '../../src/lib/api';
import { showAlert } from '../../src/lib/alert';
import { useResponsiveContent } from '../../src/components/layout/useResponsiveContent';
import { todayIso } from '../../src/utils/date';

const DEBOUNCE_MS = 250;

export default function FoodSearchScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const responsiveContent = useResponsiveContent({ withPadding: false });

  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [category, setCategory] = useState<FoodCategory | undefined>();
  // Held by id, not by value. The object captured at tap time goes stale the
  // moment anything about the food changes — most visibly the favourite star,
  // which stayed unfilled forever and made a food impossible to un-star from
  // the sheet, because the flag being sent was the frozen one.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(false);

  // Debounce the full search so a provider round trip isn't fired per keystroke.
  // Autocomplete runs undebounced: it is local-only and needs to feel immediate.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedTerm(term), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [term]);

  const results = useFoodSearch(debouncedTerm, category);
  const suggestions = useFoodAutocomplete(term);
  const feed = useFoodSuggestions();
  const recentMeals = useRecentMeals();

  const toggleFavorite = useToggleFavorite();
  const recordUsage = useRecordFoodUsage();
  const logMeal = useLogMeal();

  const isTyping = term !== debouncedTerm;
  const hasQuery = debouncedTerm.trim().length >= 2;

  /** Every food currently on screen, wherever it is being rendered from. */
  const visibleFoods = useMemo(
    () => [
      ...(results.data?.results ?? []),
      ...(results.data?.groups ?? []).flatMap((group) => group.items),
      ...(results.data?.ungrouped ?? []),
      ...(feed.data?.forThisMeal ?? []),
      ...(feed.data?.favorites ?? []),
      ...(feed.data?.recent ?? []),
    ],
    [results.data, feed.data],
  );

  /** The live version of the opened food, so the sheet reflects cache updates. */
  const selected = useMemo(
    () => (selectedId ? (visibleFoods.find((food) => food.id === selectedId) ?? null) : null),
    [selectedId, visibleFoods],
  );

  /**
   * Shown until the user commits to a term or dismisses it — not merely while a
   * request is in flight. A warm search resolves in milliseconds, so tying this
   * to `isFetching` closed the dropdown before a finger could reach it.
   */
  const showAutocomplete =
    term.trim().length >= 1 &&
    !dismissedSuggestions &&
    term !== debouncedTerm.trim() &&
    !!suggestions.data?.length;

  const handleToggleFavorite = (food: FoodItem) =>
    toggleFavorite.mutate(
      { foodId: food.id, isFavorite: food.isFavorite },
      {
        onError: (error) =>
          showAlert('Could not update favourites', getApiErrorMessage(error)),
      },
    );

  const handleSave: React.ComponentProps<typeof PortionSheet>['onSave'] = ({
    food,
    grams,
    mealType,
    macros,
  }) => {
    const base = food.brand ? `${food.displayName} (${food.brand})` : food.displayName;

    logMeal.mutate(
      {
        // The portion is part of what was eaten, so it belongs in the log entry —
        // "Chicken breast · 172 g" is reviewable later, the bare name is not.
        name: `${base} · ${Math.round(grams)} g`,
        type: mealType,
        ...macros,
        date: todayIso(),
      },
      {
        onSuccess: () => {
          // Fire-and-forget: this only feeds suggestions and ranking, so a
          // failure must not make a saved meal look unsaved.
          recordUsage.mutate({ foodId: food.id, mealType });
          setSelectedId(null);
          router.replace('/(tabs)/nutrition');
        },
        onError: (error) => showAlert('Could not save meal', getApiErrorMessage(error)),
      },
    );
  };

  const renderResults = () => {
    // Only when there is nothing to show at all. `keepPreviousData` exists so a
    // refinement keeps the old list up; blanking on `isTyping` threw that away
    // and flashed skeletons on every keystroke.
    if (results.isLoading) return <SkeletonList count={6} height={84} />;

    if (results.isError) {
      return (
        <ErrorState
          message={getApiErrorMessage(results.error, 'Food search is unavailable right now.')}
          onRetry={() => results.refetch()}
        />
      );
    }

    const groups = results.data?.groups ?? [];
    const ungrouped = results.data?.ungrouped ?? [];

    if (groups.length === 0 && ungrouped.length === 0) {
      return (
        <View style={styles.hintBox}>
          <Text style={styles.hintTitle}>No matches</Text>
          <Text style={styles.hintText}>
            Nothing found for “{debouncedTerm}”
            {category ? ` in ${FOOD_CATEGORY_LABEL[category]}` : ''}. Try a simpler term
            {category ? ', clear the category filter,' : ''} or describe the meal to the AI logger.
          </Text>
          {category && (
            <Button
              title="Clear category"
              variant="outline"
              onPress={() => setCategory(undefined)}
              style={styles.hintButton}
            />
          )}
          <Button
            title="Use the AI logger"
            variant="outline"
            onPress={() => router.replace('/meal/log')}
            style={styles.hintButton}
          />
        </View>
      );
    }

    // Families first, then the singletons. The API already ranked both, and a
    // group sits at the position its strongest member earned.
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listContent, responsiveContent]}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((group) => (
          <FoodGroupSection
            key={group.key}
            group={group}
            onSelect={(item) => setSelectedId(item.id)}
            onToggleFavorite={handleToggleFavorite}
          />
        ))}

        {ungrouped.map((item, index) => (
          <View key={item.id}>
            {index > 0 && <View style={styles.separator} />}
            <FoodResultCard
              food={item}
              onPress={() => setSelectedId(item.id)}
              onToggleFavorite={handleToggleFavorite}
            />
          </View>
        ))}
      </ScrollView>
    );
  };

  /** Shown before anything is typed: this meal, favourites, recents. */
  const renderFeed = () => {
    if (feed.isLoading) return <SkeletonList count={5} height={84} />;

    // Without this branch a failed request looks exactly like a brand-new
    // account: the user's favourites and recents silently vanish, with nothing
    // to retry. The results view already handles its own errors this way.
    if (feed.isError) {
      return (
        <ErrorState
          message={getApiErrorMessage(feed.error, 'Could not load your foods right now.')}
          onRetry={() => feed.refetch()}
        />
      );
    }

    const sections = [
      {
        key: 'meal',
        title: `For ${feed.data?.mealType ?? 'this meal'}`,
        icon: <Sparkles size={16} color={theme.colors.primary} />,
        items: feed.data?.forThisMeal ?? [],
      },
      {
        key: 'favorites',
        title: 'Favourites',
        icon: <Star size={16} color={theme.colors.warning} />,
        items: feed.data?.favorites ?? [],
      },
      {
        key: 'recent',
        title: 'Recent',
        icon: <Clock size={16} color={theme.colors.textSecondary} />,
        items: feed.data?.recent ?? [],
      },
    ].filter((section) => section.items.length > 0);

    if (sections.length === 0) {
      if (recentMeals.data?.length) {
        return (
          <View style={styles.recentMeals}>
            <View style={styles.recentMealsHeader}>
              <View>
                <Text style={styles.recentMealsTitle}>Recently eaten</Text>
                <Text style={styles.recentMealsSubtitle}>Tap an item to search for it again.</Text>
              </View>
              <Clock size={20} color={theme.colors.primary} />
            </View>
            {recentMeals.data.map((meal, index) => {
              const searchTerm = meal.name.split('·')[0].trim();
              return (
                <Pressable
                  key={meal.id}
                  style={({ pressed }) => [styles.recentMealRow, pressed && styles.rowPressed]}
                  onPress={() => {
                    setTerm(searchTerm);
                    setDebouncedTerm(searchTerm);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Search for ${searchTerm} again`}
                >
                  <View style={styles.recentMealIcon}>
                    <Clock size={16} color={theme.colors.primary} />
                  </View>
                  <View style={styles.recentMealCopy}>
                    <Text style={styles.recentMealName} numberOfLines={1}>{meal.name}</Text>
                    <Text style={styles.recentMealMeta}>{meal.type}</Text>
                  </View>
                  <Text style={styles.recentMealCalories}>{Math.round(meal.calories)} kcal</Text>
                  {index < recentMeals.data.length - 1 && <View style={styles.recentMealSeparator} />}
                </Pressable>
              );
            })}
          </View>
        );
      }

      return (
        <View style={styles.hintBox}>
          <Search size={28} color={theme.colors.textSecondary} />
          <Text style={styles.hintTitle}>Search for a food</Text>
          <Text style={styles.hintText}>
            Type at least two characters. Search works in English and Arabic — try “chicken” or
            “دجاج”.
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listContent, responsiveContent]}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section) => (
          <View key={section.key} style={styles.section}>
            <View style={styles.sectionHeader}>
              {section.icon}
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            {section.items.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <View style={styles.separator} />}
                <FoodResultCard
                  food={item}
                  onPress={() => setSelectedId(item.id)}
                  onToggleFavorite={handleToggleFavorite}
                />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.searchBar, responsiveContent]}>
        <Search size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search foods — chicken, أرز, kunafa…"
          placeholderTextColor={theme.colors.textSecondary}
          value={term}
          onChangeText={(next) => {
            setTerm(next);
            setDismissedSuggestions(false);
          }}
          onSubmitEditing={() => {
            setDebouncedTerm(term);
            setDismissedSuggestions(true);
          }}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          autoFocus
        />
        {term.length > 0 && (
          <Pressable
            onPress={() => {
              // Reset both at once, or `hasQuery` stays true and the user waits
              // out the debounce staring at skeletons before the feed returns.
              setTerm('');
              setDebouncedTerm('');
              setDismissedSuggestions(false);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <X size={18} color={theme.colors.textSecondary} />
          </Pressable>
        )}
        {results.isFetching && !results.isLoading && (
          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
        )}
      </View>

      {showAutocomplete && (
        <View style={[styles.autocomplete, responsiveContent]}>
          {suggestions.data?.slice(0, 6).map((suggestion) => (
            <Pressable
              key={suggestion.id}
              style={({ pressed }) => [styles.suggestionRow, pressed && styles.rowPressed]}
              // Committing the term immediately skips the debounce, so tapping a
              // suggestion searches at once instead of after another delay.
              onPress={() => {
                setTerm(suggestion.displayName);
                setDebouncedTerm(suggestion.displayName);
                setDismissedSuggestions(true);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.suggestionEmoji}>{suggestion.emoji}</Text>
              <Text style={styles.suggestionText} numberOfLines={1}>
                {suggestion.displayName}
              </Text>
              <Text style={styles.suggestionMeta}>{suggestion.calories} kcal</Text>
              <ChevronRight size={14} color={theme.colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}

      <ScrollView
        horizontal
        style={styles.categoryScroller}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.categoryRow, responsiveContent]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          style={[styles.categoryChip, !category && styles.categoryChipActive]}
          onPress={() => setCategory(undefined)}
          accessibilityRole="radio"
          accessibilityState={{ selected: !category }}
        >
          <Text style={[styles.categoryText, !category && styles.categoryTextActive]}>All</Text>
        </Pressable>

        {FOOD_CATEGORIES.filter((item) => item !== 'other').map((item) => (
          <Pressable
            key={item}
            style={[styles.categoryChip, category === item && styles.categoryChipActive]}
            onPress={() => setCategory(category === item ? undefined : item)}
            accessibilityRole="radio"
            accessibilityState={{ selected: category === item }}
          >
            <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>
              {FOOD_CATEGORY_LABEL[item]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {hasQuery ? renderResults() : renderFeed()}

      <PortionSheet
        food={selected}
        saving={logMeal.isPending}
        onClose={() => setSelectedId(null)}
        onToggleFavorite={handleToggleFavorite}
        onSave={handleSave}
      />
    </View>
  );
}

const stylesheet = createStyleSheet((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    height: 48,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    ...theme.typography.bodyLg,
    // React Native Web otherwise renders the browser's default white focus ring
    // inside the styled search container.
    outlineStyle: 'none',
  },
  autocomplete: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  rowPressed: { opacity: 0.6 },
  suggestionEmoji: { fontSize: 16, lineHeight: 20, width: 22 },
  suggestionText: { flex: 1, color: theme.colors.text, ...theme.typography.bodyMd },
  suggestionMeta: { color: theme.colors.textSecondary, ...theme.typography.bodyXs },
  categoryRow: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  categoryScroller: {
    // A horizontal ScrollView can otherwise stretch to the remaining screen
    // height on web. Keep filters a compact, single-row control.
    flexGrow: 0,
    flexShrink: 0,
    height: 52,
  },
  categoryChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    minHeight: 36,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  categoryChipActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  categoryText: { color: theme.colors.textSecondary, ...theme.typography.labelSm },
  categoryTextActive: { color: theme.colors.primary },
  listContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing['3xl'] },
  separator: { height: 1, backgroundColor: theme.colors.border },
  section: { marginBottom: theme.spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.textSecondary,
    ...theme.typography.labelSm,
    textTransform: 'uppercase',
  },
  hintBox: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing['2xl'],
    gap: theme.spacing.sm,
  },
  hintTitle: { color: theme.colors.text, ...theme.typography.headingMd },
  hintText: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyMd,
    textAlign: 'center',
    lineHeight: 20,
  },
  hintButton: { marginTop: theme.spacing.md, minWidth: 200 },
  recentMeals: {
    marginHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  recentMealsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  recentMealsTitle: { color: theme.colors.text, ...theme.typography.headingSm },
  recentMealsSubtitle: { color: theme.colors.textSecondary, ...theme.typography.bodySm, marginTop: 2 },
  recentMealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  recentMealIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primarySoft,
  },
  recentMealCopy: { flex: 1 },
  recentMealName: { color: theme.colors.text, ...theme.typography.labelMd },
  recentMealMeta: { color: theme.colors.textSecondary, ...theme.typography.bodyXs, textTransform: 'capitalize', marginTop: 2 },
  recentMealCalories: { color: theme.colors.textSecondary, ...theme.typography.labelSm },
  recentMealSeparator: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: 0,
    height: 1,
    backgroundColor: theme.colors.border,
  },
}));
