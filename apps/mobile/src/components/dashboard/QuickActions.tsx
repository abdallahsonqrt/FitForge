import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Utensils, Droplet, Play, Scale } from 'lucide-react-native';

interface QuickActionsProps {
  onLogMeal: () => void;
  onLogWater: () => void;
  onStartWorkout: () => void;
  onLogWeight: () => void;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onLogMeal,
  onLogWater,
  onStartWorkout,
  onLogWeight,
}) => {
  const { styles, theme } = useStyles(stylesheet);

  const actions = [
    { id: 'meal', icon: <Utensils size={24} color={theme.colors.primary} />, label: 'Log Meal', onPress: onLogMeal },
    { id: 'water', icon: <Droplet size={24} color={theme.colors.secondary} />, label: 'Log Water', onPress: onLogWater },
    { id: 'workout', icon: <Play size={24} color={theme.colors.success} />, label: 'Workout', onPress: onStartWorkout },
    { id: 'weight', icon: <Scale size={24} color={theme.colors.warning} />, label: 'Log Weight', onPress: onLogWeight },
  ];

  return (
    <View style={styles.container}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <View style={styles.iconContainer}>{action.icon}</View>
          <Text style={styles.label}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: '44%',
    minHeight: 112,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionButtonPressed: {
    backgroundColor: theme.colors.surfaceElevated,
    transform: [{ scale: 0.98 }],
  },
  iconContainer: {
    backgroundColor: theme.colors.primarySoft,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.full,
    marginBottom: theme.spacing.sm,
  },
  label: {
    ...theme.typography.labelSm,
    color: theme.colors.text,
    textAlign: 'center',
  },
}));
