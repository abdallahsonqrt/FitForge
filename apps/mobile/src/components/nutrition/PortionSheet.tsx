import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Star } from 'lucide-react-native';
import { Button, Modal } from '../ui';
import {
  MEAL_TYPES,
  gramsForServing,
  macrosForGrams,
  type FoodItem,
  type MacroTotals,
  type MealType,
  type ServingOption,
} from '../../features/nutrition/types';

interface PortionSheetProps {
  food: FoodItem | null;
  saving?: boolean;
  onClose: () => void;
  onToggleFavorite?: (food: FoodItem) => void;
  onSave: (payload: {
    food: FoodItem;
    /** Total weight of the chosen portion — the macros are already scaled to it. */
    grams: number;
    mealType: MealType;
    macros: MacroTotals;
  }) => void;
}

/**
 * Portion and meal-type picker.
 *
 * The amount is expressed in whatever unit the user picked — "2 slices",
 * "1.5 cups" — and converted to grams behind the scenes, because grams are the
 * only basis the nutrition figures scale from. The user never sees that step.
 */
export const PortionSheet: React.FC<PortionSheetProps> = ({
  food,
  saving = false,
  onClose,
  onToggleFavorite,
  onSave,
}) => {
  const { styles, theme } = useStyles(stylesheet);

  const [servingId, setServingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('1');
  const [mealType, setMealType] = useState<MealType>('snack');

  // Reset each time a different food is opened, onto its own default portion.
  useEffect(() => {
    if (!food) return;

    const defaultServing = food.servings.find((serving) => serving.isDefault) ?? food.servings[0];
    setServingId(defaultServing?.id ?? null);
    setAmount(String(defaultServing?.amount ?? 100));
    setMealType('snack');
  }, [food]);

  const serving: ServingOption | null = useMemo(() => {
    if (!food) return null;
    return food.servings.find((option) => option.id === servingId) ?? food.servings[0] ?? null;
  }, [food, servingId]);

  const parsedAmount = useMemo(() => {
    // Accept a comma decimal separator — standard across Arabic and European keyboards.
    const value = Number(amount.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, [amount]);

  const grams = useMemo(
    () => (serving ? gramsForServing(serving, parsedAmount) : parsedAmount),
    [serving, parsedAmount],
  );

  const macros = useMemo(() => (food ? macrosForGrams(food, grams) : null), [food, grams]);

  const save = () => {
    if (!food || !macros || grams <= 0) return;

    onSave({ food, grams, mealType, macros });
  };

  return (
    <Modal visible={!!food} onClose={onClose}>
      {food && (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <Text style={styles.name}>{food.displayName}</Text>
              {food.displayName !== food.name && <Text style={styles.subName}>{food.name}</Text>}
            </View>

            {onToggleFavorite && (
              <Pressable
                onPress={() => onToggleFavorite(food)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  food.isFavorite ? 'Remove from favourites' : 'Add to favourites'
                }
                accessibilityState={{ selected: food.isFavorite }}
              >
                <Star
                  size={22}
                  color={food.isFavorite ? theme.colors.warning : theme.colors.textSecondary}
                  fill={food.isFavorite ? theme.colors.warning : 'transparent'}
                />
              </Pressable>
            )}
          </View>

          <Text style={styles.label}>Serving</Text>
          <View style={styles.servingRow}>
            {food.servings.map((option) => (
              <Pressable
                key={option.id}
                style={[styles.chip, serving?.id === option.id && styles.chipActive]}
                onPress={() => {
                  setServingId(option.id);
                  // Snap the amount to the portion's own natural quantity, so
                  // switching from "100 g" to "1 breast" doesn't ask for 100 of them.
                  setAmount(String(option.amount));
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: serving?.id === option.id }}
              >
                <Text
                  style={[styles.chipText, serving?.id === option.id && styles.chipTextActive]}
                >
                  {option.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountRow}>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              selectTextOnFocus
              accessibilityLabel="Amount"
            />
            <Text style={styles.amountUnit}>{serving?.unit ?? 'g'}</Text>
          </View>
          {serving && serving.unit !== 'g' && grams > 0 && (
            <Text style={styles.gramsHint}>= {Math.round(grams)} g</Text>
          )}

          <Text style={styles.label}>Meal</Text>
          <View style={styles.typeRow}>
            {MEAL_TYPES.map((type) => (
              <Pressable
                key={type}
                style={[styles.chip, mealType === type && styles.chipActive]}
                onPress={() => setMealType(type)}
                accessibilityRole="radio"
                accessibilityState={{ selected: mealType === type }}
              >
                <Text style={[styles.chipText, mealType === type && styles.chipTextActive]}>
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>

          {macros && (
            <View style={styles.macroCard}>
              <View style={styles.macroPrimary}>
                <Text style={styles.macroCalories}>{macros.calories}</Text>
                <Text style={styles.macroCaloriesUnit}>kcal</Text>
              </View>
              <View style={styles.macroBreakdown}>
                {(
                  [
                    ['Protein', macros.protein, theme.colors.primary],
                    ['Carbs', macros.carbs, theme.colors.secondary],
                    ['Fat', macros.fat, theme.colors.warning],
                  ] as const
                ).map(([label, value, color]) => (
                  <View key={label} style={styles.macroItem}>
                    <Text style={[styles.macroValue, { color }]}>{value}g</Text>
                    <Text style={styles.macroLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              {(food.per100g.fiber > 0 || food.per100g.sugar > 0) && (
                <Text style={styles.microNutrients}>
                  Fiber {Math.round((food.per100g.fiber * grams) / 10) / 10}g · Sugar{' '}
                  {Math.round((food.per100g.sugar * grams) / 10) / 10}g
                </Text>
              )}
            </View>
          )}

          <Button
            title="Add to today"
            onPress={save}
            loading={saving}
            disabled={grams <= 0 || saving}
          />
        </ScrollView>
      )}
    </Modal>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  titleText: { flex: 1 },
  name: { color: theme.colors.text, ...theme.typography.headingLg },
  subName: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
    marginTop: theme.spacing.xs,
  },
  label: {
    color: theme.colors.textSecondary,
    ...theme.typography.labelSm,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  servingRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginBottom: theme.spacing.lg,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary },
  chipText: {
    color: theme.colors.textSecondary,
    ...theme.typography.labelSm,
    textTransform: 'capitalize',
  },
  chipTextActive: { color: theme.colors.primary },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  amountInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    ...theme.typography.bodyLg,
    outlineStyle: 'none',
  },
  amountUnit: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyMd,
    minWidth: 72,
  },
  gramsHint: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodySm,
    marginTop: theme.spacing.xs,
  },
  typeRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginBottom: theme.spacing.lg,
    marginTop: theme.spacing.lg,
  },
  macroCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  macroPrimary: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xs },
  macroCalories: { color: theme.colors.text, ...theme.typography.displaySm },
  macroCaloriesUnit: { color: theme.colors.textSecondary, ...theme.typography.bodyMd },
  macroBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  macroItem: { alignItems: 'center', flex: 1 },
  macroValue: { ...theme.typography.headingSm },
  macroLabel: { color: theme.colors.textSecondary, ...theme.typography.bodyXs, marginTop: 2 },
  microNutrients: {
    color: theme.colors.textSecondary,
    ...theme.typography.bodyXs,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
}));
