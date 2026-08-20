import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Coffee, Sun, Moon, Apple } from 'lucide-react-native';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

interface MealCardProps {
  type: MealType;
  items: string[];
  calories: number;
  onPress?: () => void;
}

export const MealCard: React.FC<MealCardProps> = ({ type, items, calories, onPress }) => {
  const { styles, theme } = useStyles(stylesheet);

  const getMealInfo = (mealType: MealType) => {
    switch (mealType) {
      case 'breakfast':
        return { icon: <Coffee size={20} color={theme.colors.warning} />, title: 'Breakfast' };
      case 'lunch':
        return { icon: <Sun size={20} color={theme.colors.success} />, title: 'Lunch' };
      case 'dinner':
        return { icon: <Moon size={20} color={theme.colors.primary} />, title: 'Dinner' };
      case 'snack':
        return { icon: <Apple size={20} color={theme.colors.error} />, title: 'Snack' };
    }
  };

  const { icon, title } = getMealInfo(type);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconContainer}>{icon}</View>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.calories}>{calories} kcal</Text>
      </View>
      
      <View style={styles.itemsList}>
        {items.map((item, index) => (
          <Text key={index} style={styles.itemText} numberOfLines={1}>
            • {item}
          </Text>
        ))}
      </View>
    </Pressable>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  iconContainer: {
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.sm,
  },
  title: {
    ...theme.typography.headingMd,
    color: theme.colors.text,
  },
  calories: {
    ...theme.typography.labelLg,
    color: theme.colors.textSecondary,
  },
  itemsList: {
    marginTop: theme.spacing.xs,
  },
  itemText: {
    ...theme.typography.bodyMd,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
}));
