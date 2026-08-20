import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ProgressBar } from '../ui';
import { Footprints } from 'lucide-react-native';

interface StepCounterProps {
  steps: number;
  goal: number;
}

export const StepCounter: React.FC<StepCounterProps> = ({ steps, goal }) => {
  const { styles, theme } = useStyles(stylesheet);
  const progress = goal > 0 ? Math.min(steps / goal, 1) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Footprints size={16} color={theme.colors.secondary} />
        </View>
        <Text style={styles.title}>Steps</Text>
      </View>
      
      <View style={styles.valueRow}>
        <Text style={styles.value}>{steps.toLocaleString()}</Text>
        <Text style={styles.goal}>/ {goal.toLocaleString()}</Text>
      </View>

      <ProgressBar 
        progress={progress} 
        color={theme.colors.secondary}
        height={6}
      />
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  iconContainer: {
    backgroundColor: `${theme.colors.secondary}20`,
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  title: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  value: {
    ...theme.typography.headingLg,
    color: theme.colors.text,
  },
  goal: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
}));
