import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ProgressBar } from '../ui';

interface CalorieBarProps {
  consumed: number;
  target: number;
}

export const CalorieBar: React.FC<CalorieBarProps> = ({ consumed, target }) => {
  const { styles, theme } = useStyles(stylesheet);
  const progress = target > 0 ? Math.min(consumed / target, 1) : 0;
  const remaining = Math.max(target - consumed, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>CALORIES TODAY</Text>
          <Text style={styles.value}>{Math.round(consumed)} kcal</Text>
          <Text style={styles.label}>eaten</Text>
        </View>
        <View style={styles.rightContainer}>
          <Text style={styles.remaining}>{Math.round(remaining)} kcal</Text>
          <Text style={styles.remainingLabel}>left</Text>
        </View>
      </View>
      <ProgressBar progress={progress} color={theme.colors.primary} height={12} />
      <View style={styles.footer}>
        <Text style={styles.targetLabel}>Daily target</Text>
        <Text style={styles.target}>{Math.round(target).toLocaleString()} kcal</Text>
      </View>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  rightContainer: {
    alignItems: 'flex-end',
  },
  eyebrow: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: theme.spacing.xs,
  },
  value: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
  },
  remaining: {
    ...theme.typography.headingLg,
    color: theme.colors.primary,
  },
  remainingLabel: {
    ...theme.typography.labelSm,
    color: theme.colors.primary,
  },
  target: {
    ...theme.typography.headingLg,
    color: theme.colors.textSecondary,
  },
  label: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  targetLabel: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
}));
