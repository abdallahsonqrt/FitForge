import React from 'react';
import { View, Text } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { ProgressRing } from '../ui';
import { Flame } from 'lucide-react-native';

interface CalorieRingProps {
  consumed: number;
  target: number;
}

export const CalorieRing: React.FC<CalorieRingProps> = ({ consumed, target }) => {
  const { styles, theme } = useStyles(stylesheet);
  const progress = target > 0 ? Math.min(consumed / target, 1) : 0;
  const remaining = Math.max(target - consumed, 0);

  return (
    <View style={styles.container}>
      <ProgressRing
        progress={progress}
        size={140}
        strokeWidth={12}
        color={theme.colors.primary}
        backgroundColor={theme.colors.surfaceElevated}
      >
        <View style={styles.innerContent}>
          <Flame size={24} color={theme.colors.primary} style={styles.icon} />
          <Text style={styles.remainingValue}>{Math.round(remaining)}</Text>
          <Text style={styles.remainingLabel}>kcal left</Text>
        </View>
      </ProgressRing>
      
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{Math.round(consumed)}</Text>
          <Text style={styles.statLabel}>Eaten</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{Math.round(target)}</Text>
          <Text style={styles.statLabel}>Goal</Text>
        </View>
      </View>
    </View>
  );
};

const stylesheet = createStyleSheet((theme) => ({
  container: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  innerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    marginBottom: theme.spacing.xs,
  },
  remainingValue: {
    ...theme.typography.displayMd,
    color: theme.colors.text,
  },
  remainingLabel: {
    ...theme.typography.labelSm,
    color: theme.colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.lg,
    alignItems: 'center',
    width: '100%',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    ...theme.typography.headingMd,
    color: theme.colors.text,
  },
  statLabel: {
    ...theme.typography.bodySm,
    color: theme.colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.border,
  },
}));
