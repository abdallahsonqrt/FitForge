import React from 'react';
import { View, Text, Image, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Star } from 'lucide-react-native';
import { macrosForGrams, type FoodItem } from '../../features/nutrition/types';

interface FoodResultCardProps {
  food: FoodItem;
  onPress: () => void;
  onToggleFavorite?: (food: FoodItem) => void;
  /** Indented, icon-less variant used for rows inside a group. */
  nested?: boolean;
}

/**
 * One food in a results list.
 *
 * Shows the normalised name and icon the API supplies, never the provider's own
 * wording — "🥚 Whole Egg", not "Eggs, Grade A, Large, egg whole". The raw name
 * still arrives on `food.name`, but rendering it is what made this feel like a
 * government database rather than a fitness app.
 *
 * Macros are for the food's default portion rather than a flat 100 g: "1 egg,
 * 72 kcal" is a figure someone can act on without doing arithmetic first.
 */
export const FoodResultCard: React.FC<FoodResultCardProps> = ({
  food,
  onPress,
  onToggleFavorite,
  nested = false,
}) => {
  const { styles, theme } = useStyles(stylesheet);

  const macros = macrosForGrams(food, food.defaultGrams);
  const defaultServing = food.servings.find((serving) => serving.isDefault);
  const portionLabel = defaultServing?.name ?? `${Math.round(food.defaultGrams)} g`;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, nested && styles.cardNested, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${food.displayName}${food.brand ? `, ${food.brand}` : ''}, ${
        macros.calories
      } calories per ${portionLabel}`}
    >
      {/* A product photo beats an icon when one exists, but most foods have none. */}
      {food.imageUrl ? (
        <Image source={{ uri: food.imageUrl }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.emojiTile]}>
          <Text style={styles.emoji}>{food.emoji}</Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {food.displayName}
        </Text>

        <Text style={styles.meta} numberOfLines={1}>
          {food.brand ? `${food.brand} · ` : ''}
          {portionLabel}
        </Text>

        <View style={styles.macroRow}>
          <Text style={styles.calories}>{macros.calories} kcal</Text>
          <View style={styles.macros}>
            {(
              [
                ['P', macros.protein, theme.colors.primary],
                ['C', macros.carbs, theme.colors.secondary],
                ['F', macros.fat, theme.colors.warning],
              ] as const
            ).map(([label, value, color]) => (
              <Text key={label} style={styles.macro}>
                <Text style={{ color }}>{label}</Text>
                <Text style={styles.macroValue}> {value}g</Text>
              </Text>
            ))}
          </View>
        </View>
      </View>

      {onToggleFavorite && (
        <Pressable
          onPress={() => onToggleFavorite(food)}
          hitSlop={10}
          style={styles.favoriteButton}
          accessibilityRole="button"
          accessibilityLabel={
            food.isFavorite
              ? `Remove ${food.displayName} from favourites`
              : `Add ${food.displayName} to favourites`
          }
          accessibilityState={{ selected: food.isFavorite }}
        >
          <Star
            size={20}
            color={food.isFavorite ? theme.colors.warning : theme.colors.textSecondary}
            fill={food.isFavorite ? theme.colors.warning : 'transparent'}
          />
        </Pressable>
      )}
    </Pressable>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  // Inside a group the family is already named by the header, so the row steps
  // back: indented, and the icon shrinks to a quiet marker.
  cardNested: { paddingLeft: theme.spacing.lg, paddingVertical: theme.spacing.sm },
  pressed: { opacity: 0.6 },
  image: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceElevated,
  },
  emojiTile: { alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26, lineHeight: 32 },
  body: { flex: 1, gap: 2 },
  name: { color: theme.colors.text, ...theme.typography.bodyLg },
  meta: { color: theme.colors.textSecondary, ...theme.typography.bodySm },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.md,
    marginTop: 2,
  },
  calories: { color: theme.colors.text, ...theme.typography.labelMd },
  macros: { flexDirection: 'row', gap: theme.spacing.sm, flexShrink: 1 },
  macro: { ...theme.typography.bodySm },
  macroValue: { color: theme.colors.textSecondary },
  favoriteButton: { padding: theme.spacing.xs },
}));
