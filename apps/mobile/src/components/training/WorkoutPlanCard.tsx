import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { Dumbbell, Lock, ChevronRight } from 'lucide-react-native';
import { Badge } from '../ui';
import type { WorkoutPlan } from '../../features/training/types';

interface WorkoutPlanCardProps {
  plan: WorkoutPlan;
  /** Shown when the plan is above the user's tier — tapping routes to upgrade. */
  locked?: boolean;
  onPress: () => void;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/**
 * The API stores no cover art, so the card leads with type rather than a stock
 * photo — the plan name stays legible in both themes and nothing 404s.
 */
export const WorkoutPlanCard: React.FC<WorkoutPlanCardProps> = ({ plan, locked = false, onPress }) => {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${plan.name}${locked ? ', requires an upgrade' : ''}`}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={styles.accent} />
      <View style={styles.body}>
        <View style={styles.badgesRow}>
          {plan.difficulty && (
            <Badge label={DIFFICULTY_LABEL[plan.difficulty] ?? plan.difficulty} variant="default" />
          )}
          {plan.tier !== 'free' && <Badge label={plan.tier} variant="premium" />}
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {plan.name}
        </Text>
        {plan.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {plan.description}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.stat}>
            <Dumbbell size={14} color={theme.colors.textSecondary} />
            <Text style={styles.statText}>View plan</Text>
          </View>
          {locked ? (
            <Lock size={18} color={theme.colors.warning} />
          ) : (
            <ChevronRight size={18} color={theme.colors.textSecondary} />
          )}
        </View>
      </View>
    </Pressable>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  accent: {
    width: 4,
    backgroundColor: theme.colors.primary,
  },
  body: {
    flex: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  title: {
    ...theme.typography.headingMd,
    color: theme.colors.text,
  },
  description: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  statText: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
}));
